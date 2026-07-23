"""Penyimpan hasil ke folder captures/."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np


class Exporter:
    def __init__(self, directory: str | Path = "captures") -> None:
        self.directory = Path(directory)

    def save(self, image: np.ndarray, meta: dict | None = None) -> Path:
        """Tulis PNG (+ sidecar .json kalau ada meta). -> path file gambar."""
        self.directory.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
        path = self.directory / f"{stamp}.png"

        if not cv2.imwrite(str(path), image):
            raise RuntimeError(f"gagal menulis {path}")

        if meta:
            payload = dict(meta)
            payload["saved_at"] = datetime.now().isoformat(timespec="seconds")
            path.with_suffix(".json").write_text(
                json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
            )
        return path
