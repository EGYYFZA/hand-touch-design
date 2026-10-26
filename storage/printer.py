"""Pratinjau cetak lokal; printer dan ukuran kertas dipilih di browser."""
from __future__ import annotations

import base64
import html
import webbrowser
from pathlib import Path


def print_photo(path: Path | None) -> Path:
    if path is None or not path.is_file():
        raise RuntimeError("Simpan foto terlebih dahulu sebelum mencetak.")
    if path.suffix.lower() != ".png":
        raise RuntimeError("Cetak hanya mendukung foto PNG tersimpan.")
    image = base64.b64encode(path.read_bytes()).decode("ascii")
    title = html.escape(path.name)
    preview = path.with_suffix(".print.html")
    preview.write_text(f'''<!doctype html>
<html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Cetak {title}</title>
<style>
body{{margin:24px;font:16px system-ui;text-align:center;background:#f3f6f5}}
img{{display:block;max-width:100%;max-height:85vh;margin:auto;object-fit:contain}}
button{{padding:12px 24px;margin:16px;border:0;border-radius:8px;background:#18694f;color:white;font:inherit}}
@page{{margin:10mm}} @media print{{body{{margin:0;background:white}} .controls{{display:none}} img{{max-height:270mm;max-width:190mm}}}}
</style><div class="controls"><p>{title}</p><button onclick="window.print()">Print foto</button>
<p>Pilih printer, ukuran kertas, dan skala pada dialog cetak.</p></div>
<img src="data:image/png;base64,{image}" alt="Foto tersimpan" onload="window.print()"></html>''', encoding="utf-8")
    if not webbrowser.open(preview.resolve().as_uri()):
        raise RuntimeError(f"Browser tidak dapat dibuka. Buka {preview.name} dari folder captures.")
    return preview
