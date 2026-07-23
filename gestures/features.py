"""Fitur dari 21 landmark tangan.

Semua fitur tidak bergantung posisi maupun ukuran tangan di layar: titik
digeser ke pergelangan lalu dibagi ukuran telapak. Model yang dilatih dari
fitur ini tetap benar saat tangan di pojok layar atau jauh dari kamera.
"""
from __future__ import annotations

import numpy as np

from core.tracker import (INDEX_MCP, INDEX_PIP, INDEX_TIP, MIDDLE_MCP,
                          MIDDLE_PIP, MIDDLE_TIP, PINKY_MCP, PINKY_PIP,
                          PINKY_TIP, RING_PIP, RING_TIP, THUMB_IP, THUMB_MCP,
                          THUMB_TIP, WRIST)

FEATURE_COUNT = 42          # 21 landmark x (dx, dy)


def normalize(points: np.ndarray) -> np.ndarray:
    """(21,2) piksel -> 42 angka bebas posisi, skala, dan rotasi telapak."""
    pts = np.asarray(points, dtype=float).reshape(-1, 2)
    origin = pts[WRIST]
    rel = pts - origin

    scale = float(np.linalg.norm(pts[MIDDLE_MCP] - origin))
    rel = rel / max(scale, 1e-6)

    # putar supaya sumbu pergelangan->pangkal jari tengah selalu menghadap atas,
    # jadi pose yang sama dengan tangan miring tetap memberi fitur yang sama
    axis = rel[MIDDLE_MCP]
    angle = np.arctan2(axis[0], -axis[1])
    c, s = np.cos(-angle), np.sin(-angle)
    rot = np.array([[c, -s], [s, c]])
    rel = rel @ rot.T

    return rel.reshape(-1)


def shape_vector(points: np.ndarray) -> np.ndarray:
    """42 angka bebas posisi dan skala, tapi TIDAK bebas rotasi.

    Bedanya dengan normalize(): di sini tangan tidak diputar tegak. Untuk
    menilai kemiripan pose yang ditiru, arah tangan justru penting — telunjuk
    menunjuk ke atas dan ke bawah adalah dua peragaan yang berbeda, sementara
    normalize() sengaja menganggapnya sama.
    """
    pts = np.asarray(points, dtype=float).reshape(-1, 2)
    rel = pts - pts[WRIST]
    scale = float(np.linalg.norm(pts[MIDDLE_MCP] - pts[WRIST]))
    return (rel / max(scale, 1e-6)).reshape(-1)


# Bobot tiap landmark saat menilai kemiripan pose.
#
# Rata-rata polos atas 21 landmark tidak bisa dipakai: telapak tangan hampir
# sama bentuknya di semua pose, dan 12 landmark telapak itu menenggelamkan
# perbedaan yang justru menentukan. Ujung telunjuk yang bergerak sejauh 0.8
# telapak hanya menyumbang 0.038 pada rata-rata polos — lebih kecil daripada
# getaran tangan yang diam. Ujung jari diberi bobot terbesar, ruas tengah
# sedang, telapak kecil saja.
_W = np.ones(21) * 0.25                       # telapak dan pergelangan
_W[[3, 6, 7, 10, 11, 14, 15, 18, 19]] = 1.0   # ruas tengah dan atas
_W[[4, 8, 12, 16, 20]] = 3.0                  # ujung jari
_W = _W / _W.sum()


def shape_distance(a: np.ndarray, b: np.ndarray) -> float:
    """Jarak antar dua shape_vector, berbobot ke ujung jari."""
    pa = np.asarray(a, dtype=float).reshape(-1, 2)
    pb = np.asarray(b, dtype=float).reshape(-1, 2)
    if pa.shape != pb.shape or pa.shape[0] != _W.size:
        return float("inf")
    return float(np.dot(np.linalg.norm(pa - pb, axis=1), _W))


def index_direction(points: np.ndarray) -> np.ndarray:
    """Vektor satuan pangkal telunjuk -> ujung telunjuk."""
    pts = np.asarray(points, dtype=float)
    v = pts[INDEX_TIP] - pts[INDEX_MCP]
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-6 else np.array([0.0, -1.0])


def l_vertex(points: np.ndarray) -> np.ndarray:
    """Sudut siku huruf L: lekuk tempat jempol dan telunjuk bertemu.

    Bukan pangkal telunjuk itu sendiri — sudut yang terlihat mata ada sedikit
    ke arah jempol, dan di situlah pengguna mengira kotaknya bermula.
    """
    pts = np.asarray(points, dtype=float)
    return 0.65 * pts[INDEX_MCP] + 0.35 * pts[THUMB_MCP]


def finger_extended(points: np.ndarray) -> dict[str, bool]:
    """Jari mana yang lurus. Dipakai aturan cadangan.

    Jari lurus kalau ujungnya lebih jauh dari pergelangan daripada ruas
    tengahnya. Perbandingan, bukan ambang jarak — jadi tetap benar untuk tangan
    besar maupun kecil, dekat maupun jauh, tanpa angka yang perlu disetel.
    """
    pts = np.asarray(points, dtype=float)
    wrist = pts[WRIST]

    def straighter(tip: int, pip: int) -> bool:
        return bool(np.linalg.norm(pts[tip] - wrist) > np.linalg.norm(pts[pip] - wrist))

    # jempol membuka ke samping, bukan menjauhi pergelangan, jadi jaraknya
    # diukur dari pangkal kelingking di seberang telapak
    ref = pts[PINKY_MCP]
    thumb = bool(np.linalg.norm(pts[THUMB_TIP] - ref) > np.linalg.norm(pts[THUMB_IP] - ref))

    return {
        "thumb": thumb,
        "index": straighter(INDEX_TIP, INDEX_PIP),
        "middle": straighter(MIDDLE_TIP, MIDDLE_PIP),
        "ring": straighter(RING_TIP, RING_PIP),
        "pinky": straighter(PINKY_TIP, PINKY_PIP),
    }


TIP_OF = {
    "thumb": THUMB_TIP, "index": INDEX_TIP, "middle": MIDDLE_TIP,
    "ring": RING_TIP, "pinky": PINKY_TIP,
}


def extended_tips(points: np.ndarray) -> list[np.ndarray]:
    """Ujung jari yang sedang DILURUSKAN saja.

    Inilah titik-titik yang orang anggap sebagai batas daerah yang mereka
    tunjuk. Jari yang terlipat tidak ikut — ujungnya ada di depan telapak dan
    kalau ikut dihitung, bentuk yang muncul mengecil ke arah telapak.
    """
    pts = np.asarray(points, dtype=float)
    ext = finger_extended(pts)
    return [pts[idx] for name, idx in TIP_OF.items() if ext[name]]


def openness(points: np.ndarray) -> float:
    """0 = mengepal, 1 = telapak terbuka penuh. Dipakai efek bunga mekar."""
    pts = np.asarray(points, dtype=float)
    scale = max(float(np.linalg.norm(pts[MIDDLE_MCP] - pts[WRIST])), 1e-6)
    spread = float(np.mean([
        np.linalg.norm(pts[idx] - pts[WRIST]) for idx in TIP_OF.values()
    ])) / scale
    # batas diukur dari data: kepalan ~0.75, telapak terbuka ~1.75
    return float(np.clip((spread - 0.75) / (1.75 - 0.75), 0.0, 1.0))


def is_pointing(points: np.ndarray) -> bool:
    """Telunjuk lurus sementara jari tengah terlipat.

    Dipakai untuk menunjuk menu, bukan hasil klasifikasi pose. Klasifikasi
    melewati histeresis dan menuntut kelingking serta jari manis ikut terlipat
    rapi; untuk sekadar menunjuk, syarat seketat itu membuat menu terasa rusak.
    """
    ext = finger_extended(points)
    return bool(ext["index"] and not ext["middle"])


def is_two_fingers(points: np.ndarray) -> bool:
    """Telunjuk + tengah lurus, jari lain terlipat (pose 'V' atau '||')."""
    ext = finger_extended(points)
    return bool(ext["index"] and ext["middle"] and not ext["ring"] and not ext["pinky"])


def two_finger_gap(points: np.ndarray) -> float:
    """Jarak ujung telunjuk-tengah, dinormalisasi telapak. Kecil = dirapatkan."""
    pts = np.asarray(points, dtype=float)
    scale = max(float(np.linalg.norm(pts[MIDDLE_MCP] - pts[WRIST])), 1e-6)
    return float(np.linalg.norm(pts[INDEX_TIP] - pts[MIDDLE_TIP])) / scale


def two_finger_point(points: np.ndarray) -> np.ndarray:
    """Titik bidik ketukan dua jari: tengah-tengah ujung telunjuk dan tengah."""
    pts = np.asarray(points, dtype=float)
    return (pts[INDEX_TIP] + pts[MIDDLE_TIP]) / 2.0


def index_points_up(points: np.ndarray) -> bool:
    """Telunjuk lurus DAN mengarah ke atas (untuk meme 'idea')."""
    if not is_pointing(points):
        return False
    return bool(index_direction(points)[1] < -0.5)


def pinch_distance(points: np.ndarray) -> float:
    """Jarak jempol-telunjuk, dinormalisasi terhadap telapak."""
    pts = np.asarray(points, dtype=float)
    scale = max(float(np.linalg.norm(pts[MIDDLE_MCP] - pts[WRIST])), 1e-6)
    return float(np.linalg.norm(pts[THUMB_TIP] - pts[INDEX_TIP])) / scale


def pinch_point(points: np.ndarray) -> np.ndarray:
    """Titik cubit: tengah-tengah ujung jempol dan telunjuk. Ujung kuas melukis."""
    pts = np.asarray(points, dtype=float)
    return (pts[THUMB_TIP] + pts[INDEX_TIP]) / 2.0


def is_pinching(points: np.ndarray, threshold: float = 0.45) -> bool:
    """Jempol menempel ke telunjuk. Dipakai melukis dan memilih warna."""
    return pinch_distance(points) < threshold
