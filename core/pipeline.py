"""Perakitan seluruh node: kamera -> tracking -> gesture -> mode -> halaman."""
from __future__ import annotations

import time
from pathlib import Path

import cv2
import numpy as np
import yaml

from core.camera import CameraSource
from core.filters import OneEuroFilter
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
from storage.printer import print_photo

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

        self.reduced_motion = bool(self.settings.get("ui", {}).get("reduced_motion", False))
        self.page = page_render.Page(menu_cfg.get("items", []), reduced_motion=self.reduced_motion)
        self._cursor_filter = OneEuroFilter(min_cutoff=1.5, beta=0.015)

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
        self._toast_error = False
        self._mouse_hover: str | int | None = None
        self._pending_control: str | int | None = None
        self._camera_message = ""

    # ---------- siklus ----------

    def switch_to(self, mode_id: str) -> None:
        if mode_id == self.active_id or mode_id not in self.modes:
            return
        self.modes[self.active_id].on_exit()
        self.active_id = mode_id
        self.modes[mode_id].on_enter()
        self.toast(f"mode: {self.modes[mode_id].label}")

    def toast(self, message: str, seconds: float = 2.0, error: bool = False) -> None:
        self._toast = message
        self._toast_until = time.perf_counter() + seconds
        self._toast_error = error

    def _tick_fps(self) -> float:
        now = time.perf_counter()
        dt = now - self._last_time
        self._last_time = now
        if dt > 0:
            sample = 1.0 / dt
            self._fps = sample if self._fps == 0.0 else self._fps * 0.9 + sample * 0.1
        return max(dt, 0.0)

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
            if hit is not None:
                self.page.focused = hit
                self._pending_control = hit

    def _save(self, clean: np.ndarray | None) -> None:
        mode = self.modes[self.active_id]
        image, meta = mode.snapshot(clean)
        if image is None:
            self.toast("Kamera belum siap. Hubungkan kamera lalu coba lagi.", 3.0, error=True)
            return
        meta = {**meta, "fps": round(self._fps, 1)}
        try:
            path = self.ctx.exporter.save(image, meta)
        except (OSError, RuntimeError) as exc:
            self.toast(f"Gagal menyimpan: {exc}", 4.0, error=True)
            return
        mode.on_saved(path)
        self.toast(f"tersimpan: {path.name}")

    def _handle_key(self, key: int, clean: np.ndarray | None) -> bool:
        """Mouse, gestur, dan keyboard memakai jalur tindakan yang sama."""
        if key == NO_KEY:
            return False
        if key == 9:
            self.page.move_focus()
        elif key in (10, 13):
            target = self.page.focused
            if isinstance(target, str):
                self.switch_to(target)
            elif isinstance(target, int):
                return self._handle_key(target, clean)
        elif key in (ord("q"), ord("Q"), 27):
            if self.modes["photobooth"].phase == "error":
                self.switch_to("photobooth")
                self.toast("Foto belum tersimpan. S: coba lagi. R: buang sebelum keluar.", 4.0, error=True)
            else:
                return True
        elif key in (ord("c"), ord("C")) and clean is None:
            self.camera.stop()
            try:
                self.camera.start()
                self._camera_message = ""
            except (OSError, RuntimeError) as exc:
                self._camera_message = str(exc)
        elif key in (ord("s"), ord("S")):
            self._save(clean)
        elif key in (ord("p"), ord("P")):
            try:
                print_photo(self.ctx.exporter.last_saved)
                self.toast("Pratinjau cetak dibuka. Pilih printer di browser.", 4.0)
            except (OSError, RuntimeError) as exc:
                self.toast(str(exc), 4.0, error=True)
        elif key == ord(" ") and clean is None:
            self.toast("Hubungkan kamera sebelum memulai sesi foto.", 3.0, error=True)
        elif key in (ord("1"), ord("2"), ord("3"), ord("4")):
            self.switch_to(list(self.modes)[key - ord("1")])
        else:
            self.modes[self.active_id].handle_key(key)
        return False

    def _actions(self, camera_ready: bool) -> list[tuple[str, int]]:
        mode = self.modes[self.active_id]
        failed_photo = isinstance(mode, PhotoboothMode) and mode.phase == "error"
        actions = mode.actions() if camera_ready else [("Coba kamera lagi", ord("c"))]
        if not camera_ready and isinstance(mode, PhotoboothMode) and mode.phase in ("error", "counting"):
            actions += mode.actions()
        if self.ctx.exporter.last_saved is not None and not failed_photo:
            actions += [("Print foto", ord("p"))]
        return actions

    def run(self) -> None:
        window = "GestureCanvas"
        try:
            cv2.namedWindow(window, cv2.WINDOW_NORMAL | cv2.WINDOW_FREERATIO)
            cv2.resizeWindow(window, *self.page.size)
            cv2.setMouseCallback(window, self._on_mouse)
            mode = self.modes[self.active_id]
            self.page.actions = []
            cv2.imshow(window, self.page.render(
                None, active_id=self.active_id, hover_id=None, mode_label=mode.label,
                effect="", fps=0, hint=mode.hint(), status="",
                using_model=self.classifier.using_model, loading=True,
            ))
            cv2.waitKey(1)
            try:
                self.camera.start()
                self.ctx.frame_size = self.camera.size
            except (OSError, RuntimeError) as exc:
                self._camera_message = str(exc)

            while True:
                if cv2.getWindowProperty(window, cv2.WND_PROP_VISIBLE) < 1:
                    break
                _, _, ww, wh = cv2.getWindowImageRect(window)
                size = (max(960, ww), max(640, wh))
                if size != self.page.size:
                    self.page.resize(size)

                dt = self._tick_fps()
                frame = self.camera.read()
                mode = self.modes[self.active_id]
                clean, cam_out = None, None
                cursor, hover, chosen = None, None, None
                tracking = ""
                if frame is None:
                    mode.on_camera_wait(dt)
                    self._cursor_filter.reset()
                    self.tap.update(None)
                    self._fps = 0.0
                else:
                    self._camera_message = ""
                    cam_h, cam_w = frame.shape[:2]
                    hands = self.tracker.process(frame)
                    state = self.engine.update(hands)
                    if mode.wants_face:
                        state.face = self._face(frame)
                        tracking = "Wajah terdeteksi" if state.face else "Wajah belum terlihat"
                    else:
                        tracking = f"{len(hands)} tangan terdeteksi" if hands else "Tunjukkan tangan untuk mulai"
                    cam_out = mode.update(frame, state)
                    clean = cam_out.copy()
                    aim, tapped = self.tap.update(state.primary_hand())
                    if aim is not None:
                        target = np.asarray(self.page.finger_to_page(aim[0], aim[1], cam_w, cam_h), dtype=float)
                        point = target if self.reduced_motion else self._cursor_filter(target, dt)
                        px, py = int(point[0]), int(point[1])
                        hover = self.page.hit_test(px, py)
                        cursor = (px, py, hover is not None)
                        if tapped:
                            chosen = hover
                    else:
                        self._cursor_filter.reset()

                if self._pending_control is not None:
                    chosen, self._pending_control = self._pending_control, None
                if chosen is not None:
                    if isinstance(chosen, str):
                        self.switch_to(chosen)
                        continue
                    if self._handle_key(chosen, clean):
                        break

                mode = self.modes[self.active_id]
                self.page.actions = self._actions(frame is not None)
                toast = self._toast if time.perf_counter() < self._toast_until else ""
                out = self.page.render(
                    cam_out, active_id=self.active_id, hover_id=hover if hover is not None else self._mouse_hover,
                    mode_label=mode.label, effect=mode.effect_label(), fps=self._fps,
                    hint=mode.hint(), status=mode.status(), using_model=self.classifier.using_model,
                    cursor=cursor, armed=self.tap._armed, toast=toast, toast_error=self._toast_error,
                    camera_message=self._camera_message or "Tidak ada frame baru dari kamera.",
                    tracking=tracking,
                )
                cv2.imshow(window, out)
                if self._handle_key(cv2.waitKey(10 if frame is None else 1) & 0xFF, clean):
                    break
        finally:
            self.camera.stop()
            self.tracker.close()
            if self._face_tracker is not None:
                self._face_tracker.close()
            cv2.destroyAllWindows()
