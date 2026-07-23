"""Pembacaan kamera di thread terpisah.

Efek berat tidak boleh menahan pengambilan frame, jadi thread ini terus membaca
dan hanya menyimpan frame terbaru. Pembaca yang lambat melewatkan frame lama,
bukan menumpuknya.
"""
from __future__ import annotations

import threading

import cv2
import numpy as np


class CameraSource:
    def __init__(self, index: int = 0, width: int = 1280, height: int = 720,
                 fps: int = 30, mirror: bool = True) -> None:
        self.index = int(index)
        self.requested = (int(width), int(height))
        self.fps = int(fps)
        self.mirror = bool(mirror)

        self._cap: cv2.VideoCapture | None = None
        self._frame: np.ndarray | None = None
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._running = False

    # ---------- resolusi ----------

    @property
    def size(self) -> tuple[int, int]:
        """Resolusi SEBENARNYA (w, h), bukan yang diminta.

        Banyak webcam diam-diam mengabaikan permintaan resolusi. Panel menu dan
        ROI harus ikut ukuran nyata, kalau tidak koordinatnya meleset.
        """
        if self._cap is None:
            return self.requested
        w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or self.requested[0]
        h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or self.requested[1]
        return w, h

    # ---------- siklus ----------

    def start(self) -> "CameraSource":
        if self._running:
            return self

        # CAP_DSHOW jauh lebih cepat dibuka di Windows daripada backend default
        backends = [cv2.CAP_DSHOW, cv2.CAP_ANY] if hasattr(cv2, "CAP_DSHOW") else [cv2.CAP_ANY]
        cap = None
        for backend in backends:
            candidate = cv2.VideoCapture(self.index, backend)
            if candidate.isOpened():
                cap = candidate
                break
            candidate.release()

        if cap is None:
            raise RuntimeError(
                f"kamera indeks {self.index} tidak bisa dibuka. "
                f"Coba --camera 1, atau tutup aplikasi lain yang memakai kamera."
            )

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.requested[0])
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.requested[1])
        cap.set(cv2.CAP_PROP_FPS, self.fps)

        ok, frame = cap.read()
        if not ok or frame is None:
            cap.release()
            raise RuntimeError(f"kamera indeks {self.index} terbuka tapi tidak mengirim frame.")

        self._cap = cap
        self._frame = self._prepare(frame)
        self._running = True
        self._thread = threading.Thread(target=self._loop, name="camera", daemon=True)
        self._thread.start()
        return self

    def _prepare(self, frame: np.ndarray) -> np.ndarray:
        return cv2.flip(frame, 1) if self.mirror else frame

    def _loop(self) -> None:
        while self._running and self._cap is not None:
            ok, frame = self._cap.read()
            if not ok or frame is None:
                continue
            prepared = self._prepare(frame)
            with self._lock:
                self._frame = prepared

    def read(self) -> np.ndarray | None:
        """Salinan frame terbaru, atau None kalau belum ada.

        Selalu menyalin: pemanggil bebas menggambar di atasnya tanpa merusak
        buffer yang sedang diisi ulang thread pembaca.
        """
        with self._lock:
            frame = self._frame
        return None if frame is None else frame.copy()

    def stop(self) -> None:
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=1.0)
            self._thread = None
        if self._cap is not None:
            self._cap.release()
            self._cap = None
