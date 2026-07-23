"""Perakitan seluruh node: kamera -> tracking -> gesture -> mode -> layar."""
from __future__ import annotations

import time
from pathlib import Path

import cv2
import numpy as np
import yaml

from core.camera import CameraSource
from core.tracker import HandTracker
from gestures.classifier import PoseClassifier
from gestures.engine import DwellTimer, GestureEngine
from modes.base import AppContext
from modes.free import FreeMode
from modes.meme import MemeMode
from modes.painting import PaintingMode
from modes.photobooth import PhotoboothMode
from render import menu as menu_render
from render import theme as T
from render.overlay import draw_hud
from storage.assets import AssetLibrary
from storage.exporter import Exporter

MODES = {m.id: m for m in (FreeMode, PaintingMode, PhotoboothMode, MemeMode)}
MENU_ZONE_RATIO = 0.22          # bagian kanan frame yang jadi area menunjuk menu


def load_yaml(path: str | Path) -> dict:
    return yaml.safe_load(Path(path).read_text()) or {}


class Application:
    def __init__(self, config_dir: str | Path = "config", camera_index: int | None = None):
        config_dir = Path(config_dir)
        self.settings = load_yaml(config_dir / "settings.yaml")
        self.gesture_map = load_yaml(config_dir / "gestures.yaml")
        menu_cfg = load_yaml(config_dir / "menu.yaml")

        cam_cfg = self.settings.get("camera", {})
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

        menu_settings = self.settings.get("menu", {})
        self.panel = menu_render.MenuPanel(
            menu_cfg.get("items", []),
            width=menu_settings.get("width", 300),
            height=cam_cfg.get("height", 720),
        )
        self.dwell = DwellTimer(menu_settings.get("dwell_seconds", 1.2))

        self.modes = {mid: cls(self.ctx) for mid, cls in MODES.items()}
        self.active_id = "free"
        self.modes[self.active_id].on_enter()

        self._fps = 0.0
        self._last_time = time.perf_counter()
        self._toast = ""
        self._toast_until = 0.0

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
            self._fps = self._fps * 0.9 + (1.0 / dt) * 0.1

    def _menu_hover(self, frame: np.ndarray, state) -> str | None:
        """Telunjuk di pita kanan citra kamera dianggap menunjuk panel menu."""
        w = frame.shape[1]
        boundary = int(w * (1 - MENU_ZONE_RATIO))
        cv2.line(frame, (boundary, 0), (boundary, frame.shape[0]), T.FAINT, 1, cv2.LINE_AA)

        for hand in state.hands:
            if hand.pose != "point":
                continue
            x, y = hand.index_tip
            if x < boundary:
                continue
            hit = self.panel.hit_test(self.panel.width // 2, y)
            if hit:
                cv2.circle(frame, (int(x), int(y)), 10, T.ACCENT, 2, cv2.LINE_AA)
                return hit
        return None

    def run(self) -> None:
        self.camera.start()
        window = "GestureCanvas"
        cv2.namedWindow(window, cv2.WINDOW_NORMAL)
        cv2.setWindowProperty(window, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)

        try:
            while True:
                frame = self.camera.read()
                if frame is None:
                    if cv2.waitKey(10) & 0xFF in (ord("q"), 27):
                        break
                    continue

                self._tick_fps()
                hands = self.tracker.process(frame)
                state = self.engine.update(hands)

                mode = self.modes[self.active_id]
                frame = mode.update(frame, state)

                hover = self._menu_hover(frame, state)
                progress, chosen = self.dwell.update(hover)
                if chosen:
                    self.switch_to(chosen)

                draw_hud(
                    frame,
                    mode=mode.label,
                    effect=mode.effect_label(),
                    fps=self._fps,
                    using_model=self.classifier.using_model,
                    hint=mode.hint(),
                )
                if time.perf_counter() < self._toast_until:
                    T.text(frame, self._toast, (T.PAD, 38), 0.55, T.ACCENT, 1)

                panel = self.panel.render(
                    active_id=self.active_id,
                    hover_id=hover,
                    progress=progress,
                    palette=self.ctx.palette if self.active_id == "painting" else None,
                    palette_index=getattr(self.modes["painting"], "color_index", 0),
                    status=mode.status(),
                )
                cv2.imshow(window, menu_render.compose(frame, panel))

                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    break
                if key in (ord("s"), ord("S")):
                    image, meta = mode.snapshot(frame)
                    path = self.ctx.exporter.save(image, meta)
                    self.toast(f"tersimpan: {path.name}")
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
            cv2.destroyAllWindows()
