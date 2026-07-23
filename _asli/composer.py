"""Menyusun pose per tangan menjadi kombinasi dua tangan.

Model hanya mengenali bentuk L (`l_shape`). Arah atas/bawah ditentukan di sini
secara geometris, supaya dataset tidak perlu memuat setiap rotasi.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from core.geometry import Rect, ensure_min_size, rect_from_points
from core.tracker import HandData
from gestures import features as F


def refine_pose(hand: HandData) -> str:
    """l_shape -> l_up / l_down berdasarkan arah telunjuk."""
    if hand.pose != "l_shape":
        return hand.pose
    direction = F.index_direction(hand.points)
    # sumbu y citra menghadap ke bawah, jadi y negatif = menunjuk ke atas
    return "l_up" if direction[1] < 0 else "l_down"


@dataclass
class Combo:
    name: str                 # 'blur_full' | 'blur_box' | 'mosaic_box' | 'flip_box' | ...
    rect: Rect | None = None
    strength: float = 1.0
    poses: tuple[str, ...] = ()


def frame_rect(hands: list[HandData], min_size: int, padding_ratio: float) -> Rect:
    """Kotak yang dibentuk dua tangan L. Ukurannya ikut ukuran tangan."""
    vertices = [F.l_vertex(h.points) for h in hands]
    tips = [h.index_tip for h in hands] + [h.thumb_tip for h in hands]
    rect = rect_from_points([np.asarray(v) for v in vertices + tips])

    palm = float(np.mean([h.palm_size for h in hands]))
    pad = int(palm * padding_ratio)
    rect = Rect(rect.x - pad, rect.y - pad, rect.w + 2 * pad, rect.h + 2 * pad)
    return ensure_min_size(rect, min_size)


def compose(hands: list[HandData], mapping: dict, roi_cfg: dict) -> Combo | None:
    """Cocokkan pose yang terdeteksi dengan config/gestures.yaml."""
    poses = [refine_pose(h) for h in hands]

    if len(hands) >= 2:
        two = mapping.get("two_hands", {})
        pair = {poses[0], poses[1]}
        for key, spec in two.items():
            wanted = {p.strip() for p in key.split("+")}
            if wanted == pair or (len(wanted) == 1 and pair == wanted):
                rect = frame_rect(
                    hands[:2],
                    min_size=roi_cfg.get("min_size", 120),
                    padding_ratio=roi_cfg.get("padding_ratio", 0.35),
                )
                return Combo(spec["effect"], rect=rect, poses=tuple(poses[:2]))

    single = mapping.get("single_hand", {})
    for hand, pose in zip(hands, poses):
        spec = single.get(pose)
        if spec is None:
            continue
        strength = float(np.clip(
            np.linalg.norm(hand.points[8] - hand.points[12]) / max(hand.palm_size, 1.0), 0.0, 2.0
        ))
        return Combo(spec["effect"], rect=None, strength=strength, poses=(pose,))

    return None
