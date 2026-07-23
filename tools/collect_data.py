"""Kumpulkan dataset landmark untuk melatih model pose.

    python tools/collect_data.py

Tekan tombol angka sambil menahan pose di depan kamera. Setiap frame yang
tertangkap ditulis sebagai satu baris di data/dataset.csv.

    0 none        3 peace
    1 fist        4 point
    2 open_palm   5 l_shape
                  6 pinch

Tips: rekam 300-500 sampel per label, ubah-ubah jarak, sudut, dan pencahayaan.
Rekam juga tangan kiri dan kanan. Label `none` diisi pose acak yang bukan
gesture apa pun — ini yang membuat model tidak asal menebak.
"""
from __future__ import annotations

import csv
import sys
from collections import Counter
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.camera import CameraSource            # noqa: E402
from core.tracker import HandTracker            # noqa: E402
from gestures import features as F              # noqa: E402
from gestures.rules import LABELS               # noqa: E402
from render import theme as T                   # noqa: E402
from render.overlay import draw_hand            # noqa: E402

# selalu relatif ke akar proyek, bukan ke folder tempat perintah dijalankan —
# kalau tidak, dataset terpecah jadi dua berkas tanpa disadari
OUTPUT = ROOT / "data" / "dataset.csv"


def main() -> int:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    is_new = not OUTPUT.exists()

    counts: Counter[str] = Counter()
    if not is_new:
        with OUTPUT.open(newline="", encoding="utf-8") as fh:
            for row in csv.reader(fh):
                if row and row[0] != "label":
                    counts[row[0]] += 1

    camera = CameraSource().start()
    tracker = HandTracker(max_hands=1)
    file = OUTPUT.open("a", newline="", encoding="utf-8")
    writer = csv.writer(file)
    if is_new:
        writer.writerow(["label"] + [f"f{i}" for i in range(F.FEATURE_COUNT)])

    print(f"Menulis ke {OUTPUT}")
    print("Tekan 0-6 untuk merekam, Q untuk berhenti.")
    try:
        while True:
            frame = camera.read()
            if frame is None:
                # tetap layani tombol keluar walau kamera sedang tidak mengirim
                if cv2.waitKey(10) & 0xFF in (ord("q"), 27):
                    break
                continue

            hands = tracker.process(frame)
            for hand in hands:
                draw_hand(frame, hand)

            y = 40
            for i, label in enumerate(LABELS):
                T.text(frame, f"{i}  {label:<12} {counts[label]:>5}", (T.PAD, y), 0.5,
                       T.INK if counts[label] else T.MUTED, 1, T.FONT_MONO)
                y += 24
            T.text(frame, "tahan tombol angka sambil memperagakan pose",
                   (T.PAD, frame.shape[0] - 20), 0.45, T.MUTED, 1)

            cv2.imshow("Collect", frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            index = key - ord("0")
            if 0 <= index < len(LABELS) and hands:
                label = LABELS[index]
                writer.writerow([label] + [f"{v:.6f}" for v in F.normalize(hands[0].points)])
                file.flush()          # kalau proses ditutup paksa, data tetap ada
                counts[label] += 1
    finally:
        file.close()
        camera.stop()
        tracker.close()
        cv2.destroyAllWindows()

    print(f"Total tersimpan di {OUTPUT}:")
    for label, n in counts.most_common():
        print(f"  {label:<12} {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
