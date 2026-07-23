"""Membuat MediaPipe bisa diimpor walau matplotlib diblokir.

MediaPipe `tasks.python.vision` mengimpor matplotlib untuk fungsi menggambar 3D
yang tidak pernah kita pakai. Di sebagian mesin Windows, Smart App Control /
WDAC memblokir DLL terkompilasi matplotlib (`_image.pyd`), dan itu membuat
SELURUH paket vision gagal diimpor — bukan cuma fitur menggambarnya.

`ensure_mediapipe_importable()` mencoba matplotlib asli; kalau gagal, ia
memasang modul tiruan secukupnya agar impor mediapipe lolos. Fungsi 3D itu tetap
tak bisa dipakai, tapi kita memang tidak memakainya.
"""
from __future__ import annotations

import sys
import types

_done = False


def ensure_mediapipe_importable() -> None:
    global _done
    if _done:
        return
    _done = True

    try:
        import matplotlib.pyplot  # noqa: F401
        return                     # matplotlib asli berfungsi, tidak perlu tiruan
    except Exception as exc:       # noqa: BLE001 - DLL block muncul sebagai ImportError/OSError
        print(f"matplotlib tidak bisa dimuat ({type(exc).__name__}); "
              f"memakai tiruan agar MediaPipe tetap jalan.")

    matplotlib = types.ModuleType("matplotlib")
    matplotlib.__version__ = "0.0.0-stub"
    matplotlib.__path__ = []       # tandai sebagai paket agar submodul bisa diimpor

    def _unavailable(*_args, **_kwargs):
        raise RuntimeError("matplotlib dinonaktifkan pada mesin ini "
                           "(diblokir Application Control)")

    pyplot = types.ModuleType("matplotlib.pyplot")
    for name in ("figure", "axes", "show", "plot", "savefig", "subplots", "close"):
        setattr(pyplot, name, _unavailable)

    matplotlib.pyplot = pyplot
    sys.modules["matplotlib"] = matplotlib
    sys.modules["matplotlib.pyplot"] = pyplot
