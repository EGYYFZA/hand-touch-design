"""Menyusun pose per tangan menjadi kombinasi dua tangan.

Model hanya mengenali bentuk L (`l_shape`). Arah atas/bawah ditentukan di sini
secara geometris, supaya dataset tidak perlu memuat setiap rotasi.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
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
    rect: Rect | None = None          # kotak pembatas, dipakai efek untuk bekerja
    shape: np.ndarray | None = None   # poligon sebenarnya, mengikuti ujung jari
    strength: float = 1.0
    poses: tuple[str, ...] = ()
    params: dict = field(default_factory=dict)
    hand: HandData | None = None      # tangan pemicu, untuk efek yang mengikutinya


def _expand(hull: np.ndarray, pad: float) -> np.ndarray:
    """Dorong tiap titik menjauh dari pusat sejauh `pad` piksel."""
    center = hull.mean(axis=0)
    arm = hull - center
    length = np.linalg.norm(arm, axis=1, keepdims=True)
    return center + arm * (1.0 + pad / np.maximum(length, 1e-6))


def _grow_to_min(hull: np.ndarray, min_size: int) -> np.ndarray:
    """Besarkan seragam kalau kotak pembatasnya lebih kecil dari min_size."""
    rect = rect_from_points(list(hull))
    factor = max(min_size / max(rect.w, 1), min_size / max(rect.h, 1))
    if factor <= 1.0:
        return hull
    center = hull.mean(axis=0)
    return center + (hull - center) * factor


def frame_shape(hands: list[HandData], min_size: int,
                padding_ratio: float) -> tuple[np.ndarray, Rect]:
    """Daerah yang ditunjuk tangan. -> (poligon, kotak pembatasnya).

    Bentuknya mengikuti UJUNG JARI YANG DILURUSKAN, bukan kotak tetap: dua jari
    memberi daerah pipih, lima jari memberi daerah lebar, dan memiringkan
    tangan memiringkan daerahnya juga. Sudut L ikut dimasukkan sebagai jangkar
    supaya daerahnya tetap menempel pada tangan walau hanya satu jari yang
    lurus.
    """
    points: list[np.ndarray] = []
    for hand in hands:
        points.extend(F.extended_tips(hand.points))
        points.append(np.asarray(F.l_vertex(hand.points), dtype=float))

    palm = float(np.mean([h.palm_size for h in hands]))
    pad = palm * padding_ratio

    arr = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    if len(arr) >= 3:
        hull = cv2.convexHull(arr).reshape(-1, 2).astype(float)
    else:
        # kurang dari tiga titik tidak membentuk bidang; pakai kotak sebagai ganti
        base = ensure_min_size(rect_from_points(list(arr)), min_size)
        hull = np.array([[base.x, base.y], [base.x2, base.y],
                         [base.x2, base.y2], [base.x, base.y2]], dtype=float)

    hull = _grow_to_min(_expand(hull, pad), min_size)
    return hull, rect_from_points(list(hull))


def compose(hands: list[HandData], mapping: dict, roi_cfg: dict) -> Combo | None:
    """Cocokkan pose yang terdeteksi dengan config/gestures.yaml."""
    poses = [refine_pose(h) for h in hands]

    if len(hands) >= 2:
        two = mapping.get("two_hands", {})
        pair = {poses[0], poses[1]}
        for key, spec in two.items():
            # kunci 'a + b' dibaca sebagai himpunan, jadi urutan tangan bebas;
            # kunci 'a + a' menghasilkan himpunan satu elemen dan hanya cocok
            # kalau kedua pose memang sama
            wanted = {p.strip() for p in key.split("+")}
            if wanted == pair:
                shape, rect = frame_shape(
                    hands[:2],
                    min_size=roi_cfg.get("min_size", 120),
                    padding_ratio=roi_cfg.get("padding_ratio", 0.35),
                )
                return Combo(
                    spec["effect"],
                    rect=rect,
                    shape=shape,
                    poses=tuple(poses[:2]),
                    params=dict(spec.get("params", {})),
                    hand=hands[0],
                )

    single = mapping.get("single_hand", {})
    for hand, pose in zip(hands, poses):
        spec = single.get(pose)
        if spec is None:
            continue
        strength = float(np.clip(
            np.linalg.norm(hand.points[8] - hand.points[12]) / max(hand.palm_size, 1.0), 0.0, 2.0
        ))
        return Combo(
            spec["effect"],
            rect=None,
            strength=strength,
            poses=(pose,),
            params=dict(spec.get("params", {})),
            hand=hand,
        )

    return None
