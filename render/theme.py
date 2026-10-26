"""Tema visual: warna, tipografi, dan primitif bentuk.

Semua warna BGR, karena OpenCV. Nama warna menyebut PERAN, bukan rupa —
`SURFACE` bukan `abu_gelap` — supaya seluruh tampilan bisa diubah dari satu
tempat tanpa menyentuh berkas lain.
"""
from __future__ import annotations

from functools import lru_cache

import cv2
import numpy as np

PAD = 20
RADIUS = 16                     # sudut membulat bawaan

# ---------- palet (tema terang, gaya website) ----------
# Semua BGR. Nama menyebut PERAN, bukan rupa, jadi seluruh tampilan bisa diubah
# dari sini saja.

BG = (243, 246, 245)
SURFACE = (255, 255, 255)
SURFACE_HI = (232, 238, 235)
STROKE = (211, 219, 215)
SHADOW = (197, 207, 201)

INK = (38, 45, 35)
MUTED = (91, 105, 95)
FAINT = (110, 122, 113)

ACCENT = (79, 105, 24)
ACCENT_SOFT = (216, 237, 226)
GOOD = (67, 105, 25)
ON_GOOD = (255, 255, 255)
WARN = (20, 94, 153)
DANGER = (61, 57, 177)
ON_DANGER = (255, 255, 255)
NAV = (39, 43, 31)
NAV_HOVER = (55, 65, 48)
NAV_TEXT = (239, 246, 241)
NAV_MUTED = (176, 192, 181)
MINT = (185, 230, 161)
STAGE = (31, 34, 26)

PANEL = SURFACE                 # nama lama, masih dipakai beberapa modul

FONT = cv2.FONT_HERSHEY_SIMPLEX
FONT_MONO = cv2.FONT_HERSHEY_DUPLEX


# ---------- teks ----------

# Font Hershey bawaan OpenCV hanya punya glyph ASCII. Karakter lain digambar
# sebagai '??', jadi ditukar di sini — satu tempat, supaya tidak perlu ada
# aturan tak tertulis "jangan pakai tanda titik tengah" di seluruh berkas.
_ASCII = str.maketrans({
    "·": "-", "•": "-", "—": "-", "–": "-", "…": "...",
    "’": "'", "‘": "'", "“": '"', "”": '"', "×": "x", "→": "->",
})


def ascii_only(message: str) -> str:
    return str(message).translate(_ASCII).encode("ascii", "replace").decode("ascii")


def text(frame: np.ndarray, message: str, org: tuple[int, int], scale: float = 0.5,
         color: tuple[int, int, int] = INK, thickness: int = 1, font: int = FONT,
         shadow: bool = True) -> None:
    """Teks dengan bayangan tipis supaya terbaca di atas citra kamera apa pun."""
    message = ascii_only(message)
    x, y = int(org[0]), int(org[1])
    if shadow:
        cv2.putText(frame, message, (x + 1, y + 2), font, scale, (0, 0, 0),
                    thickness + 2, cv2.LINE_AA)
    cv2.putText(frame, message, (x, y), font, scale, color, thickness, cv2.LINE_AA)


def text_size(message: str, scale: float = 0.5, thickness: int = 1,
              font: int = FONT) -> tuple[int, int]:
    """Ukuran teks SETELAH disaring, supaya kotak di belakangnya tetap pas."""
    (w, h), _ = cv2.getTextSize(ascii_only(message), font, scale, thickness)
    return w, h


def text_center(frame: np.ndarray, message: str, center: tuple[int, int],
                scale: float = 0.5, color: tuple[int, int, int] = INK,
                thickness: int = 1, font: int = FONT, shadow: bool = True) -> None:
    w, h = text_size(message, scale, thickness, font)
    text(frame, message, (int(center[0] - w / 2), int(center[1] + h / 2)),
         scale, color, thickness, font, shadow=shadow)


# ---------- bentuk ----------

@lru_cache(maxsize=128)
def _rounded_mask(w: int, h: int, radius: int) -> np.ndarray:
    radius = max(0, min(int(radius), min(w, h) // 2))
    mask = np.zeros((h, w), dtype=np.uint8)
    if radius == 0:
        mask[:] = 255
        return mask
    cv2.rectangle(mask, (radius, 0), (w - radius, h), 255, -1)
    cv2.rectangle(mask, (0, radius), (w, h - radius), 255, -1)
    for cx, cy in ((radius, radius), (w - radius, radius),
                   (radius, h - radius), (w - radius, h - radius)):
        cv2.circle(mask, (cx, cy), radius, 255, -1, cv2.LINE_AA)
    return mask


def fit_text(message: str, width: int, scale: float = 0.5, thickness: int = 1) -> str:
    message = ascii_only(message)
    if text_size(message, scale, thickness)[0] <= width:
        return message
    while message and text_size(message + "...", scale, thickness)[0] > width:
        message = message[:-1]
    return message + "..." if message else ""


def rounded_rect(frame: np.ndarray, x: int, y: int, w: int, h: int,
                 color: tuple[int, int, int] = SURFACE, alpha: float = 1.0,
                 radius: int = RADIUS) -> None:
    """Kotak isi bersudut bulat, boleh semi transparan."""
    region, box = _region(frame, x, y, w, h)
    if region is None:
        return
    rx, ry, rw, rh = box
    mask = _rounded_mask(w, h, radius)[ry:ry + rh, rx:rx + rw, None] / 255.0
    fill = np.full_like(region, color, dtype=np.uint8)
    blended = fill.astype(np.float32) * (mask * alpha) + \
        region.astype(np.float32) * (1.0 - mask * alpha)
    region[:] = blended.astype(np.uint8)


def rounded_border(frame: np.ndarray, x: int, y: int, w: int, h: int,
                   color: tuple[int, int, int] = STROKE, thickness: int = 1,
                   radius: int = RADIUS) -> None:
    """Garis tepi bersudut bulat."""
    radius = max(0, min(int(radius), min(w, h) // 2))
    x2, y2 = x + w, y + h
    cv2.line(frame, (x + radius, y), (x2 - radius, y), color, thickness, cv2.LINE_AA)
    cv2.line(frame, (x + radius, y2), (x2 - radius, y2), color, thickness, cv2.LINE_AA)
    cv2.line(frame, (x, y + radius), (x, y2 - radius), color, thickness, cv2.LINE_AA)
    cv2.line(frame, (x2, y + radius), (x2, y2 - radius), color, thickness, cv2.LINE_AA)
    for (cx, cy), a in (((x + radius, y + radius), 180), ((x2 - radius, y + radius), 270),
                        ((x2 - radius, y2 - radius), 0), ((x + radius, y2 - radius), 90)):
        cv2.ellipse(frame, (cx, cy), (radius, radius), a, 0, 90, color, thickness, cv2.LINE_AA)


def soft_shadow(frame: np.ndarray, x: int, y: int, w: int, h: int,
                radius: int = RADIUS, spread: int = 10, offset: int = 4) -> None:
    """Bayangan lembut di bawah kartu, untuk kesan terangkat ala website.

    Digambar sebagai beberapa lapis rounded-rect makin besar makin tipis di
    bawah posisi kartu — murah dan tidak butuh blur penuh frame.
    """
    for i in range(spread, 0, -2):
        a = 0.05 * (1.0 - i / (spread + 2))
        rounded_rect(frame, x - i, y - i + offset, w + 2 * i, h + 2 * i,
                     SHADOW, a, radius=radius + i)


def glass(frame: np.ndarray, x: int, y: int, w: int, h: int,
          tint: tuple[int, int, int] = SURFACE, alpha: float = 0.55,
          radius: int = RADIUS, blur: int = 21) -> None:
    """Panel kaca buram: latar di belakangnya dikaburkan lalu diberi warna.

    Ini yang membuat HUD terbaca di atas citra kamera yang ramai tanpa harus
    menutupnya dengan kotak pekat.
    """
    region, box = _region(frame, x, y, w, h)
    if region is None:
        return
    rx, ry, rw, rh = box
    k = blur if blur % 2 == 1 else blur + 1
    blurred = cv2.GaussianBlur(region, (k, k), 0)
    tinted = blurred.astype(np.float32) * (1 - alpha) + \
        np.full_like(region, tint, dtype=np.uint8).astype(np.float32) * alpha

    mask = _rounded_mask(w, h, radius)[ry:ry + rh, rx:rx + rw, None] / 255.0
    region[:] = (tinted * mask + region.astype(np.float32) * (1 - mask)).astype(np.uint8)


def pill(frame: np.ndarray, x: int, y: int, message: str, scale: float = 0.46,
         fg: tuple[int, int, int] = INK, bg: tuple[int, int, int] = SURFACE_HI,
         alpha: float = 0.9, pad_x: int = 12, pad_y: int = 7) -> tuple[int, int]:
    """Label berbentuk kapsul. -> (lebar, tinggi) yang terpakai."""
    tw, th = text_size(message, scale, 1)
    w, h = tw + 2 * pad_x, th + 2 * pad_y
    rounded_rect(frame, x, y, w, h, bg, alpha, radius=h // 2)
    text(frame, message, (x + pad_x, y + pad_y + th), scale, fg, 1, shadow=False)
    return w, h


def rounded_progress(frame: np.ndarray, x: int, y: int, w: int, h: int, value: float,
                     color: tuple[int, int, int] = ACCENT, alpha: float = 0.55,
                     radius: int = RADIUS) -> None:
    """Isian yang tumbuh dari kiri tapi tetap terpotong bentuk kartu.

    Menggambar kotak biasa selebar `value` akan menonjol keluar dari sudut
    membulat kartunya. Di sini masker kartu utuh dibuat dulu, lalu kolom di
    kanan ambang dinolkan — jadi tepi isian selalu mengikuti lengkung kartu.
    """
    value = float(np.clip(value, 0.0, 1.0))
    if value <= 0:
        return
    region, box = _region(frame, x, y, w, h)
    if region is None:
        return
    rx, ry, rw, rh = box

    mask = _rounded_mask(w, h, radius).astype(np.float32) / 255.0
    mask[:, int(w * value):] = 0.0
    mask = mask[ry:ry + rh, rx:rx + rw, None]

    fill = np.full_like(region, color, dtype=np.uint8).astype(np.float32)
    region[:] = (fill * (mask * alpha) +
                 region.astype(np.float32) * (1 - mask * alpha)).astype(np.uint8)


def _region(frame: np.ndarray, x: int, y: int, w: int, h: int):
    """Potongan frame yang benar-benar ada, + offset di dalam kotak asli."""
    fh, fw = frame.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(fw, x + w), min(fh, y + h)
    if x1 <= x0 or y1 <= y0:
        return None, (0, 0, 0, 0)
    return frame[y0:y1, x0:x1], (x0 - x, y0 - y, x1 - x0, y1 - y0)
