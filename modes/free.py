"""Mode efek tangan: peta gesture di config/gestures.yaml langsung dipakai.

Daerah efek (blur/mosaik/flip) mengikuti ujung jari yang diluruskan, bukan
kotak tetap. Dua tangan L membentuk daerahnya; efeknya bekerja di dalamnya.
"""
from __future__ import annotations

import numpy as np

from effects import base as effects
from gestures.engine import GestureState
from modes.base import AppContext, Mode
from render.overlay import draw_hand, draw_pose_tag, draw_roi


class FreeMode(Mode):
    id = "free"
    label = "Efek Tangan"

    def __init__(self, ctx: AppContext) -> None:
        super().__init__(ctx)
        # kerangka penuh menutupi wajah dan tidak dibutuhkan untuk memakai
        # aplikasi; hanya alat pemeriksa tracking, jadi mati secara bawaan
        self.show_skeleton = False
        self.show_roi = True
        self._effect = ""
        shape_cfg = ctx.settings.get("shape") or {}
        self._compositor = effects.Compositor(
            feather=shape_cfg.get("feather", 17),
            smoothing=shape_cfg.get("smoothing", 0.55),
        )

    def on_enter(self) -> None:
        self._effect = ""
        self._compositor.reset()

    def update(self, frame: np.ndarray, state: GestureState) -> np.ndarray:
        combo = state.combo
        self._effect = combo.name if combo else ""

        if combo is not None:
            params = dict(combo.params)
            frame = self._compositor.apply(frame, combo, params)
            if self.show_roi and combo.shape is not None:
                draw_roi(frame, combo.shape, combo.name)
        else:
            self._compositor.reset()

        if self.show_skeleton:
            for hand in state.hands:
                draw_hand(frame, hand)
        else:
            for hand in state.hands:
                draw_pose_tag(frame, hand)
        return frame

    def effect_label(self) -> str:
        return {"blur_full": "Blur layar", "blur_box": "Blur area", "mosaic_box": "Mosaik", "flip_box": "Putar 180"}.get(self._effect, "Siap")

    def hint(self) -> str:
        return "Peace: blur | Dua L atas: blur area | L beda arah: mosaik | Dua L bawah: putar"

    def status(self) -> str:
        return f"Efek: {self.effect_label()}"

    def handle_key(self, key: int) -> None:
        if key in (ord("k"), ord("K")):
            self.show_skeleton = not self.show_skeleton
        elif key in (ord("b"), ord("B")):
            self.show_roi = not self.show_roi

    def snapshot(self, frame: np.ndarray | None) -> tuple[np.ndarray | None, dict]:
        return frame, {"mode": self.id, "effect": self._effect}
