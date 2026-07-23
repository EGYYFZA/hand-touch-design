"""Efek CPU berbasis OpenCV.

Semua fungsi di sini boleh menulis langsung ke `frame`: `effects.base.apply`
sudah menyerahkan salinan pribadi. Lihat effects/base.py untuk kontraknya.
"""
from __future__ import annotations

import cv2
import numpy as np

from effects.base import odd, register, safe_rect
from gestures.composer import Combo


@register("blur_full")
def blur_full(frame: np.ndarray, combo: Combo, params: dict) -> np.ndarray:
    """Dua jari: seluruh frame kabur. Kerapatan mengikuti jarak antar jari."""
    lo = int(params.get("min_radius", 9))
    hi = int(params.get("max_radius", 61))
    t = float(np.clip(combo.strength, 0.0, 1.4)) / 1.4
    radius = odd(lo + (hi - lo) * t)
    return cv2.GaussianBlur(frame, (radius, radius), 0)


@register("blur_box")
def blur_box(frame: np.ndarray, combo: Combo, params: dict) -> np.ndarray:
    """Dua tangan L tegak: hanya isi daerah yang dikaburkan."""
    rect = safe_rect(combo.rect, frame)
    if rect is None:
        return frame
    radius = odd(params.get("radius", 45))
    roi = rect.slice(frame)
    frame[rect.y:rect.y2, rect.x:rect.x2] = cv2.GaussianBlur(roi, (radius, radius), 0)
    return frame


@register("mosaic_box")
def mosaic_box(frame: np.ndarray, combo: Combo, params: dict) -> np.ndarray:
    """Satu L tegak + satu L terbalik: isi daerah jadi mosaik."""
    rect = safe_rect(combo.rect, frame)
    if rect is None:
        return frame

    blocks = max(2, int(params.get("blocks", 18)))
    if rect.w >= rect.h:
        cols = min(blocks, rect.w)
        rows = max(1, min(round(cols * rect.h / rect.w), rect.h))
    else:
        rows = min(blocks, rect.h)
        cols = max(1, min(round(rows * rect.w / rect.h), rect.w))

    roi = rect.slice(frame)
    small = cv2.resize(roi, (int(cols), int(rows)), interpolation=cv2.INTER_AREA)
    frame[rect.y:rect.y2, rect.x:rect.x2] = cv2.resize(
        small, (rect.w, rect.h), interpolation=cv2.INTER_NEAREST
    )
    return frame


@register("flip_box")
def flip_box(frame: np.ndarray, combo: Combo, params: dict) -> np.ndarray:
    """Dua tangan L terbalik: isi daerah diputar 180 derajat.

    Bukan sekadar cermin satu sumbu — dibalik kiri-kanan DAN atas-bawah
    sekaligus (`cv2.flip(..., -1)`), jadi terasa seperti membalikkan tangan,
    bukan mencerminkannya.
    """
    rect = safe_rect(combo.rect, frame)
    if rect is None:
        return frame
    frame[rect.y:rect.y2, rect.x:rect.x2] = cv2.flip(rect.slice(frame), -1)
    return frame
