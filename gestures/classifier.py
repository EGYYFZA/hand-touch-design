"""Klasifikasi pose satu tangan: model terlatih kalau ada, aturan kalau tidak."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from gestures import features as F
from gestures import rules


class PoseClassifier:
    """`using_model` dipakai HUD untuk memberi tahu mana yang sedang aktif."""

    def __init__(self, model_path: str | Path, labels_path: str | Path) -> None:
        self.model_path = Path(model_path)
        self.labels_path = Path(labels_path)
        self.model = None
        self.labels: list[str] = list(rules.LABELS)
        self._load()

    @property
    def using_model(self) -> bool:
        return self.model is not None

    def _load(self) -> None:
        if not self.model_path.exists():
            return
        try:
            import joblib

            model = joblib.load(self.model_path)
        except Exception as exc:                      # model rusak / sklearn beda versi
            print(f"model tidak terpakai ({exc}); memakai aturan.")
            return

        if self.labels_path.exists():
            try:
                self.labels = json.loads(self.labels_path.read_text())
            except (OSError, ValueError) as exc:
                print(f"labels.json tidak terbaca ({exc}); memakai urutan bawaan.")

        self.model = model

    def predict(self, points: np.ndarray) -> tuple[str, float]:
        """-> (label, keyakinan). Keyakinan 1.0 untuk jalur aturan."""
        if self.model is None:
            return rules.classify(points), 1.0

        vec = F.normalize(points).reshape(1, -1)
        try:
            if hasattr(self.model, "predict_proba"):
                proba = self.model.predict_proba(vec)[0]
                idx = int(np.argmax(proba))
                label = str(self.model.classes_[idx])
                return label, float(proba[idx])
            return str(self.model.predict(vec)[0]), 1.0
        except Exception:
            # jangan sampai satu frame aneh mematikan aplikasi
            return rules.classify(points), 0.0
