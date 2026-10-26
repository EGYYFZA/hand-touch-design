"""Pembungkus MediaPipe Hand Landmarker + penghalusan One Euro per tangan.

MediaPipe >= 0.10.30 menghapus API lama `mp.solutions.hands`; yang tersisa
hanya Tasks API, dan itu memerlukan berkas model `hand_landmarker.task`.
Berkasnya diunduh sekali saat pertama dijalankan lalu disimpan di models/.
"""
from __future__ import annotations

import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from core.filters import OneEuroFilter

# indeks landmark MediaPipe yang sering dipakai
WRIST = 0
THUMB_MCP = 2
THUMB_IP = 3
THUMB_TIP = 4
INDEX_MCP = 5
INDEX_PIP = 6
INDEX_TIP = 8
MIDDLE_MCP = 9
MIDDLE_PIP = 10
MIDDLE_TIP = 12
RING_PIP = 14
RING_TIP = 16
PINKY_MCP = 17
PINKY_PIP = 18
PINKY_TIP = 20

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "hand_landmarker.task"


def ensure_model(path: Path = MODEL_PATH) -> Path:
    """Unduh model Hand Landmarker kalau belum ada. Sekali saja, ~7 MB."""
    if path.exists() and path.stat().st_size > 0:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"mengunduh model tangan ke {path} (sekali saja, ~7 MB)…")
    tmp = path.with_suffix(".part")
    try:
        urllib.request.urlretrieve(MODEL_URL, tmp)
        tmp.replace(path)
    except OSError as exc:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(
            f"gagal mengunduh model tangan: {exc}\n"
            f"Unduh manual dari {MODEL_URL} lalu simpan sebagai {path}"
        ) from exc
    print("selesai.")
    return path


@dataclass
class HandData:
    """Satu tangan dalam koordinat piksel. `pose` diisi belakangan oleh engine."""

    points: np.ndarray                  # (21, 2) float, piksel
    handedness: str = "unknown"         # 'Left' | 'Right'
    pose: str = "none"
    score: float = 0.0
    meta: dict = field(default_factory=dict)

    @property
    def index_tip(self) -> tuple[float, float]:
        return float(self.points[INDEX_TIP][0]), float(self.points[INDEX_TIP][1])

    @property
    def thumb_tip(self) -> tuple[float, float]:
        return float(self.points[THUMB_TIP][0]), float(self.points[THUMB_TIP][1])

    @property
    def palm_size(self) -> float:
        """Skala acuan: jarak pergelangan ke pangkal jari tengah.

        Semua ambang jarak dibagi angka ini supaya tetap benar saat tangan
        mendekat atau menjauh dari kamera.
        """
        d = float(np.linalg.norm(self.points[MIDDLE_MCP] - self.points[WRIST]))
        return max(d, 1.0)


class HandTracker:
    def __init__(self, max_hands: int = 2, detection_confidence: float = 0.6,
                 tracking_confidence: float = 0.5, smoothing: dict | None = None) -> None:
        from core.mpcompat import ensure_mediapipe_importable
        ensure_mediapipe_importable()
        import mediapipe as mp                              # impor mahal
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python import vision

        self._mp = mp
        model = ensure_model()

        options = vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=int(max_hands),
            min_hand_detection_confidence=float(detection_confidence),
            min_hand_presence_confidence=float(detection_confidence),
            min_tracking_confidence=float(tracking_confidence),
        )
        self._landmarker = vision.HandLandmarker.create_from_options(options)

        smoothing = smoothing or {}
        self._smoothing_on = bool(smoothing.get("enabled", True))
        self._min_cutoff = float(smoothing.get("min_cutoff", 1.0))
        self._beta = float(smoothing.get("beta", 0.007))
        self._filters: dict[str, OneEuroFilter] = {}
        self._last_time = time.perf_counter()
        # mode VIDEO menuntut timestamp yang selalu menaik
        self._stamp = 0

    def _filter_for(self, key: str) -> OneEuroFilter:
        if key not in self._filters:
            self._filters[key] = OneEuroFilter(self._min_cutoff, self._beta)
        return self._filters[key]

    def process(self, frame: np.ndarray) -> list[HandData]:
        import cv2

        now = time.perf_counter()
        dt = now - self._last_time
        self._last_time = now
        self._stamp += max(1, int(dt * 1000))

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(image, self._stamp)

        if not result.hand_landmarks:
            # tangan hilang: buang state filter supaya tidak melompat saat kembali
            for f in self._filters.values():
                f.reset()
            return []

        h, w = frame.shape[:2]
        hands: list[HandData] = []
        used: set[str] = set()

        for slot, landmarks in enumerate(result.hand_landmarks):
            label, score = "unknown", 0.0
            if slot < len(result.handedness) and result.handedness[slot]:
                top = result.handedness[slot][0]
                label = top.category_name
                score = float(top.score)

            # state filter diikatkan ke SISI tangan, bukan urutannya dalam
            # daftar: urutan itu bisa tertukar antar frame, dan kalau tertukar
            # filter tangan kiri dipakai untuk tangan kanan lalu landmark
            # melompat jauh dalam satu frame
            key = label if label in ("Left", "Right") and label not in used else f"slot{slot}"
            used.add(key)

            pts = np.array([[lm.x * w, lm.y * h] for lm in landmarks], dtype=float)
            if self._smoothing_on:
                pts = self._filter_for(key)(pts, dt)

            hands.append(HandData(points=pts, handedness=label, score=score,
                                  meta={"key": key}))

        for key, smoothing_filter in self._filters.items():
            if key not in used:
                smoothing_filter.reset()
        return hands

    def close(self) -> None:
        self._landmarker.close()
