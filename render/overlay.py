"""Gambaran di atas citra kamera: HUD, penanda ROI, dan kerangka tangan."""
from __future__ import annotations

import cv2
import numpy as np

from core.geometry import Rect
from core.tracker import HandData
from render import theme as T

# pasangan landmark MediaPipe yang membentuk kerangka tangan
BONES = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17),
]


def draw_hand(frame: np.ndarray, hand: HandData) -> None:
    """Kerangka penuh. Berguna untuk memeriksa tracking, ramai untuk dipakai."""
    pts = hand.points.astype(int)
    for a, b in BONES:
        cv2.line(frame, tuple(pts[a]), tuple(pts[b]), T.FAINT, 2, cv2.LINE_AA)
    for x, y in pts:
        cv2.circle(frame, (int(x), int(y)), 3, T.ACCENT, -1, cv2.LINE_AA)


def draw_pose_tag(frame: np.ndarray, hand: HandData) -> None:
    """Penanda ringkas: satu titik di telapak + nama pose.

    Pengganti kerangka penuh — cukup untuk tahu tangan terbaca dan pose apa
    yang dikenali, tanpa garis-garis yang menutupi wajah.
    """
    if not hand.pose or hand.pose == "none":
        return
    cx, cy = int(hand.points[9][0]), int(hand.points[9][1])
    cv2.circle(frame, (cx, cy), 7, T.ACCENT, -1, cv2.LINE_AA)
    cv2.circle(frame, (cx, cy), 12, T.ACCENT, 1, cv2.LINE_AA)
    w, _ = T.text_size(hand.pose, 0.42, 1)
    T.pill(frame, cx - (w + 24) // 2, cy + 20, hand.pose, 0.42, (255, 255, 255),
           T.INK, 0.75)


def draw_roi(frame: np.ndarray, shape: np.ndarray, label: str = "") -> None:
    """Garis tepi daerah yang kena efek, mengikuti bentuk yang dibuat jari."""
    poly = np.asarray(shape, dtype=np.int32).reshape(-1, 1, 2)
    if len(poly) < 3:
        return

    cv2.polylines(frame, [poly], True, T.ACCENT, 2, cv2.LINE_AA)
    # titik di tiap sudut = ujung jari yang membentuk daerah ini
    for point in poly.reshape(-1, 2):
        cv2.circle(frame, tuple(int(v) for v in point), 5, T.ACCENT, -1, cv2.LINE_AA)
        cv2.circle(frame, tuple(int(v) for v in point), 5, T.BG, 1, cv2.LINE_AA)

    if label:
        flat = poly.reshape(-1, 2)
        x = int(flat[:, 0].min())
        y = int(flat[:, 1].min())
        T.pill(frame, x, max(0, y - 34), label, 0.44, (255, 255, 255), T.ACCENT, 0.9)
