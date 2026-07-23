"""Perakitan seluruh node: kamera -> tracking -> gesture -> mode -> halaman."""
from __future__ import annotations

import time
from pathlib import Path

import cv2
import numpy as np
import yaml

from core.camera import CameraSource
from core.tracker import HandTracker
from gestures.engine import GestureEngine, TwoFingerTap
from gestures.classifier import PoseClassifier
from modes.base import AppContext
from modes.free import FreeMode
from modes.meme import MemeMode
from modes.painting import PaintingMode
from modes.photobooth import PhotoboothMode
from render import page as page_render
from storage.assets import AssetLibrary
from storage.exporter import Exporter

MODES = {m.id: m for m in (FreeMode, PaintingMode, PhotoboothMode, MemeMode)}
NO_KEY = 255                    # cv2.waitKey(1) & 0xFF saat tidak ada tombol


def load_yaml(path: str | Path) -> dict:
    """Baca YAML. Berkas hilang atau rusak jadi RuntimeError yang bisa dibaca."""
    path = Path(path)
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except FileNotFoundError as exc:
        raise RuntimeError(f"konfigurasi tidak ada: {path}") from exc
    except (OSError, yaml.YAMLError) as exc:
        raise RuntimeError(f"konfigurasi {path} tidak terbaca: {exc}") from exc


class Application:
    def __init__(self, config_dir: str | Path = "config", camera_index: int | None = None):
        config_dir = Path(config_dir)
        self.settings = load_yaml(config_dir / "settings.yaml")
        self.gesture_map = load_yaml(config_dir / "gestures.yaml")
        menu_cfg = load_yaml(config_dir / "menu.yaml")

        cam_cfg = dict(self.settings.get("camera", {}))
        if camera_index is not None:
            cam_cfg["index"] = camera_index

        self.camera = CameraSource(
            index=cam_cfg.get("index", 0),
            width=cam_cfg.get("width", 1280),
            height=cam_cfg.get("height", 720),
            fps=cam_cfg.get("fps", 30),
            mirror=cam_cfg.get("mirror", True),
        )

        tr = self.settings.get("tracker", {})
        self.tracker = HandTracker(
            max_hands=tr.get("max_hands", 2),
            detection_confidence=tr.get("detection_confidence", 0.6),
            tracking_confidence=tr.get("tracking_confidence", 0.5),
            smoothing=self.settings.get("smoothing", {}),
        )
        # dibuat saat pertama dibutuhkan (hanya mode meme), supaya mode lain
        # tidak menanggung ongkos memuat model wajah
        self._face_tracker = None
        self._last_face = None
        self._face_frame = 0
        self._face_every = max(1, int(self.settings.get("face", {}).get("every", 2)))

        paths = self.settings.get("paths", {})
        self.classifier = PoseClassifier(
            paths.get("model", "models/pose_model.joblib"),
            paths.get("labels", "models/labels.json"),
        )

        eng = self.settings.get("engine", {})
        self.engine = GestureEngine(
            self.classifier,
            self.gesture_map,
            self.settings.get("roi", {}),
            enter_frames=eng.get("enter_frames", 4),
            exit_frames=eng.get("exit_frames", 8),
        )

        self.ctx = AppContext(
            settings=self.settings,
            gesture_map=self.gesture_map,
            palette=menu_cfg.get("palette", []),
            assets=AssetLibrary(paths.get("assets", "assets")),
            exporter=Exporter(paths.get("captures", "captures")),
            frame_size=(cam_cfg.get("width", 1280), cam_cfg.get("height", 720)),
        )

        self.page = page_render.Page(menu_cfg.get("items", []))

        menu_settings = self.settings.get("menu", {})
        self.tap = TwoFingerTap(
            close_gap=menu_settings.get("tap_close", 0.35),
            open_gap=menu_settings.get("tap_open", 0.70),
        )

        self.modes = {mid: cls(self.ctx) for mid, cls in MODES.items()}
        self.active_id = "free"
        self.modes[self.active_id].on_enter()

        self._fps = 0.0
        self._last_time = time.perf_counter()
        self._toast = ""
        self._toast_until = 0.0
        self._mouse_hover: str | None = None
        self._pending_switch: str | None = None

    # ---------- siklus ----------

    def switch_to(self, mode_id: str) -> None:
        if mode_id == self.active_id or mode_id not in self.modes:
            return
        self.modes[self.active_id].on_exit()
        self.active_id = mode_id
        self.modes[mode_id].on_enter()
        self.toast(f"mode: {self.modes[mode_id].label}")

    def toast(self, message: str, seconds: float = 2.0) -> None:
        self._toast = message
        self._toast_until = time.perf_counter() + seconds

    def _tick_fps(self) -> None:
        now = time.perf_counter()
        dt = now - self._last_time
        self._last_time = now
        if dt > 0:
            sample = 1.0 / dt
            self._fps = sample if self._fps == 0.0 else self._fps * 0.9 + sample * 0.1

    def _face(self, frame: np.ndarray):
        """FaceData untuk frame ini, dengan lewat-frame supaya tetap ringan."""
        if self._face_tracker is None:
            from core.face import FaceTracker
            fc = self.settings.get("face", {})
            self._face_tracker = FaceTracker(
                detection_confidence=fc.get("detection_confidence", 0.5),
                tracking_confidence=fc.get("tracking_confidence", 0.5),
            )
        self._face_frame += 1
        if self._face_frame % self._face_every == 0 or self._last_face is None:
            self._last_face = self._face_tracker.process(frame)
        return self._last_face

    # ---------- mouse ----------

    def _on_mouse(self, event: int, x: int, y: int, flags: int, param) -> None:
        """Menu tetap bisa dipakai mouse, berguna saat menguji."""
        if event == cv2.EVENT_MOUSEMOVE:
            self._mouse_hover = self.page.hit_test(x, y)
        elif event == cv2.EVENT_LBUTTONDOWN:
            hit = self.page.hit_test(x, y)
            if hit:
                self._pending_switch = hit

    def _save(self, clean: np.ndarray) -> None:
        mode = self.modes[self.active_id]
        image, meta = mode.snapshot(clean)
        meta = {**meta, "fps": round(self._fps, 1)}
        try:
            path = self.ctx.exporter.save(image, meta)
        except (OSError, RuntimeError) as exc:
            self.toast(f"gagal menyimpan: {exc}", 3.0)
            return
        self.toast(f"tersimpan: {path.name}")

    def run(self) -> None:
        self.camera.start()
        width, height = self.camera.size
        self.ctx.frame_size = (width, height)

        window = "GestureCanvas"
        # AUTOSIZE menampilkan halaman 1:1, jadi koordinat mouse sama persis
        # dengan piksel halaman — hit-test menu tidak meleset.
        cv2.namedWindow(window, cv2.WINDOW_AUTOSIZE)
        cv2.setMouseCallback(window, self._on_mouse)

        try:
            while True:
                frame = self.camera.read()
                if frame is None:
                    if cv2.waitKey(10) & 0xFF in (ord("q"), 27):
                        break
                    continue

                cam_h, cam_w = frame.shape[:2]
                self._tick_fps()

                hands = self.tracker.process(frame)
                mode = self.modes[self.active_id]

                state = self.engine.update(hands)
                if getattr(mode, "wants_face", False):
                    state.face = self._face(frame)

                cam_out = mode.update(frame, state)
                clean = cam_out.copy()

                # ---- menu: ketukan dua jari ----
                aim, tapped = self.tap.update(state.primary_hand())
                cursor = None
                hover = None
                if aim is not None:
                    px, py = self.page.finger_to_page(aim[0], aim[1], cam_w, cam_h)
                    hover = self.page.hit_test(px, py)
                    cursor = (px, py, hover is not None)

                chosen = hover if (tapped and hover) else None
                if self._pending_switch:
                    chosen, self._pending_switch = self._pending_switch, None
                if chosen:
                    self.switch_to(chosen)
                    mode = self.modes[self.active_id]

                toast = self._toast if time.perf_counter() < self._toast_until else ""
                out = self.page.render(
                    cam_out,
                    active_id=self.active_id,
                    hover_id=hover or self._mouse_hover,
                    mode_label=mode.label,
                    effect=mode.effect_label(),
                    fps=self._fps,
                    hint=mode.hint(),
                    status=mode.status(),
                    using_model=self.classifier.using_model,
                    cursor=cursor,
                    armed=self.tap._armed,
                    toast=toast,
                )
                cv2.imshow(window, out)

                key = cv2.waitKey(1) & 0xFF
                if key == NO_KEY:
                    continue
                if key in (ord("q"), 27):
                    break
                if key in (ord("s"), ord("S")):
                    self._save(clean)
                elif key in (ord("1"), ord("2"), ord("3"), ord("4")):
                    ids = list(self.modes.keys())
                    idx = key - ord("1")
                    if idx < len(ids):
                        self.switch_to(ids[idx])
                else:
                    mode.handle_key(key)
        finally:
            self.camera.stop()
            self.tracker.close()
            if self._face_tracker is not None:
                self._face_tracker.close()
            cv2.destroyAllWindows()
