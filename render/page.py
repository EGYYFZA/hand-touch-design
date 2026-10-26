"""Workspace desktop: navigasi, panggung kamera, status, dan tindakan mode."""
from __future__ import annotations

import time

import cv2
import numpy as np

from render import theme as T

MODE_DETAILS = {
    "free": ("Blur & mosaik", "Peace untuk blur. Dua tangan L untuk efek area."),
    "painting": ("Kanvas bebas", "Cubit untuk melukis. Lepaskan untuk mengangkat pena."),
    "photobooth": ("3 foto, 1 strip", "Ambil tiga foto dengan hitung mundur otomatis."),
    "meme": ("Ekspresi wajah", "Padukan ekspresi wajah dan gerakan tangan."),
}
SHORTCUTS = {ord(" "): "Spasi", ord("s"): "S", ord("r"): "R", ord("c"): "C", ord("p"): "P"}


class Page:
    def __init__(self, items: list[dict], size: tuple[int, int] = (1120, 704),
                 reduced_motion: bool = False) -> None:
        self.items = list(items)
        self.reduced_motion = reduced_motion
        self.actions: list[tuple[str, int]] = [("Simpan gambar", ord("s"))]
        self.focused: str | int | None = None
        self._hover: dict[str, float] = {}
        self._last_render = time.perf_counter()
        self.resize(size)

    def resize(self, size: tuple[int, int]) -> None:
        self.width, self.height = max(960, size[0]), max(640, size[1])
        self.nav_w = 216
        self.content_x = self.nav_w + 28
        self.content_w = self.width - self.content_x - 28
        self.stage = (self.content_x, 132, self.content_w, self.height - 308)
        mask = T._rounded_mask(self.stage[2], self.stage[3], 16)
        corners = (slice(0, 16), slice(-16, None))
        self._stage_corners = [(ys, xs, mask[ys, xs, None].astype(np.float32) / 255.0)
                               for ys in corners for xs in corners]
        self._bg = self._build_bg()

    @property
    def size(self) -> tuple[int, int]:
        return self.width, self.height

    def _build_bg(self) -> np.ndarray:
        page = np.full((self.height, self.width, 3), T.BG, dtype=np.uint8)
        page[:, :self.nav_w] = T.NAV
        cv2.rectangle(page, (26, 30), (50, 58), T.MINT, 2, cv2.LINE_AA)
        cv2.line(page, (33, 49), (43, 39), T.MINT, 2, cv2.LINE_AA)
        T.text(page, "Gesture", (64, 43), 0.62, T.NAV_TEXT, shadow=False)
        T.text(page, "Canvas", (64, 67), 0.62, T.MINT, shadow=False)
        cv2.line(page, (24, 100), (self.nav_w - 24, 100), T.NAV_HOVER, 1)
        T.text(page, "PILIH MODE", (26, 132), 0.36, T.NAV_MUTED, shadow=False)
        cv2.line(page, (24, self.height - 170), (self.nav_w - 24, self.height - 170), T.NAV_HOVER, 1)
        for offset, message in ((144, "KONTROL CEPAT"), (112, "1-4    Pilih mode"),
                                (86, "Tab    Pindah tombol"), (60, "Enter  Pilih tombol"), (34, "Esc    Keluar")):
            T.text(page, message, (26, self.height - offset), 0.36,
                   T.NAV_MUTED, shadow=False)
        T.text(page, "STUDIO KREATIF", (self.content_x, 38), 0.36, T.MUTED, shadow=False)
        return page

    def nav_item_rect(self, index: int) -> tuple[int, int, int, int]:
        return 16, 152 + index * 74, self.nav_w - 32, 62

    def action_rects(self) -> list[tuple[int, tuple[int, int, int, int]]]:
        x, y = self.content_x, self.height - 76
        rects = []
        for label, key in self.actions:
            shortcut = SHORTCUTS.get(key, chr(key).upper())
            width = max(166, T.text_size(label, 0.48)[0] + T.text_size(shortcut, 0.37)[0] + 64)
            rects.append((key, (x, y, width, 48)))
            x += width + 12
        return rects

    def hit_test(self, px: float, py: float) -> str | int | None:
        targets = [(str(item.get("id", "")), self.nav_item_rect(i)) for i, item in enumerate(self.items)]
        for value, (x, y, w, h) in targets + self.action_rects():
            if x <= px < x + w and y <= py < y + h:
                return value
        return None

    def move_focus(self) -> None:
        values = [str(item.get("id", "")) for item in self.items] + [key for _, key in self.actions]
        if not values:
            return
        index = values.index(self.focused) + 1 if self.focused in values else 0
        self.focused = values[index % len(values)]

    def finger_to_page(self, fx: float, fy: float, cam_w: int, cam_h: int) -> tuple[int, int]:
        return (int(np.clip(fx / max(cam_w, 1), 0, 1) * (self.width - 1)),
                int(np.clip(fy / max(cam_h, 1), 0, 1) * (self.height - 1)))

    def render(self, cam_frame: np.ndarray | None, *, active_id: str,
               hover_id: str | int | None, mode_label: str, effect: str, fps: float,
               hint: str, status: str, using_model: bool,
               cursor: tuple[int, int, bool] | None = None,
               armed: bool = False, toast: str = "", toast_error: bool = False,
               camera_message: str = "", loading: bool = False, tracking: str = "") -> np.ndarray:
        page = self._bg.copy()
        if isinstance(self.focused, int) and self.focused not in [key for _, key in self.actions]:
            self.focused = None
        now = time.perf_counter()
        step = 1.0 if self.reduced_motion else min(1.0, (now - self._last_render) / 0.12)
        self._last_render = now
        self._draw_nav(page, active_id, hover_id, step)
        T.text(page, mode_label, (self.content_x, 79), 0.94, T.INK, 2, shadow=False)
        if effect and effect not in ("Siap", "-"):
            title_w = T.text_size(mode_label, 0.94, 2)[0]
            failed = effect == "Belum tersimpan"
            T.pill(page, self.content_x + title_w + 18, 59, effect, 0.33,
                   T.ON_DANGER if failed else T.ACCENT,
                   T.DANGER if failed else T.ACCENT_SOFT)
        T.text(page, MODE_DETAILS.get(active_id, ("", ""))[1], (self.content_x, 107),
               0.42, T.MUTED, shadow=False)
        badge = "MENYIAPKAN" if loading else ("KAMERA AKTIF" if cam_frame is not None else "KAMERA TERPUTUS")
        bw = T.text_size(badge, 0.34)[0] + 28
        T.pill(page, self.width - 28 - bw, 24, badge, 0.34,
               T.MUTED if loading else (T.ACCENT if cam_frame is not None else T.DANGER), T.SURFACE)
        self._draw_stage(page, cam_frame, camera_message, loading,
                         "" if active_id == "meme" else tracking, fps)
        x, y, w, h = self.stage
        T.text(page, "PETUNJUK", (x, y + h + 29), 0.33, T.MUTED, shadow=False)
        T.text(page, T.fit_text(hint, w, 0.43), (x, y + h + 54), 0.43, T.INK, shadow=False)
        detail = status if status else ("Model pose aktif" if using_model else "Deteksi gestur siap")
        T.text(page, T.fit_text(detail, w, 0.36), (x, y + h + 79), 0.36,
               T.DANGER if effect == "Belum tersimpan" else T.MUTED, shadow=False)
        self._draw_actions(page, hover_id)
        if toast:
            message = T.fit_text(toast, w - 72, 0.43)
            tw, _ = T.text_size(message, 0.43)
            T.pill(page, x + (w - tw - 24) // 2, y + h - 54, message, 0.43,
                   T.ON_DANGER if toast_error else T.NAV_TEXT, T.DANGER if toast_error else T.NAV)
        if cursor is not None:
            cx, cy, on_target = cursor
            color = T.ACCENT if on_target else T.INK
            cv2.circle(page, (cx, cy), 7, color, -1, cv2.LINE_AA)
            cv2.circle(page, (cx, cy), 15 if armed else 12, T.NAV_TEXT, 4, cv2.LINE_AA)
            cv2.circle(page, (cx, cy), 15 if armed else 12, color, 2, cv2.LINE_AA)
        return page

    def _draw_nav(self, page: np.ndarray, active: str, hover: str | int | None, step: float) -> None:
        for i, item in enumerate(self.items):
            key = str(item.get("id", ""))
            x, y, w, h = self.nav_item_rect(i)
            amount = self._hover.get(key, 0.0)
            amount += (float(hover == key) - amount) * step
            self._hover[key] = amount
            selected = key == active
            color = T.MINT if selected else tuple(int(a + (b - a) * amount) for a, b in zip(T.NAV, T.NAV_HOVER))
            T.rounded_rect(page, x, y, w, h, color, 1.0, 12)
            fg, secondary = (T.INK, T.INK) if selected else (T.NAV_TEXT, T.NAV_MUTED)
            self._icon(page, key, (x + 24, y + 30), fg)
            label = T.fit_text(str(item.get("label", key)), w - 82, 0.46)
            T.text(page, label, (x + 48, y + 26), 0.46, fg, shadow=False)
            T.text(page, MODE_DETAILS.get(key, ("", ""))[0], (x + 48, y + 46),
                   0.32, secondary, shadow=False)
            T.text(page, str(i + 1), (x + w - 22, y + 29), 0.4, fg, shadow=False)
            if self.focused == key:
                T.rounded_border(page, x - 3, y - 3, w + 6, h + 6, T.NAV_TEXT, 2, 15)

    @staticmethod
    def _icon(page: np.ndarray, key: str, center: tuple[int, int], color: tuple[int, int, int]) -> None:
        x, y = center
        if key == "photobooth":
            cv2.rectangle(page, (x - 10, y - 7), (x + 10, y + 8), color, 1, cv2.LINE_AA)
            cv2.circle(page, (x, y), 4, color, 1, cv2.LINE_AA)
            cv2.line(page, (x - 5, y - 10), (x + 5, y - 10), color, 2, cv2.LINE_AA)
        elif key == "meme":
            cv2.circle(page, (x, y), 10, color, 1, cv2.LINE_AA)
            cv2.ellipse(page, (x, y + 1), (5, 5), 0, 10, 170, color, 1, cv2.LINE_AA)
            for dx in (-4, 4):
                cv2.circle(page, (x + dx, y - 3), 1, color, -1, cv2.LINE_AA)
        elif key == "painting":
            cv2.line(page, (x - 6, y + 6), (x + 7, y - 8), color, 4, cv2.LINE_AA)
            cv2.line(page, (x - 10, y + 10), (x - 6, y + 6), color, 2, cv2.LINE_AA)
        else:
            for dx, height in ((-7, 3), (0, 10), (7, 6)):
                cv2.line(page, (x + dx, y - height), (x + dx, y + 10), color, 1, cv2.LINE_AA)
                cv2.circle(page, (x + dx, y - height), 2, color, 1, cv2.LINE_AA)

    def _draw_stage(self, page: np.ndarray, frame: np.ndarray | None, message: str,
                    loading: bool, tracking: str, fps: float) -> None:
        x, y, w, h = self.stage
        stage = np.full((h, w, 3), T.STAGE, np.uint8)
        if frame is not None:
            fh, fw = frame.shape[:2]
            scale = min(w / fw, h / fh)
            vw, vh = max(1, round(fw * scale)), max(1, round(fh * scale))
            ox, oy = (w - vw) // 2, (h - vh) // 2
            stage[oy:oy + vh, ox:ox + vw] = cv2.resize(frame, (vw, vh), interpolation=cv2.INTER_AREA)
            T.pill(stage, 16, 16, "LIVE", 0.33, T.MINT, T.NAV)
            resolution = f"{fw} x {fh}"
            tw = T.text_size(resolution, 0.32)[0]
            T.pill(stage, w - tw - 40, 16, resolution, 0.32, T.NAV_TEXT, T.NAV)
            if tracking:
                T.pill(stage, 16, h - 42, tracking, 0.34, T.NAV_TEXT, T.NAV)
            label = f"{fps:.0f} FPS"
            tw = T.text_size(label, 0.32)[0]
            T.pill(stage, w - tw - 40, h - 42, label, 0.32, T.NAV_TEXT, T.NAV)
        else:
            self._icon(stage, "photobooth", (w // 2, h // 2 - 56), T.MINT)
            T.text_center(stage, "Menyiapkan kamera" if loading else "Kamera belum tersedia",
                          (w // 2, h // 2 - 8), 0.68, T.NAV_TEXT, shadow=False)
            reason = T.fit_text(message, w - 64, 0.4)
            T.text_center(stage, reason, (w // 2, h // 2 + 28), 0.4, T.NAV_MUTED, shadow=False)
            if not loading:
                T.text_center(stage, "Periksa koneksi dan izin kamera Windows. C: coba lagi.",
                              (w // 2, h // 2 + 58), 0.4, T.NAV_TEXT, shadow=False)
        region = page[y:y + h, x:x + w]
        region[:] = stage
        # Only the rounded corners need blending; the live image stays a copy.
        for ys, xs, mask in self._stage_corners:
            region[ys, xs] = (stage[ys, xs] * mask + np.asarray(T.BG) * (1 - mask)).astype(np.uint8)

    def _draw_actions(self, page: np.ndarray, hover: str | int | None) -> None:
        for index, ((label, key), (_, (x, y, w, h))) in enumerate(zip(self.actions, self.action_rects())):
            primary = index == 0
            color = T.INK if primary and hover == key else (T.ACCENT if primary else T.SURFACE)
            fg = T.SURFACE if primary else T.INK
            T.rounded_rect(page, x, y, w, h, color, 1.0, 10)
            if not primary:
                T.rounded_border(page, x, y, w, h, T.STROKE, 1, 10)
            T.text(page, label, (x + 18, y + 30), 0.48, fg, shadow=False)
            shortcut = SHORTCUTS.get(key, chr(key).upper())
            tw = T.text_size(shortcut, 0.34)[0]
            T.text(page, shortcut, (x + w - tw - 18, y + 29), 0.34, fg, shadow=False)
            if self.focused == key:
                T.rounded_border(page, x - 3, y - 3, w + 6, h + 6, T.ACCENT, 2, 13)
