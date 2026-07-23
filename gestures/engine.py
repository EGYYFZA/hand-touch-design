"""Mesin state gesture: klasifikasi -> histeresis -> kombinasi dua tangan."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from core.tracker import HandData
from gestures.classifier import PoseClassifier
from gestures.composer import Combo, compose


@dataclass
class GestureState:
    hands: list[HandData] = field(default_factory=list)
    combo: Combo | None = None
    face: object | None = None          # core.face.FaceData, hanya diisi mode meme

    @property
    def poses(self) -> list[str]:
        return [h.pose for h in self.hands]

    def hand_with_pose(self, pose: str) -> HandData | None:
        for hand in self.hands:
            if hand.pose == pose:
                return hand
        return None

    def primary_hand(self) -> HandData | None:
        """Tangan terbesar (paling dekat kamera). None kalau tidak ada."""
        if not self.hands:
            return None
        return max(self.hands, key=lambda h: h.palm_size)


class _Hysteresis:
    """Pose baru diakui setelah stabil `enter` frame, dilepas setelah `exit` frame.

    Tanpa ini efek berkedip setiap kali satu frame salah klasifikasi.
    """

    def __init__(self, enter_frames: int, exit_frames: int) -> None:
        self.enter = max(1, int(enter_frames))
        self.exit = max(1, int(exit_frames))
        self.current = "none"
        self._candidate = "none"
        self._streak = 0

    def update(self, observed: str) -> str:
        if observed == self.current:
            self._candidate = observed
            self._streak = 0
            return self.current

        if observed == self._candidate:
            self._streak += 1
        else:
            self._candidate = observed
            self._streak = 1

        # dari kosong cukup `enter` frame; meninggalkan pose yang sudah aktif
        # butuh `exit` frame supaya efek tidak lepas karena satu frame meleset
        needed = self.enter if self.current == "none" else self.exit
        if self._streak >= needed:
            self.current = self._candidate
            self._streak = 0

        return self.current


class GestureEngine:
    def __init__(self, classifier: PoseClassifier, gesture_map: dict, roi_cfg: dict,
                 enter_frames: int = 4, exit_frames: int = 8) -> None:
        self.classifier = classifier
        self.gesture_map = gesture_map or {}
        self.roi_cfg = roi_cfg or {}
        self.enter_frames = enter_frames
        self.exit_frames = exit_frames
        self._slots: dict[str, _Hysteresis] = defaultdict(self._new_slot)

    def _new_slot(self) -> _Hysteresis:
        return _Hysteresis(self.enter_frames, self.exit_frames)

    def update(self, hands: list[HandData]) -> GestureState:
        # kunci yang sama dengan yang dipakai penghalus landmark: sisi tangan,
        # bukan urutan daftar (lihat core/tracker.py)
        active: set[str] = set()
        for slot, hand in enumerate(hands):
            key = str(hand.meta.get("key", f"slot{slot}"))
            active.add(key)
            raw, score = self.classifier.predict(hand.points)
            hand.score = score
            hand.pose = self._slots[key].update(raw)

        # tangan yang hilang diarahkan kembali ke 'none' secara bertahap
        for key, hyst in self._slots.items():
            if key not in active:
                hyst.update("none")

        # Daerah efek TIDAK dihaluskan di sini. Bentuknya poligon yang jumlah
        # titiknya berubah tiap kali sebuah jari dianggap lurus atau tidak, jadi
        # tidak bisa dihaluskan titik per titik. Penghalusan dilakukan pada
        # maskernya di effects.base.Compositor, setelah bentuknya jadi gambar.
        combo = compose(hands, self.gesture_map, self.roi_cfg)
        return GestureState(hands=list(hands), combo=combo)


class TwoFingerTap:
    """Ketukan dua jari: rapatkan lalu renggangkan telunjuk & tengah.

    Menggantikan menahan-satu-detik. Telunjuk dan tengah diarahkan ke menu,
    lalu dirapatkan (jarak mengecil) dan direnggangkan lagi (jarak membesar) —
    saat merenggang itulah ketukan menyala, seperti klik yang lepas.

    Menghasilkan (titik_bidik, ketuk?) tiap frame. titik_bidik None kalau pose
    dua jari tidak sedang dibuat.
    """

    def __init__(self, close_gap: float = 0.35, open_gap: float = 0.7) -> None:
        # close_gap sengaja kecil: pose 'peace' yang santai (jarak ~0.38) TIDAK
        # dianggap dirapatkan, jadi tidak bentrok dengan blur_full di mode efek
        # tangan. Ketukan menuntut kedua jari benar-benar disatukan dulu.
        self.close_gap = float(close_gap)
        self.open_gap = float(open_gap)
        self._armed = False        # sudah dirapatkan, menunggu direnggangkan

    def update(self, hand) -> tuple[object | None, bool]:
        import numpy as np
        from gestures import features as F

        if hand is None or not F.is_two_fingers(hand.points):
            self._armed = False
            return None, False

        aim = F.two_finger_point(hand.points)
        gap = F.two_finger_gap(hand.points)

        tapped = False
        if gap < self.close_gap:
            self._armed = True
        elif gap > self.open_gap and self._armed:
            self._armed = False
            tapped = True

        return np.asarray(aim, dtype=float), tapped


