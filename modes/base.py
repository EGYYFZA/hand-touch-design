"""Kontrak mode. Satu mode = satu file di folder ini."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from gestures.engine import GestureState
from storage.assets import AssetLibrary
from storage.exporter import Exporter


@dataclass
class AppContext:
    """Barang bersama yang dipakai semua mode."""

    settings: dict = field(default_factory=dict)
    gesture_map: dict = field(default_factory=dict)
    palette: list = field(default_factory=list)
    assets: AssetLibrary = None            # type: ignore[assignment]
    exporter: Exporter = None              # type: ignore[assignment]
    frame_size: tuple[int, int] = (1280, 720)


class Mode:
    id: str = "base"
    label: str = "Mode"
    wants_face: bool = False        # True kalau mode butuh deteksi wajah (meme)

    def __init__(self, ctx: AppContext) -> None:
        self.ctx = ctx

    # ---------- siklus ----------

    def on_enter(self) -> None:
        """Dipanggil saat mode jadi aktif."""

    def on_exit(self) -> None:
        """Dipanggil sebelum berpindah ke mode lain."""

    def update(self, frame: np.ndarray, state: GestureState) -> np.ndarray:
        """Olah satu frame. Kembalikan frame yang mau ditampilkan."""
        return frame

    # ---------- keterangan untuk HUD dan panel ----------

    def effect_label(self) -> str:
        return ""

    def hint(self) -> str:
        return ""

    def status(self) -> str:
        return ""

    # ---------- interaksi ----------

    def handle_key(self, key: int) -> None:
        """Tombol yang tidak ditangani pipeline. Hanya tombol nyata yang masuk."""

    def actions(self) -> list[tuple[str, int]]:
        return [("Simpan gambar", ord("s"))]

    def on_saved(self, path: Path) -> None:
        """Mode dapat memperbarui status setelah ekspor berhasil."""

    def on_camera_wait(self, seconds: float) -> None:
        """Jeda pekerjaan yang memerlukan frame kamera baru."""

    def snapshot(self, frame: np.ndarray | None) -> tuple[np.ndarray | None, dict]:
        """Citra bersih untuk disimpan + metadata. Frame yang masuk tanpa HUD."""
        return frame, {"mode": self.id}
