"""Registry efek.

Kontrak satu-satunya untuk semua efek: terima frame, kembalikan frame yang mau
dipakai. Efek BOLEH menulis langsung ke frame yang diterimanya — `apply` selalu
memberi salinan pribadi, jadi buffer kamera tidak pernah ikut berubah dan
pemanggil tetap memegang frame asli yang utuh.
"""
from __future__ import annotations

from typing import Callable

import cv2
import numpy as np

from core.geometry import Rect

EffectFn = Callable[[np.ndarray, "object", dict], np.ndarray]
REGISTRY: dict[str, EffectFn] = {}


def register(name: str) -> Callable[[EffectFn], EffectFn]:
    def wrap(fn: EffectFn) -> EffectFn:
        REGISTRY[name] = fn
        return fn
    return wrap


def get(name: str) -> EffectFn | None:
    return REGISTRY.get(name)


def apply(frame: np.ndarray, combo, params: dict) -> np.ndarray:
    """Jalankan efek bernama `combo.name`. Nama tak dikenal = frame apa adanya."""
    fn = REGISTRY.get(combo.name)
    if fn is None:
        return frame
    return fn(frame.copy(), combo, params)


def shape_mask(shape: np.ndarray, height: int, width: int, feather: int) -> np.ndarray:
    """Masker 0..1 dari poligon, tepinya dilembutkan."""
    mask = np.zeros((height, width), dtype=np.uint8)
    # tangan di tepi layar menghasilkan titik jauh di luar frame; dijepit dulu
    # supaya tidak ada koordinat ekstrem yang masuk ke fillConvexPoly
    poly = np.clip(np.asarray(shape, dtype=float),
                   [-width, -height], [2 * width, 2 * height])
    poly = poly.astype(np.int32).reshape(-1, 1, 2)
    cv2.fillConvexPoly(mask, poly, 255, cv2.LINE_AA)
    if feather > 0:
        k = feather * 2 + 1
        mask = cv2.GaussianBlur(mask, (k, k), 0)
    return mask.astype(np.float32) / 255.0


class Compositor:
    """Menjalankan efek lalu mengurungnya ke dalam bentuk yang ditunjuk jari.

    Efeknya sendiri tetap bekerja pada kotak pembatas — jauh lebih murah dan
    membuat setiap efek tetap sederhana. Yang membatasi ke bentuk sebenarnya
    adalah penggabungan di sini.

    Maskernya dihaluskan antar frame. Jumlah titik poligon berubah setiap kali
    sebuah jari dianggap lurus atau tidak, jadi titiknya tidak bisa dihaluskan
    satu per satu seperti landmark; yang dihaluskan gambarnya.
    """

    def __init__(self, feather: int = 17, smoothing: float = 0.55) -> None:
        self.feather = int(feather)
        self.smoothing = float(np.clip(smoothing, 0.0, 0.95))
        self._mask: np.ndarray | None = None
        self._effect = ""

    def reset(self) -> None:
        self._mask = None
        self._effect = ""

    def apply(self, frame: np.ndarray, combo, params: dict) -> np.ndarray:
        fn = REGISTRY.get(combo.name)
        if fn is None:
            return frame

        result = fn(frame.copy(), combo, params)
        if result is None or result.shape != frame.shape:
            # efek yang mengembalikan bentuk lain tidak bisa digabung; lebih
            # baik menolaknya daripada merobohkan seluruh aplikasi
            return frame
        if combo.shape is None or len(combo.shape) < 3:
            self.reset()
            return result

        h, w = frame.shape[:2]
        mask = shape_mask(combo.shape, h, w, self.feather)

        # efek berganti = bentuk baru; menyeretnya dari bentuk lama terlihat
        # seperti daerah yang meleleh dari satu tempat ke tempat lain
        if (self._mask is not None and self._effect == combo.name
                and self._mask.shape == mask.shape):
            a = self.smoothing
            mask = self._mask * a + mask * (1.0 - a)
        self._mask = mask
        self._effect = combo.name

        m = mask[:, :, None]
        return (result.astype(np.float32) * m +
                frame.astype(np.float32) * (1.0 - m)).astype(np.uint8)


def odd(value: float) -> int:
    """Kernel GaussianBlur wajib ganjil dan >= 1."""
    n = int(round(value))
    if n < 1:
        n = 1
    return n if n % 2 == 1 else n + 1


def safe_rect(rect: Rect | None, frame: np.ndarray) -> Rect | None:
    """Kotak yang dijamin ada di dalam frame dan tidak kosong, atau None."""
    if rect is None:
        return None
    h, w = frame.shape[:2]
    clipped = rect.clip(w, h)
    if clipped.w < 2 or clipped.h < 2:
        return None
    return clipped
