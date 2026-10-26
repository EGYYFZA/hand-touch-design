"""Mode meme: gambar muncul saat ekspresi + gestur cocok.

Tidak ada galeri, tidak ada rekaman. Tiap meme punya pemicu tetap yang
menggabungkan gestur tangan dan ekspresi wajah:

    idea    telunjuk teracung ke atas  + senyum
    tongue  lidah dijulurkan
    clingy  satu jari didekatkan ke mulut + senyum
    shock   dua tangan di depan dada    + wajah kaget (mulut menganga, mata lebar)

Wajah dikenali lewat MediaPipe Face Landmarker (senyum, rahang, mata dari
blendshape; lidah dari warna karena tak ada blendshape-nya). Lihat core/face.py.
"""
from __future__ import annotations

import time

import cv2
import numpy as np

from gestures import features as F
from gestures.engine import GestureState
from modes.base import AppContext, Mode
from render import theme as T

# label Indonesia untuk tiap berkas
LABELS = {
    "idea": "Dapat ide!",
    "tongue": "Bleh!",
    "clingy": "Malu-malu",
    "shock": "Kaget!",
}
ORDER = ["idea", "tongue", "clingy", "shock"]

DEFAULTS = {
    "smile": 0.35,          # ambang senyum
    "shock": 0.35,          # ambang wajah kaget
    "tongue": 0.45,         # ambang lidah
    "near_mouth": 0.75,     # jarak jari ke mulut, kali lebar wajah (pipi ke pipi)
    "hold_seconds": 0.18,   # lama pemicu bertahan sebelum gambar muncul
    "release_margin": 0.6,  # skor jatuh ke bawah ambang*ini sebelum gambar hilang
}


def _triggers(state: GestureState, cfg: dict) -> dict[str, float]:
    """Skor 0..1 tiap meme untuk keadaan sekarang. 0 = tidak memicu."""
    face = state.face
    hands = state.hands
    scores = {name: 0.0 for name in ORDER}
    if face is None:
        return scores

    smile = face.smiling
    shock = face.shocked

    # idea: ada tangan dengan telunjuk teracung ke atas, sambil senyum
    if smile > 0:
        for h in hands:
            if F.index_points_up(h.points):
                scores["idea"] = float(smile)
                break

    # tongue: lidah menjulur (dari warna mulut)
    scores["tongue"] = float(face.tongue)

    # clingy: satu jari dekat mulut + senyum
    if face.mouth_center is not None:
        near = cfg["near_mouth"] * face.face_width
        for h in hands:
            tip = np.asarray(h.index_tip, dtype=float)
            if float(np.linalg.norm(tip - face.mouth_center)) < near:
                scores["clingy"] = float(smile)
                break

    # shock: dua tangan di bawah mulut (setinggi dada) + wajah kaget
    if face.mouth_center is not None and len(hands) >= 2:
        my = float(face.mouth_center[1])
        below = [h for h in hands if float(h.points[0][1]) > my]
        if len(below) >= 2:
            scores["shock"] = float(shock)

    return scores


class MemeMode(Mode):
    id = "meme"
    label = "Meme"
    wants_face = True

    def __init__(self, ctx: AppContext) -> None:
        super().__init__(ctx)
        self.cfg = {**DEFAULTS, **(ctx.settings.get("meme") or {})}
        self.scale = 0.42               # tinggi meme relatif tinggi frame
        self.show_meter = False
        self._scores: dict[str, float] = {}
        self._showing: str | None = None
        self._since: float | None = None
        self._candidate: str | None = None
        self._missing: set[str] = set()
        self._face_present = False

    def on_enter(self) -> None:
        self._showing = None
        self._since = None
        self._candidate = None

    def update(self, frame: np.ndarray, state: GestureState) -> np.ndarray:
        now = time.perf_counter()
        self._scores = _triggers(state, self.cfg)
        self._face_present = state.face is not None

        eligible = {name: score for name, score in self._scores.items()
                    if score >= self._threshold(name)}
        best = max(eligible, key=eligible.get) if eligible else None
        if self._showing is not None:
            keep = self._threshold(self._showing) * self.cfg["release_margin"]
            if self._scores.get(self._showing, 0.0) < keep:
                self._showing = None

        if best is not None and best != self._showing:
            if best != self._candidate:
                self._candidate, self._since = best, now
            if now - self._since >= self.cfg["hold_seconds"]:
                self._showing = best
                self._candidate, self._since = None, None
        else:
            self._candidate, self._since = None, None

        if self._showing:
            frame = self._draw_meme(frame)
        if self.show_meter:
            self._draw_meter(frame, state)
        return frame

    def _threshold(self, name: str) -> float:
        if name == "tongue":
            return self.cfg["tongue"]
        if name == "shock":
            return self.cfg["shock"]
        return self.cfg["smile"]      # idea & clingy dijaga ambang senyum

    def _draw_meme(self, frame: np.ndarray) -> np.ndarray:
        image = self.ctx.assets.sticker("memes", str(self._showing))
        if image is None:
            if self._showing not in self._missing:
                self._missing.add(str(self._showing))
                print(f"aset meme '{self._showing}' tidak ada di assets/memes/")
            return frame

        h, w = frame.shape[:2]
        target_h = int(h * self.scale)
        factor = target_h / max(image.shape[0], 1)
        iw = max(1, int(image.shape[1] * factor))
        ih = max(1, int(image.shape[0] * factor))
        resized = cv2.resize(image, (iw, ih), interpolation=cv2.INTER_AREA)

        x = w - iw - 24
        y = 24
        region = frame[y:y + ih, x:x + iw]
        if region.shape[:2] == (ih, iw):
            a = resized[:, :, 3:4].astype(np.float32) / 255.0
            region[:] = (resized[:, :, :3].astype(np.float32) * a +
                         region.astype(np.float32) * (1 - a)).astype(np.uint8)

        label = LABELS.get(self._showing, self._showing)
        lw, _ = T.text_size(label, 0.6, 2)
        T.pill(frame, x + (iw - lw - 28) // 2, y + ih + 8, label, 0.6,
               (255, 255, 255), T.ACCENT, 0.95)
        return frame

    def _draw_meter(self, frame: np.ndarray, state: GestureState) -> None:
        """Panel kecil kiri-bawah: ekspresi yang sedang terbaca."""
        face = state.face
        rows = [
            ("senyum", face.smiling if face else 0.0),
            ("kaget", face.shocked if face else 0.0),
            ("lidah", face.tongue if face else 0.0),
            ("mulut", face.jaw_open if face else 0.0),
            ("mata", face.eyes_wide if face else 0.0),
        ]
        pad, bw, rh = 14, 150, 20
        h = frame.shape[0]
        x, y = pad, h - pad - len(rows) * rh - 30

        T.rounded_rect(frame, x, y, bw + 24, len(rows) * rh + 34, T.INK, 0.55)
        head = "wajah terdeteksi" if face else "wajah tidak terlihat"
        T.text(frame, head, (x + 12, y + 20), 0.42, (255, 255, 255), 1, shadow=False)
        for i, (name, val) in enumerate(rows):
            ry = y + 30 + i * rh
            T.text(frame, name, (x + 12, ry + 13), 0.4, (235, 235, 235), 1, shadow=False)
            T.rounded_rect(frame, x + 60, ry + 3, bw - 56, 10, (90, 90, 90), 1.0, radius=5)
            T.rounded_progress(frame, x + 60, ry + 3, bw - 56, 10, float(val),
                               T.GOOD if val > 0.4 else T.ACCENT, 1.0, radius=5)

    # ---------- keterangan ----------

    def effect_label(self) -> str:
        if self._showing:
            return LABELS.get(self._showing, self._showing)
        return "-"

    def hint(self) -> str:
        return "Telunjuk + senyum: ide | Lidah: bleh | Jari di mulut: malu | Dua tangan: kaget"

    def status(self) -> str:
        ready = "wajah terdeteksi" if self._face_present else "wajah belum terlihat"
        return f"meme: {self._showing or '-'}  ({ready})"

    def handle_key(self, key: int) -> None:
        if key in (ord("m"), ord("M")):
            self.show_meter = not self.show_meter
        elif key in (ord("+"), ord("=")):
            self.scale = min(0.8, self.scale + 0.04)
        elif key in (ord("-"), ord("_")):
            self.scale = max(0.2, self.scale - 0.04)

    def snapshot(self, frame: np.ndarray | None) -> tuple[np.ndarray | None, dict]:
        return frame, {"mode": self.id, "meme": self._showing}
