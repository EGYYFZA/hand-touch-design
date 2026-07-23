"""Tata letak halaman: kartu kamera + rel menu kiri, gaya website 1024px.

Menggantikan penggabungan kamera-panel yang lama. Semua digambar ke satu kanvas
putih berukuran tetap supaya terlihat seperti aplikasi web yang rapi.

Koordinat jari (ruang kamera) dipetakan ke ruang HALAMAN memakai lebar kamera
penuh -> lebar halaman penuh, jadi menggeser tangan ke tepi kiri kamera membawa
kursor sampai ke rel menu di kiri halaman.
"""
from __future__ import annotations

import cv2
import numpy as np

from render import theme as T

PAGE_W = 1024
MARGIN = 26
NAV_W = 210
GUTTER = 22
HEADER_H = 56
FOOTER_H = 46

BRAND_H = 66
BTN_H = 60
BTN_GAP = 10

CONTENT_X = MARGIN + NAV_W + GUTTER
CONTENT_W = PAGE_W - CONTENT_X - MARGIN
CAM_H = round(CONTENT_W * 9 / 16)
CARD_H = HEADER_H + CAM_H + FOOTER_H
PAGE_H = MARGIN + CARD_H + MARGIN

CAM_X = CONTENT_X
CAM_Y = MARGIN + HEADER_H


class Page:
    def __init__(self, items: list[dict]) -> None:
        self.items = list(items)
        self._bg = self._build_bg()

    def _build_bg(self) -> np.ndarray:
        """Bagian yang tidak berubah tiap frame: bayangan, badan kartu, merek.

        Digambar sekali. Tiap frame cukup menyalin ini lalu menimpa bagian yang
        dinamis (tombol menu, teks header, kamera). Menghitung ulang bayangan
        lembut tiap frame memakan waktu dan menurunkan frame rate.
        """
        page = np.full((PAGE_H, PAGE_W, 3), T.BG, dtype=np.uint8)

        T.soft_shadow(page, MARGIN, MARGIN, NAV_W, CARD_H, radius=T.RADIUS)
        T.rounded_rect(page, MARGIN, MARGIN, NAV_W, CARD_H, (255, 255, 255), 1.0)
        T.soft_shadow(page, CONTENT_X, MARGIN, CONTENT_W, CARD_H, radius=T.RADIUS)
        T.rounded_rect(page, CONTENT_X, MARGIN, CONTENT_W, CARD_H, (255, 255, 255), 1.0)

        bx, by = MARGIN + 18, MARGIN + 30
        T.rounded_rect(page, bx, by - 12, 26, 26, T.ACCENT, 1.0, radius=8)
        T.text(page, "Gesture", (bx + 34, by + 2), 0.6, T.INK, 1, shadow=False)
        T.text(page, "Canvas", (bx + 34, by + 24), 0.6, T.ACCENT, 1, shadow=False)
        return page

    # ---------- geometri ----------

    @property
    def size(self) -> tuple[int, int]:
        return PAGE_W, PAGE_H

    def nav_item_rect(self, index: int) -> tuple[int, int, int, int]:
        x = MARGIN + 12
        y = MARGIN + BRAND_H + index * (BTN_H + BTN_GAP)
        return x, y, NAV_W - 24, BTN_H

    def hit_test(self, px: float, py: float) -> str | None:
        """Koordinat HALAMAN -> id item menu, atau None."""
        for i, item in enumerate(self.items):
            x, y, w, h = self.nav_item_rect(i)
            if x <= px <= x + w and y <= py <= y + h:
                return str(item.get("id", ""))
        return None

    def finger_to_page(self, fx: float, fy: float,
                       cam_w: int, cam_h: int) -> tuple[int, int]:
        """Ujung jari (ruang kamera) -> titik pada halaman.

        Lebar kamera penuh dipetakan ke lebar halaman penuh, jadi tangan di tepi
        kiri kamera menjangkau rel menu di kiri halaman.
        """
        px = float(np.clip(fx / max(cam_w, 1), 0.0, 1.0)) * PAGE_W
        py = float(np.clip(fy / max(cam_h, 1), 0.0, 1.0)) * PAGE_H
        return int(px), int(py)

    # ---------- gambar ----------

    def render(self, cam_frame: np.ndarray, *, active_id: str,
               hover_id: str | None, mode_label: str, effect: str, fps: float,
               hint: str, status: str, using_model: bool,
               cursor: tuple[int, int, bool] | None = None,
               armed: bool = False, toast: str = "") -> np.ndarray:
        page = self._bg.copy()

        self._draw_nav(page, active_id, hover_id, status, using_model)
        self._draw_card(page, cam_frame, mode_label, effect, fps, hint)
        if toast:
            self._draw_toast(page, toast)
        if cursor is not None:
            self._draw_cursor(page, cursor, armed)
        return page

    # ---------- rel menu ----------

    def _draw_nav(self, page: np.ndarray, active_id: str, hover_id: str | None,
                  status: str, using_model: bool) -> None:
        for i, item in enumerate(self.items):
            item_id = str(item.get("id", ""))
            x, y, w, h = self.nav_item_rect(i)
            active = item_id == active_id
            hover = item_id == hover_id

            if active:
                T.rounded_rect(page, x, y, w, h, T.ACCENT, 1.0, radius=13)
            elif hover:
                T.rounded_rect(page, x, y, w, h, T.SURFACE_HI, 1.0, radius=13)
                T.rounded_border(page, x, y, w, h, T.ACCENT, 2, radius=13)
            else:
                T.rounded_rect(page, x, y, w, h, T.SURFACE, 1.0, radius=13)

            fg = (255, 255, 255) if active else (T.INK if hover else T.MUTED)
            sub = (255, 236, 224) if active else T.FAINT
            label = str(item.get("label", item_id))
            T.text(page, label, (x + 20, y + 30), 0.56, fg, 1, shadow=False)
            T.text(page, f"tekan {i + 1}", (x + 20, y + 48), 0.4, sub, 1, shadow=False)

        # kaki rel: status mode + sumber klasifikasi
        foot_y = MARGIN + CARD_H - 66
        badge = "model" if using_model else "aturan"
        T.pill(page, MARGIN + 16, foot_y, badge, 0.4,
               (255, 255, 255) if using_model else T.MUTED,
               T.ACCENT if using_model else T.SURFACE, 1.0)
        if status:
            T.text(page, _fit(status, 24), (MARGIN + 16, foot_y + 46), 0.4, T.MUTED, 1,
                   shadow=False)

    # ---------- kartu kamera ----------

    def _draw_card(self, page: np.ndarray, cam_frame: np.ndarray, mode_label: str,
                   effect: str, fps: float, hint: str) -> None:
        # header: nama mode + pil efek + fps
        T.text(page, mode_label, (CONTENT_X + 20, MARGIN + 36), 0.66, T.INK, 1,
               shadow=False)
        used = CONTENT_X + 20 + T.text_size(mode_label, 0.66, 1)[0] + 16
        if effect and effect != "-":
            T.pill(page, used, MARGIN + 16, effect, 0.42, (255, 255, 255),
                   T.ACCENT, 1.0)
        fps_txt = f"{fps:.0f} FPS"
        fw = T.text_size(fps_txt, 0.44, 1)[0]
        T.text(page, fps_txt, (CONTENT_X + CONTENT_W - fw - 20, MARGIN + 35), 0.44,
               T.MUTED, 1, shadow=False)

        # kamera, dipasang ke dalam kartu dengan sudut membulat
        view = cv2.resize(cam_frame, (CONTENT_W, CAM_H), interpolation=cv2.INTER_AREA)
        mask = T._rounded_mask(CONTENT_W, CAM_H, 12)[:, :, None] / 255.0
        region = page[CAM_Y:CAM_Y + CAM_H, CAM_X:CAM_X + CONTENT_W]
        region[:] = (view.astype(np.float32) * mask +
                     region.astype(np.float32) * (1 - mask)).astype(np.uint8)
        T.rounded_border(page, CAM_X, CAM_Y, CONTENT_W, CAM_H, T.STROKE, 1, radius=12)

        # footer: petunjuk
        if hint:
            T.text(page, _fit(hint, 96), (CONTENT_X + 20, MARGIN + CARD_H - 16), 0.42,
                   T.MUTED, 1, shadow=False)

    # ---------- lapisan atas ----------

    def _draw_toast(self, page: np.ndarray, message: str) -> None:
        tw, th = T.text_size(message, 0.46, 1)
        bw, bh = tw + 36, th + 22
        x, y = CAM_X + (CONTENT_W - bw) // 2, CAM_Y + 14
        T.rounded_rect(page, x, y, bw, bh, T.INK, 0.9, radius=bh // 2)
        T.text(page, message, (x + 18, y + bh - 8), 0.46, (255, 255, 255), 1,
               shadow=False)

    def _draw_cursor(self, page: np.ndarray, cursor: tuple[int, int, bool],
                     armed: bool) -> None:
        x, y, on_item = cursor
        color = T.ACCENT if on_item else T.MUTED
        r = 9 if armed else 7
        cv2.circle(page, (x, y), r, color, -1, cv2.LINE_AA)
        cv2.circle(page, (x, y), r + 8, color, 2, cv2.LINE_AA)


def _fit(text: str, n: int) -> str:
    text = str(text)
    return text if len(text) <= n else text[: n - 1] + "…"
