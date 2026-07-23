"""Kotak dan bantuan geometri dasar."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Rect:
    x: int
    y: int
    w: int
    h: int

    @property
    def x2(self) -> int:
        return self.x + self.w

    @property
    def y2(self) -> int:
        return self.y + self.h

    @property
    def center(self) -> tuple[int, int]:
        return self.x + self.w // 2, self.y + self.h // 2

    def slice(self, frame: np.ndarray) -> np.ndarray:
        return frame[self.y:self.y2, self.x:self.x2]

    def clip(self, width: int, height: int) -> "Rect":
        """Potong supaya tidak keluar dari citra. Bisa menghasilkan w/h nol."""
        x = max(0, min(self.x, width))
        y = max(0, min(self.y, height))
        x2 = max(x, min(self.x2, width))
        y2 = max(y, min(self.y2, height))
        return Rect(x, y, x2 - x, y2 - y)


def rect_from_points(points: list[np.ndarray]) -> Rect:
    """Kotak terkecil yang benar-benar MEMUAT semua titik.

    Batas bawah dibulatkan ke bawah dan batas atas ke atas. Dengan int() biasa
    keduanya dipotong ke arah nol, dan untuk koordinat negatif — tangan di tepi
    kiri atau atas layar — kotaknya jadi lebih kecil daripada titik-titiknya.
    """
    if len(points) == 0:
        return Rect(0, 0, 0, 0)
    arr = np.asarray(points, dtype=float).reshape(-1, 2)
    x0, y0 = np.floor(arr.min(axis=0)).astype(int)
    x1, y1 = np.ceil(arr.max(axis=0)).astype(int)
    return Rect(int(x0), int(y0), int(x1 - x0), int(y1 - y0))


def ensure_min_size(rect: Rect, min_size: int) -> Rect:
    """Lebarkan dari titik tengah kalau kotak terlalu kecil untuk dilihat."""
    w = max(rect.w, min_size)
    h = max(rect.h, min_size)
    cx, cy = rect.x + rect.w // 2, rect.y + rect.h // 2
    return Rect(cx - w // 2, cy - h // 2, w, h)
