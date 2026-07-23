"""Efek CPU berbasis OpenCV."""
from __future__ import annotations

import cv2
import numpy as np

from effects.base import odd, register, safe_rect
from gestures.composer import Combo
from storage.assets import paste_bgra


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
    """Dua tangan L tegak: hanya isi kotak yang dikaburkan."""
    rect = safe_rect(combo.rect, frame)
    if rect is None:
        return frame
    radius = odd(params.get("radius", 45))
    roi = rect.slice(frame)
    frame[rect.y:rect.y2, rect.x:rect.x2] = cv2.GaussianBlur(roi, (radius, radius), 0)
    return frame


@register("mosaic_box")
def mosaic_box(frame: np.ndarray, combo: Combo, params: dict) -> np.ndarray:
    """Satu L tegak + satu L terbalik: isi kotak jadi mosaik."""
    rect = safe_rect(combo.rect, frame)
    if rect is None:
        return frame
    blocks = max(4, int(params.get("blocks", 18)))
    roi = rect.slice(frame)
    small = cv2.resize(roi, (blocks, blocks), interpolation=cv2.INTER_LINEAR)
    frame[rect.y:rect.y2, rect.x:rect.x2] = cv2.resize(
        small, (rect.w, rect.h), interpolation=cv2.INTER_NEAREST
    )
    return frame


@register("flip_box")
def flip_box(frame: np.ndarray, combo: Combo, params: dict) -> np.ndarray:
    """Dua tangan L terbalik: isi kotak dibalik seperti cermin."""
    rect = safe_rect(combo.rect, frame)
    if rect is None:
        return frame
    axis = str(params.get("axis", "horizontal"))
    code = 1 if axis == "horizontal" else 0
    frame[rect.y:rect.y2, rect.x:rect.x2] = cv2.flip(rect.slice(frame), code)
    return frame


@register("overlay_image")
def overlay_image(frame: np.ndarray, combo: Combo, params: dict) -> np.ndarray:
    """Telapak terbuka: munculkan gambar dari assets/overlays."""
    library = params.get("_assets")
    hand = params.get("_hand")
    if library is None or hand is None:
        return frame

    image = library.load("overlays", params.get("asset", "default"))
    scale = float(params.get("scale", 1.4))
    # ukuran mengikuti besar telapak supaya proporsional saat maju-mundur
    target = hand.palm_size * 3.2 * scale
    factor = target / max(image.shape[1], 1)
    center = (int(hand.points[9][0]), int(hand.points[9][1]))
    return paste_bgra(frame, image, center, scale=factor)
