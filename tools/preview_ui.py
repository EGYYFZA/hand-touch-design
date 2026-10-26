"""Buat pratinjau UI dari frame sintetis, tanpa menyalakan kamera."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.pipeline import MODES, load_yaml
from gestures.engine import GestureState
from modes.base import AppContext
from render import theme as T
from render.page import Page
from storage.assets import AssetLibrary
from storage.exporter import Exporter


def sample_frame() -> np.ndarray:
    frame = np.full((720, 1280, 3), (175, 191, 184), np.uint8)
    cv2.rectangle(frame, (0, 480), (1280, 720), (118, 144, 129), -1)
    cv2.circle(frame, (1050, 175), 235, (192, 207, 200), -1, cv2.LINE_AA)
    points = np.array([[440, 640], [400, 430], [320, 370], [330, 330], [460, 385],
                       [440, 200], [470, 180], [510, 375], [535, 145], [565, 145],
                       [565, 380], [615, 210], [645, 220], [620, 410], [680, 300],
                       [705, 315], [660, 520], [615, 640]], np.int32)
    cv2.fillPoly(frame, [points], (137, 185, 212), cv2.LINE_AA)
    cv2.polylines(frame, [points], True, (102, 146, 169), 3, cv2.LINE_AA)
    T.text(frame, "FRAME SINTETIS / PRATINJAU UI", (48, 64), 0.6, T.INK, shadow=False)
    return frame


def main() -> int:
    output = ROOT / "docs" / "ui-preview"
    output.mkdir(parents=True, exist_ok=True)
    items = load_yaml(ROOT / "config" / "menu.yaml")["items"]
    ctx = AppContext(assets=AssetLibrary(ROOT / "assets"), exporter=Exporter(), frame_size=(1280, 720))
    for size in ((1120, 704), (960, 640)):
        page = Page(items, size, reduced_motion=True)
        for key, cls in MODES.items():
            mode = cls(ctx)
            frame = sample_frame()
            if key == "painting":
                for i in range(3):
                    cv2.ellipse(mode.canvas, (780, 420), (160 + i * 24, 100 + i * 18),
                                -20, 185, 350, ((75, 120, 230), (110, 165, 45), (210, 135, 45))[i], 10, cv2.LINE_AA)
                    cv2.ellipse(mode.mask, (780, 420), (160 + i * 24, 100 + i * 18),
                                -20, 185, 350, 255, 10, cv2.LINE_AA)
            rendered = mode.update(frame, GestureState())
            page.actions = mode.actions()
            page.focused = key
            image = page.render(rendered, active_id=key, hover_id=None, mode_label=mode.label,
                                effect=mode.effect_label(), fps=30, hint=mode.hint(),
                                status=mode.status(), using_model=False,
                                tracking="Wajah belum terlihat" if key == "meme" else "Tunjukkan tangan untuk mulai")
            assert cv2.imwrite(str(output / f"{key}-{size[0]}x{size[1]}.png"), image)
        for state, message in (("loading", "Menghubungkan kamera..."),
                               ("camera-error", "Kamera tidak mengirim frame baru."),
                               ("permission", "Kamera tidak dapat dibuka: periksa akses aplikasi.")):
            page.actions = [] if state == "loading" else [("Coba kamera lagi", ord("c"))]
            page.focused = ord("c")
            image = page.render(None, active_id="free", hover_id=None, mode_label="Efek Tangan",
                                effect="", fps=0, hint="Hubungkan kamera lalu tekan C untuk mencoba lagi.",
                                status="", using_model=False, camera_message=message, loading=state == "loading")
            assert cv2.imwrite(str(output / f"{state}-{size[0]}x{size[1]}.png"), image)
        photo = MODES["photobooth"](ctx)
        photo.shots = [sample_frame() for _ in range(3)]
        with patch.object(ctx.exporter, "save", side_effect=OSError("Ruang penyimpanan penuh")):
            photo._finish()
        for state in ("save-error", "success"):
            if state == "success":
                photo.on_saved(Path("foto-contoh.png"))
            page.actions = photo.actions()
            page.focused = ord("s")
            image = page.render(photo.update(sample_frame(), GestureState()), active_id="photobooth",
                                hover_id=None, mode_label=photo.label, effect=photo.effect_label(), fps=30,
                                hint=photo.hint(), status=photo.status(), using_model=False,
                                toast="Foto tersimpan di captures/" if state == "success" else "")
            assert cv2.imwrite(str(output / f"{state}-{size[0]}x{size[1]}.png"), image)
    print(f"Pratinjau frame sintetis: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
