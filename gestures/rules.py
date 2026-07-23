"""Klasifikasi cadangan berbasis aturan.

Dipakai sebelum ada model terlatih supaya aplikasi tetap bisa dicoba saat baru
dipasang. Kurang tahan terhadap sudut aneh dibanding model, tapi cukup untuk
pose-pose yang jelas.
"""
from __future__ import annotations

import numpy as np

from gestures import features as F

# Urutan ini adalah kontrak: tools/collect_data.py memakai indeksnya sebagai
# tombol angka 0-6, dan models/labels.json ditulis dengan urutan yang sama.
LABELS = ["none", "fist", "open_palm", "peace", "point", "l_shape", "pinch"]


def classify(points: np.ndarray) -> str:
    ext = F.finger_extended(points)
    count = sum(ext.values())

    # kepalan diperiksa lebih dulu: di kepalan jempol dan telunjuk juga
    # berdekatan, jadi kalau tidak, setiap kepalan akan terbaca 'pinch'
    if count == 0:
        return "fist"

    if F.pinch_distance(points) < 0.32:
        return "pinch"

    if count >= 4:
        return "open_palm"

    if ext["index"] and ext["middle"] and not ext["ring"] and not ext["pinky"]:
        return "peace"

    if ext["index"] and ext["thumb"] and not ext["middle"] and not ext["pinky"]:
        return "l_shape"

    if ext["index"] and count == 1:
        return "point"

    return "none"
