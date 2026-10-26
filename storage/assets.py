"""Pustaka gambar meme/photobooth, dibaca sekali lalu ditahan di memori."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

SUFFIXES = (".png", ".webp", ".jpg", ".jpeg")

# Aset tidak pernah digambar lebih besar dari beberapa ratus piksel, tapi berkas
# 2160x2160 memakan ~18 MB per gambar di memori dan memperlambat resize tiap
# frame. Dikecilkan sekali saat dibaca.
MAX_SIDE = 768
MEME_LABELS = {"idea": "IDE!", "tongue": "BLEH!", "clingy": "MALU", "shock": "KAGET!"}


def _meme_card(name: str) -> np.ndarray:
    """Stiker asli proyek; tidak memerlukan foto atau aset pihak ketiga."""
    image = np.zeros((320, 320, 4), dtype=np.uint8)
    color = {"idea": (185, 230, 161, 255), "tongue": (160, 199, 245, 255),
             "clingy": (206, 181, 236, 255), "shock": (229, 210, 161, 255)}[name]
    ink = (38, 45, 35, 255)
    cv2.circle(image, (160, 140), 102, color, -1, cv2.LINE_AA)
    cv2.circle(image, (160, 140), 102, ink, 3, cv2.LINE_AA)
    for x in (126, 194):
        cv2.circle(image, (x, 121), 8, ink, -1, cv2.LINE_AA)
    if name == "shock":
        cv2.ellipse(image, (160, 173), (16, 22), 0, 0, 360, ink, 3, cv2.LINE_AA)
    else:
        cv2.ellipse(image, (160, 150), (38, 35), 0, 15, 165, ink, 3, cv2.LINE_AA)
        if name == "tongue":
            cv2.ellipse(image, (160, 185), (15, 20), 0, 0, 360, (105, 100, 227, 255), -1, cv2.LINE_AA)
    label = MEME_LABELS[name]
    (width, _), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 1.1, 3)
    cv2.putText(image, label, ((320 - width) // 2, 293), cv2.FONT_HERSHEY_SIMPLEX, 1.1, ink, 3, cv2.LINE_AA)
    return image


def _placeholder(size: int = 220) -> np.ndarray:
    """Dipakai kalau folder assets masih kosong, supaya efek tetap kelihatan."""
    img = np.zeros((size, size, 4), dtype=np.uint8)
    cv2.circle(img, (size // 2, size // 2), size // 2 - 6, (80, 220, 255, 235), -1, cv2.LINE_AA)
    cv2.circle(img, (size // 2, size // 2), size // 2 - 6, (30, 30, 30, 255), 3, cv2.LINE_AA)
    cv2.putText(img, "?", (size // 2 - 22, size // 2 + 26),
                cv2.FONT_HERSHEY_SIMPLEX, 1.8, (30, 30, 30, 255), 4, cv2.LINE_AA)
    return img


class AssetLibrary:
    def __init__(self, root: str | Path = "assets") -> None:
        self.root = Path(root)
        self._cache: dict[tuple, np.ndarray | None] = {}

    @staticmethod
    def _safe(name: str) -> str | None:
        """Nama aset berasal dari config; jangan biarkan ia keluar dari assets/.

        `../../something` di config/gestures.yaml tidak boleh berubah jadi
        pembacaan berkas di luar folder proyek.
        """
        name = str(name).strip()
        if not name or name in (".", ".."):
            return None
        if "/" in name or "\\" in name or ".." in name or ":" in name:
            return None
        return name

    def load(self, category: str, name: str) -> np.ndarray | None:
        """Gambar BGRA, atau None kalau tidak ada. Hasil (termasuk None) di-cache."""
        key = (category, str(name))
        if key in self._cache:
            return self._cache[key]

        name = self._safe(name)
        category = self._safe(category)
        if name is None or category is None:
            self._cache[key] = None
            return None

        image = None
        base = self.root / category
        for suffix in SUFFIXES:
            path = base / f"{name}{suffix}"
            if path.exists():
                raw = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
                if raw is not None:
                    image = _shrink(_to_bgra(raw))
                break

        if image is None and category == "memes" and name in MEME_LABELS:
            image = _meme_card(name)
        if image is None and name == "default":
            image = _placeholder()

        self._cache[key] = image
        return image

    def sticker(self, category: str, name: str) -> np.ndarray | None:
        """Seperti load(), tapi gambar buram dibulatkan sudutnya. Hasilnya di-cache."""
        key = (category, str(name), "sticker")
        if key not in self._cache:
            base = self.load(category, name)
            self._cache[key] = None if base is None else as_sticker(base)
        return self._cache[key]


def _shrink(image: np.ndarray, max_side: int = MAX_SIDE) -> np.ndarray:
    side = max(image.shape[0], image.shape[1])
    if side <= max_side:
        return image
    factor = max_side / side
    size = (max(1, int(image.shape[1] * factor)), max(1, int(image.shape[0] * factor)))
    return cv2.resize(image, size, interpolation=cv2.INTER_AREA)


def _to_bgra(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2BGRA)
    if image.shape[2] == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
    return image


def has_transparency(image: np.ndarray, threshold: float = 0.02) -> bool:
    """Benar kalau alpha-nya benar-benar dipakai, bukan sekadar ada kanalnya.

    Banyak PNG punya kanal alpha yang isinya buram semua. Gambar seperti itu
    sama saja dengan gambar tiga kanal saat ditempel.
    """
    if image is None or image.ndim != 3 or image.shape[2] != 4:
        return False
    return bool((image[:, :, 3] < 250).mean() > threshold)


def as_sticker(image: np.ndarray, radius_ratio: float = 0.07,
               border: tuple[int, int, int] = (255, 255, 255)) -> np.ndarray:
    """Gambar buram -> kartu stiker bersudut bulat.

    Gambar meme biasanya foto persegi tanpa latar transparan. Ditempel apa
    adanya ia jadi kotak keras yang menutupi wajah; dibulatkan dan diberi tepi
    putih, kotak itu terbaca sebagai stiker yang memang disengaja.
    """
    img = _to_bgra(image)
    if has_transparency(img):
        return img

    h, w = img.shape[:2]
    radius = max(2, int(min(h, w) * radius_ratio))

    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.rectangle(mask, (radius, 0), (w - radius, h), 255, -1)
    cv2.rectangle(mask, (0, radius), (w, h - radius), 255, -1)
    for cx, cy in ((radius, radius), (w - radius, radius),
                   (radius, h - radius), (w - radius, h - radius)):
        cv2.circle(mask, (cx, cy), radius, 255, -1, cv2.LINE_AA)

    out = img.copy()
    out[:, :, 3] = mask

    thickness = max(2, int(min(h, w) * 0.012))
    cv2.rectangle(out, (thickness // 2, thickness // 2),
                  (w - thickness // 2, h - thickness // 2),
                  (*border, 255), thickness, cv2.LINE_AA)
    return out


def paste_bgra(frame: np.ndarray, image: np.ndarray, center: tuple[int, int],
               scale: float = 1.0, opacity: float = 1.0) -> np.ndarray:
    """Tempel gambar ber-alpha di titik tengah tertentu, dipotong di tepi frame.

    `opacity` di bawah 1 membuatnya menembus pandang — dipakai untuk memudarkan
    sesuatu sebelum hilang.
    """
    if image is None or scale <= 0 or opacity <= 0:
        return frame
    opacity = float(np.clip(opacity, 0.0, 1.0))

    w = max(1, int(image.shape[1] * scale))
    h = max(1, int(image.shape[0] * scale))
    if w > 4000 or h > 4000:                      # tangan sangat dekat kamera
        return frame

    resized = cv2.resize(image, (w, h), interpolation=cv2.INTER_AREA)

    x0 = int(center[0] - w // 2)
    y0 = int(center[1] - h // 2)
    fh, fw = frame.shape[:2]

    # potong bagian yang keluar frame di kedua sisi
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(fw, x0 + w), min(fh, y0 + h)
    if dx1 <= dx0 or dy1 <= dy0:
        return frame

    patch = resized[sy0:sy0 + (dy1 - dy0), sx0:sx0 + (dx1 - dx0)]
    alpha = (patch[:, :, 3:4].astype(np.float32) / 255.0) * opacity
    region = frame[dy0:dy1, dx0:dx1].astype(np.float32)
    blended = patch[:, :, :3].astype(np.float32) * alpha + region * (1.0 - alpha)
    frame[dy0:dy1, dx0:dx1] = blended.astype(np.uint8)
    return frame
