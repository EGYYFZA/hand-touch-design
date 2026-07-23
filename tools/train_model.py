"""Latih model pose dari data/dataset.csv.

    python tools/train_model.py

Menghasilkan models/pose_model.joblib dan models/labels.json. Aplikasi otomatis
memakainya saat dijalankan berikutnya.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DATASET = ROOT / "data" / "dataset.csv"
MODEL_OUT = ROOT / "models" / "pose_model.joblib"
LABELS_OUT = ROOT / "models" / "labels.json"

MIN_PER_LABEL = 30


def main() -> int:
    if not DATASET.exists():
        print(f"{DATASET} belum ada. Jalankan tools/collect_data.py dulu.")
        return 1

    import joblib
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import classification_report
    from sklearn.model_selection import train_test_split

    rows = np.genfromtxt(DATASET, delimiter=",", dtype=str, skip_header=1)
    if rows.size == 0:
        print("dataset kosong.")
        return 1
    rows = np.atleast_2d(rows)

    y = rows[:, 0]
    X = rows[:, 1:].astype(np.float32)

    labels, counts = np.unique(y, return_counts=True)
    print("Sampel per label:")
    for label, n in zip(labels, counts):
        flag = "  <- terlalu sedikit" if n < MIN_PER_LABEL else ""
        print(f"  {label:<12} {n}{flag}")

    if len(labels) < 2:
        print("Butuh minimal dua label berbeda untuk melatih.")
        return 1

    # stratify hanya mungkin kalau setiap label punya minimal 2 sampel
    stratify = y if counts.min() >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=stratify
    )

    model = RandomForestClassifier(
        n_estimators=300, min_samples_leaf=2, n_jobs=-1, random_state=42
    )
    model.fit(X_train, y_train)

    print()
    print(classification_report(y_test, model.predict(X_test), zero_division=0))

    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_OUT)
    LABELS_OUT.write_text(json.dumps(list(model.classes_), indent=2), encoding="utf-8")

    print(f"model  -> {MODEL_OUT}")
    print(f"labels -> {LABELS_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
