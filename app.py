"""Titik masuk aplikasi.

    python app.py                 # jalankan dengan config default
    python app.py --camera 1      # pakai kamera lain
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

MIN_PY = (3, 9)
MAX_PY = (3, 12)


def check_python() -> str | None:
    """MediaPipe hanya punya wheel untuk Python 3.9 - 3.12.

    Diperiksa di sini karena kegagalannya jauh dari sebabnya: menjalankan
    `python -m venv .venv` dengan Python bawaan sistem yang lebih baru akan
    membuat venv yang tidak cocok dengan paket di dalamnya, dan galat yang
    muncul kemudian berbunyi soal numpy, bukan soal versi Python.
    """
    current = sys.version_info[:2]
    if MIN_PY <= current <= MAX_PY:
        return None
    return (
        f"Python {current[0]}.{current[1]} tidak didukung MediaPipe "
        f"(butuh {MIN_PY[0]}.{MIN_PY[1]} - {MAX_PY[0]}.{MAX_PY[1]}).\n"
        f"  Interpreter: {sys.executable}\n"
        f"  Buat ulang venv dengan Python 3.12:\n"
        f"      py -3.12 -m venv .venv\n"
        f"      .venv\\Scripts\\python.exe -m pip install -r requirements.txt\n"
        f"  Lalu jalankan lewat .venv\\Scripts\\python.exe, bukan `python`."
    )


def main() -> int:
    problem = check_python()
    if problem:
        print(problem)
        return 1

    parser = argparse.ArgumentParser(description="GestureCanvas")
    parser.add_argument("--camera", type=int, default=None, help="indeks kamera")
    parser.add_argument("--config", default="config", help="folder konfigurasi")
    args = parser.parse_args()

    # diimpor SETELAH versi Python diperiksa: impor ini menarik numpy,
    # OpenCV, dan MediaPipe, yang justru akan gagal duluan pada versi
    # yang salah dan menutupi pesan di atas dengan traceback
    try:
        from core.pipeline import Application
    except ImportError as exc:
        print(f"Gagal memuat pustaka: {exc}")
        print("  Pasang dependensi: .venv\\Scripts\\python.exe -m pip install -r requirements.txt")
        return 1

    try:
        Application(config_dir=args.config, camera_index=args.camera).run()
    except (RuntimeError, OSError) as exc:
        # config hilang/rusak dan kamera gagal dibuka masuk ke sini; jangan
        # menyemburkan traceback untuk hal yang bisa dijelaskan satu kalimat
        print(f"Gagal memulai: {exc}")
        return 1
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
