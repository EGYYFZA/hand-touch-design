"""Mode painting: mencubit jempol+telunjuk untuk menggambar, klik warna dengan jari.

Menempelkan ujung jempol dan telunjuk = pena turun; geser sambil menempel akan
menggambar garis mulus dengan warna terpilih. Melepas cubitan = pena naik.
Warna dipilih dengan mencubit di atas kotak warna yang berjajar di atas kanvas.
"""
from __future__ import annotations

import cv2
import numpy as np

from gestures import features as F
from gestures.engine import GestureState
from modes.base import AppContext, Mode
from render import theme as T

DEFAULT_PALETTE = [
    [80, 120, 240],    # merah-oranye
    [70, 180, 250],    # kuning
    [90, 200, 90],     # hijau
    [230, 170, 60],    # biru
    [200, 120, 210],   # ungu
    [40, 40, 40],      # hitam
]
SWATCH = 46
GAP = 12
BAR_Y = 16


class PaintingMode(Mode):
    id = "painting"
    label = "Painting"

    def __init__(self, ctx: AppContext) -> None:
        super().__init__(ctx)
        self.palette = [list(c) for c in (ctx.palette or DEFAULT_PALETTE)]
        self.color_index = 0
        self.eraser = False
        self.thickness = 8

        w, h = ctx.frame_size
        self.canvas = np.zeros((h, w, 3), dtype=np.uint8)
        self.mask = np.zeros((h, w), dtype=np.uint8)

        self._draw_pt: np.ndarray | None = None      # titik gambar yang dihaluskan
        self._last_pt: tuple[int, int] | None = None
        self._was_pinch = False

    # ---------- kanvas ----------

    def _fit(self, frame: np.ndarray) -> None:
        h, w = frame.shape[:2]
        if self.canvas.shape[:2] == (h, w):
            return
        self.canvas = cv2.resize(self.canvas, (w, h), interpolation=cv2.INTER_NEAREST)
        self.mask = cv2.resize(self.mask, (w, h), interpolation=cv2.INTER_NEAREST)

    def clear(self) -> None:
        self.canvas[:] = 0
        self.mask[:] = 0
        self._last_pt = None

    def on_enter(self) -> None:
        self._last_pt = None
        self._draw_pt = None
        self._was_pinch = False

    # ---------- kotak warna ----------

    def _swatch_rects(self, w: int) -> list[tuple[int, int, int, int, object]]:
        """Daftar (x, y, w, h, kunci). kunci = indeks warna, atau 'eraser'."""
        items: list = list(range(len(self.palette))) + ["eraser"]
        total = len(items) * SWATCH + (len(items) - 1) * GAP
        x0 = (w - total) // 2
        return [(x0 + i * (SWATCH + GAP), BAR_Y, SWATCH, SWATCH, key)
                for i, key in enumerate(items)]

    def _swatch_at(self, w: int, x: float, y: float):
        for sx, sy, sw, sh, key in self._swatch_rects(w):
            if sx <= x <= sx + sw and sy <= y <= sy + sh:
                return key
        return None

    def _select(self, key) -> None:
        if key == "eraser":
            self.eraser = True
        else:
            self.eraser = False
            self.color_index = int(key) % len(self.palette)

    @property
    def _color(self) -> list:
        return self.palette[self.color_index % len(self.palette)]

    # ---------- frame ----------

    def update(self, frame: np.ndarray, state: GestureState) -> np.ndarray:
        self._fit(frame)
        h, w = frame.shape[:2]
        hand = state.primary_hand()

        pinching = hand is not None and F.is_pinching(hand.points)
        raw = F.pinch_point(hand.points) if hand is not None else None

        if raw is not None:
            # haluskan titik gambar supaya garis tidak bergerigi
            if self._draw_pt is None:
                self._draw_pt = raw.astype(float)
            else:
                self._draw_pt = 0.5 * self._draw_pt + 0.5 * raw
        pt = None if self._draw_pt is None else (int(self._draw_pt[0]), int(self._draw_pt[1]))

        over_swatch = self._swatch_at(w, pt[0], pt[1]) if pt else None

        if pinching and over_swatch is not None:
            # cubitan baru di atas kotak warna = memilih, bukan menggambar
            if not self._was_pinch:
                self._select(over_swatch)
            self._last_pt = None
        elif pinching and pt is not None:
            self._paint(pt)
            self._last_pt = pt
        else:
            self._last_pt = None

        self._was_pinch = pinching

        out = self._blend(frame)
        self._draw_palette(out, w, hand is not None)
        if pt is not None:
            self._draw_cursor(out, pt, pinching)
        return out

    def _paint(self, pt: tuple[int, int]) -> None:
        if self.eraser:
            cv2.circle(self.canvas, pt, 28, (0, 0, 0), -1)
            cv2.circle(self.mask, pt, 28, 0, -1)
            return
        color = self._color
        if self._last_pt is not None:
            cv2.line(self.canvas, self._last_pt, pt, color, self.thickness, cv2.LINE_AA)
            cv2.line(self.mask, self._last_pt, pt, 255, self.thickness, cv2.LINE_AA)
        else:
            cv2.circle(self.canvas, pt, self.thickness // 2, color, -1, cv2.LINE_AA)
            cv2.circle(self.mask, pt, self.thickness // 2, 255, -1, cv2.LINE_AA)

    def _blend(self, frame: np.ndarray) -> np.ndarray:
        alpha = (self.mask.astype(np.float32) / 255.0)[:, :, None]
        out = self.canvas.astype(np.float32) * alpha + frame.astype(np.float32) * (1 - alpha)
        return out.astype(np.uint8)

    def _draw_palette(self, frame: np.ndarray, w: int, has_hand: bool) -> None:
        for sx, sy, sw, sh, key in self._swatch_rects(w):
            if key == "eraser":
                T.rounded_rect(frame, sx, sy, sw, sh, (245, 245, 245), 0.95, radius=12)
                T.text(frame, "hps", (sx + 8, sy + sh - 15), 0.42, (60, 60, 60), 1,
                       shadow=False)
                selected = self.eraser
            else:
                bgr = tuple(int(c) for c in self.palette[int(key)][:3])
                T.rounded_rect(frame, sx, sy, sw, sh, bgr, 1.0, radius=12)
                selected = (not self.eraser) and int(key) == self.color_index
            if selected:
                T.rounded_border(frame, sx - 3, sy - 3, sw + 6, sh + 6,
                                 (255, 255, 255), 3, radius=15)
                T.rounded_border(frame, sx - 3, sy - 3, sw + 6, sh + 6, T.ACCENT, 1,
                                 radius=15)

    def _draw_cursor(self, frame: np.ndarray, pt: tuple[int, int], pinching: bool) -> None:
        color = (245, 245, 245) if self.eraser else tuple(int(c) for c in self._color[:3])
        r = max(6, self.thickness) if pinching else 8
        cv2.circle(frame, pt, r, color, -1, cv2.LINE_AA)
        cv2.circle(frame, pt, r + 4, (255, 255, 255) if pinching else (200, 200, 200),
                   2, cv2.LINE_AA)

    # ---------- keterangan ----------

    def effect_label(self) -> str:
        return "penghapus" if self.eraser else f"kuas {self.thickness}px"

    def hint(self) -> str:
        return "Cubit: gambar / pilih warna | E: hapus | [ ]: kuas | R: bersihkan"

    def status(self) -> str:
        if self.eraser:
            return "warna: penghapus"
        return f"warna {self.color_index + 1}/{len(self.palette)}"

    def handle_key(self, key: int) -> None:
        if key in (ord("r"), ord("R")):
            self.clear()
        elif key == ord("["):
            self.thickness = max(2, self.thickness - 2)
        elif key == ord("]"):
            self.thickness = min(48, self.thickness + 2)
        elif key in (ord("e"), ord("E")):
            self.eraser = not self.eraser
        elif key in (ord("c"), ord("C")):
            self.eraser = False
            self.color_index = (self.color_index + 1) % len(self.palette)

    def snapshot(self, frame: np.ndarray | None) -> tuple[np.ndarray | None, dict]:
        return frame, {"mode": self.id, "color_index": self.color_index}
