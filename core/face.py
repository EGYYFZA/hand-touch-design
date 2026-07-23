"""Pembungkus MediaPipe Face Landmarker: ekspresi wajah + posisi mulut.

Dipakai mode meme untuk mengenali senyum, mulut menganga (shock), dan lidah
menjulur. MediaPipe memberi 52 "blendshape" ekspresi (senyum, rahang terbuka,
mata melebar, dll) plus 478 landmark wajah — mulut diambil dari landmark itu.

Modelnya (~3.7 MB) diunduh sekali saat pertama dijalankan, seperti model tangan.
"""
from __future__ import annotations

import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

# landmark mulut pada face mesh MediaPipe (478 titik)
MOUTH_LEFT = 61
MOUTH_RIGHT = 291
LIP_TOP = 13            # bibir dalam atas
LIP_BOTTOM = 14         # bibir dalam bawah
MOUTH_CENTER = 13       # acuan "dekat mulut"
CHEEK_LEFT = 454        # sisi kiri wajah (untuk lebar wajah)
CHEEK_RIGHT = 234       # sisi kanan wajah

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "face_landmarker.task"


def ensure_model(path: Path = MODEL_PATH) -> Path:
    """Unduh model Face Landmarker kalau belum ada. Sekali saja, ~3.7 MB."""
    if path.exists() and path.stat().st_size > 0:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"mengunduh model wajah ke {path} (sekali saja, ~3.7 MB)…")
    tmp = path.with_suffix(".part")
    try:
        urllib.request.urlretrieve(MODEL_URL, tmp)
        tmp.replace(path)
    except OSError as exc:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(
            f"gagal mengunduh model wajah: {exc}\n"
            f"Unduh manual dari {MODEL_URL} lalu simpan sebagai {path}"
        ) from exc
    print("selesai.")
    return path


@dataclass
class FaceData:
    """Satu wajah: ekspresi (blendshape) + titik mulut dalam piksel."""

    blendshapes: dict[str, float] = field(default_factory=dict)
    mouth_center: np.ndarray | None = None      # (x, y) piksel
    mouth_open: float = 0.0                     # tinggi bukaan / lebar mulut
    face_width: float = 1.0                     # piksel, untuk normalisasi jarak
    tongue: float = 0.0                         # 0..1, dari warna (bukan blendshape)

    def shape(self, *names: str) -> float:
        """Skor blendshape tertinggi dari beberapa nama alternatif, 0 kalau tak ada."""
        return max((self.blendshapes.get(n, 0.0) for n in names), default=0.0)

    @property
    def smiling(self) -> float:
        return 0.5 * (self.shape("mouthSmileLeft") + self.shape("mouthSmileRight"))

    @property
    def jaw_open(self) -> float:
        return self.shape("jawOpen")

    @property
    def eyes_wide(self) -> float:
        return 0.5 * (self.shape("eyeWideLeft") + self.shape("eyeWideRight"))

    @property
    def shocked(self) -> float:
        """Wajah kaget: terutama mulut menganga, dibantu mata/alis terangkat.

        Blendshape `eyeWide` MediaPipe jarang naik tinggi walau mata benar-benar
        melebar, jadi kalau dipakai sebagai syarat keras (min) skor kaget
        mentok rendah dan nyaris tak pernah tembus ambang. Mulut menganga jadi
        sinyal utama; mata/alis hanya menambah.
        """
        wide = max(self.eyes_wide, self.shape("browInnerUp"))
        return float(np.clip(0.75 * self.jaw_open + 0.5 * wide, 0.0, 1.0))


def _tongue_score(frame: np.ndarray, pts: np.ndarray, jaw_open: float) -> float:
    """Perkiraan lidah menjulur dari WARNA, karena MediaPipe tak punya blendshape-nya.

    Mulut yang cuma menganga menyisakan rongga gelap; lidah yang keluar mengisi
    bagian bawah mulut dengan permukaan merah muda yang terang. Jadi diukur:
    saat mulut terbuka, seberapa besar bagian bawah-mulut yang berwarna
    merah-muda terang, bukan gelap.
    """
    if jaw_open < 0.15:
        return 0.0

    import cv2

    top, bottom = pts[LIP_TOP], pts[LIP_BOTTOM]
    left, right = pts[MOUTH_LEFT], pts[MOUTH_RIGHT]
    width = float(np.linalg.norm(right - left)) or 1.0

    cx = float((top[0] + bottom[0]) / 2)
    # pusat contoh sedikit di bawah bibir bawah dalam: di situ lidah menonjol
    cy = float(bottom[1] + width * 0.10)
    half = int(max(4, width * 0.28))
    h, w = frame.shape[:2]
    x0, y0 = int(np.clip(cx - half, 0, w - 2)), int(np.clip(cy - half, 0, h - 2))
    x1, y1 = int(np.clip(cx + half, x0 + 1, w)), int(np.clip(cy + half, y0 + 1, h))

    patch = frame[y0:y1, x0:x1]
    if patch.size == 0:
        return 0.0

    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
    hue, sat, val = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    reddish = ((hue < 18) | (hue > 165)) & (sat > 70) & (val > 70)
    fill = float(np.mean(reddish))
    # fill ~0.15 saat mulut biasa, mendekati 0.5+ saat lidah penuh keluar
    return float(np.clip((fill - 0.18) / 0.32, 0.0, 1.0))


class FaceTracker:
    def __init__(self, detection_confidence: float = 0.5,
                 tracking_confidence: float = 0.5) -> None:
        from core.mpcompat import ensure_mediapipe_importable
        ensure_mediapipe_importable()
        import mediapipe as mp                              # impor mahal
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python import vision

        self._mp = mp
        model = ensure_model()

        options = vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model)),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=False,
            min_face_detection_confidence=float(detection_confidence),
            min_face_presence_confidence=float(detection_confidence),
            min_tracking_confidence=float(tracking_confidence),
        )
        self._landmarker = vision.FaceLandmarker.create_from_options(options)
        self._last_time = time.perf_counter()
        self._stamp = 0

    def process(self, frame: np.ndarray) -> FaceData | None:
        import cv2

        now = time.perf_counter()
        dt = now - self._last_time
        self._last_time = now
        self._stamp += max(1, int(dt * 1000))

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(image, self._stamp)

        if not result.face_landmarks:
            return None

        h, w = frame.shape[:2]
        lm = result.face_landmarks[0]
        pts = np.array([[p.x * w, p.y * h] for p in lm], dtype=float)

        blend: dict[str, float] = {}
        if result.face_blendshapes:
            for cat in result.face_blendshapes[0]:
                blend[cat.category_name] = float(cat.score)

        left, right = pts[MOUTH_LEFT], pts[MOUTH_RIGHT]
        top, bottom = pts[LIP_TOP], pts[LIP_BOTTOM]
        mouth_width = float(np.linalg.norm(right - left)) or 1.0
        # lebar wajah dari pipi ke pipi, jauh lebih besar dari lebar mulut —
        # inilah acuan yang benar untuk jarak "jari dekat mulut"
        face_width = float(np.linalg.norm(pts[CHEEK_LEFT] - pts[CHEEK_RIGHT])) or mouth_width

        return FaceData(
            blendshapes=blend,
            mouth_center=(top + bottom) / 2.0,
            mouth_open=float(np.linalg.norm(bottom - top)) / mouth_width,
            face_width=face_width,
            tongue=_tongue_score(frame, pts, blend.get("jawOpen", 0.0)),
        )

    def close(self) -> None:
        self._landmarker.close()
