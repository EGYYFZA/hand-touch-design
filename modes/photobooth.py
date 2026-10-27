"""Mode photobooth: kepalkan tangan untuk memulai, tiga jepretan, jadi satu strip."""
from __future__ import annotations

import time
from pathlib import Path

import cv2
import numpy as np

from gestures.engine import GestureState
from modes.base import AppContext, Mode
from render import theme as T
from storage.assets import paste_bgra


def _stretch_bgra(base: np.ndarray, overlay: np.ndarray) -> np.ndarray:
    """Regangkan gambar ber-alpha ke seluruh ukuran base, lalu campur."""
    h, w = base.shape[:2]
    resized = cv2.resize(overlay, (w, h), interpolation=cv2.INTER_AREA)
    alpha = resized[:, :, 3:4].astype(np.float32) / 255.0
    out = resized[:, :, :3].astype(np.float32) * alpha + base.astype(np.float32) * (1 - alpha)
    return out.astype(np.uint8)

SHOTS = 3
COUNTDOWN = 3.0           # detik per hitungan mundur
REVIEW = 2.5              # detik menampilkan hasil sebelum kembali siaga


class PhotoboothMode(Mode):
    id = "photobooth"
    label = "Photobooth"

    def __init__(self, ctx: AppContext) -> None:
        super().__init__(ctx)
        self.phase = "idle"               # idle | counting | review | error
        self.shots: list[np.ndarray] = []
        self._deadline = 0.0
        self._strip: np.ndarray | None = None
        self._saved: str = ""

    def on_enter(self) -> None:
        if self.phase != "error":
            self.reset()

    def on_exit(self) -> None:
        if self.phase != "error":
            self.reset()

    def reset(self) -> None:
        self.phase = "idle"
        self.shots = []
        self._strip = None
        self._saved = ""

    def start(self) -> None:
        if self.phase != "idle":
            return
        self.phase = "counting"
        self.shots = []
        self._strip = None
        self._saved = ""
        self._deadline = time.perf_counter() + COUNTDOWN

    # ---------- frame ----------

    def update(self, frame: np.ndarray, state: GestureState) -> np.ndarray:
        now = time.perf_counter()

        if self.phase == "idle" and state.hand_with_pose("fist") is not None:
            self.start()

        if self.phase == "counting":
            remaining = self._deadline - now
            if remaining <= 0:
                # simpan frame BERSIH, sebelum angka hitung mundur digambar
                self.shots.append(self._decorate(frame.copy()))
                if len(self.shots) >= SHOTS:
                    self._finish()
                else:
                    self._deadline = now + COUNTDOWN
            else:
                self._draw_countdown(frame, remaining)

        elif self.phase in ("review", "error"):
            if self.phase == "review" and now >= self._deadline:
                self.reset()
            elif self._strip is not None:
                frame = self._draw_review(frame)

        return frame

    # ---------- hiasan dari assets/photobooth/ ----------

    def _decorate(self, shot: np.ndarray) -> np.ndarray:
        """Tempel assets/photobooth/frame.png kalau ada. Diregangkan sepenuh foto."""
        overlay = self.ctx.assets.load("photobooth", "frame")
        if overlay is None:
            return shot
        return _stretch_bgra(shot, overlay)

    def _stamp_logo(self, strip: np.ndarray) -> np.ndarray:
        logo = self.ctx.assets.load("photobooth", "logo")
        if logo is None:
            return strip
        target = strip.shape[1] * 0.22
        factor = target / max(logo.shape[1], 1)
        cx = int(strip.shape[1] - target / 2 - T.PAD)
        cy = int(strip.shape[0] - logo.shape[0] * factor / 2 - T.PAD)
        return paste_bgra(strip, logo, (cx, cy), scale=factor)

    def _finish(self) -> None:
        self._strip = self._stamp_logo(self._make_strip(self.shots))
        try:
            path = self.ctx.exporter.save(self._strip, {"mode": self.id, "shots": len(self.shots)})
            self.on_saved(path)
        except (OSError, RuntimeError) as exc:
            self._saved = f"gagal simpan: {exc}"
            self.phase = "error"

    def on_saved(self, path: Path) -> None:
        self._saved = path.name
        self.phase = "review"
        self._deadline = time.perf_counter() + REVIEW

    def on_camera_wait(self, seconds: float) -> None:
        if self.phase == "counting":
            self._deadline += seconds

    @staticmethod
    def _make_strip(shots: list[np.ndarray]) -> np.ndarray:
        """Susun vertikal dengan lebar seragam, walau resolusinya berbeda."""
        if not shots:
            return np.zeros((10, 10, 3), dtype=np.uint8)
        width = min(s.shape[1] for s in shots)
        rows = []
        for shot in shots:
            if shot.shape[1] != width:
                scale = width / shot.shape[1]
                shot = cv2.resize(shot, (width, int(shot.shape[0] * scale)))
            rows.append(shot)
            rows.append(np.full((12, width, 3), T.BG, dtype=np.uint8))
        return np.vstack(rows[:-1])

    def _draw_countdown(self, frame: np.ndarray, remaining: float) -> None:
        h, w = frame.shape[:2]
        cx, cy = w // 2, h // 2

        # cincin yang menyusut tiap detik, angka besar di tengahnya
        fraction = 1.0 - (remaining - int(remaining))
        cv2.circle(frame, (cx, cy), 92, T.STROKE, 3, cv2.LINE_AA)
        cv2.ellipse(frame, (cx, cy), (92, 92), -90, 0, int(360 * fraction),
                    T.ACCENT, 6, cv2.LINE_AA)

        digit = str(int(remaining) + 1)
        T.text_center(frame, digit, (cx, cy), 3.4, T.INK, 8)

        label = f"jepretan {len(self.shots) + 1} dari {SHOTS}"
        lw, _ = T.text_size(label, 0.5, 1)
        T.pill(frame, cx - (lw + 24) // 2, cy + 118, label, 0.5, T.INK, T.SURFACE, 0.85)

    def _draw_review(self, frame: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        strip = self._strip
        scale = (h - 2 * T.PAD) / strip.shape[0]
        preview = cv2.resize(strip, (max(1, int(strip.shape[1] * scale)), h - 2 * T.PAD))

        out = frame.copy()
        T.rounded_rect(out, 0, 0, w, h, T.BG, 0.72, radius=0)
        x = (w - preview.shape[1]) // 2
        out[T.PAD:T.PAD + preview.shape[0], x:x + preview.shape[1]] = preview
        T.rounded_border(out, x - 2, T.PAD - 2, preview.shape[1] + 4,
                         preview.shape[0] + 4, T.ACCENT_SOFT, 2, radius=10)
        return out

    # ---------- keterangan ----------

    def effect_label(self) -> str:
        return {"idle": "Siap", "counting": "Mengambil foto", "review": "Tersimpan", "error": "Belum tersimpan"}[self.phase]

    def hint(self) -> str:
        if self.phase == "idle":
            return "kepalkan tangan atau tekan Spasi untuk memulai"
        if self.phase == "counting":
            return f"bersiap... {len(self.shots)}/{SHOTS}"
        if self.phase == "error":
            return "Foto tetap disimpan di memori. S: coba simpan lagi. R: buang foto."
        return "hasil disimpan ke captures/"

    def status(self) -> str:
        if self.phase == "error":
            return self._saved
        return f"{len(self.shots)}/{SHOTS} jepretan"

    def actions(self) -> list[tuple[str, int]]:
        if self.phase == "error":
            return [("Coba simpan", ord("s")), ("Buang foto", ord("r"))]
        if self.phase == "counting":
            return [("Batalkan sesi", ord("r"))]
        if self.phase == "review":
            return [("Simpan salinan", ord("s")), ("Selesai", ord("r"))]
        return [("Mulai sesi", ord(" "))]

    def handle_key(self, key: int) -> None:
        if key == ord(" "):
            self.start()
        elif key in (ord("r"), ord("R")):
            self.reset()

    def snapshot(self, frame: np.ndarray | None) -> tuple[np.ndarray | None, dict]:
        if self._strip is not None:
            return self._strip, {"mode": self.id, "shots": len(self.shots)}
        return frame, {"mode": self.id}
