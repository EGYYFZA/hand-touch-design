"""One Euro filter: menghaluskan landmark tanpa menambah lag terasa.

Rata-rata bergerak menghilangkan getaran tapi membuat gerakan cepat tertinggal.
One Euro menaikkan cutoff saat tangan bergerak cepat, jadi diam = halus,
bergerak = responsif.
"""
from __future__ import annotations

import math

import numpy as np


def _alpha(cutoff: float, dt: float) -> float:
    tau = 1.0 / (2.0 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


class OneEuroFilter:
    """Bekerja pada array bentuk apa pun; state mengikuti bentuk pertama."""

    def __init__(self, min_cutoff: float = 1.0, beta: float = 0.007,
                 d_cutoff: float = 1.0) -> None:
        self.min_cutoff = float(min_cutoff)
        self.beta = float(beta)
        self.d_cutoff = float(d_cutoff)
        self._x_prev: np.ndarray | None = None
        self._dx_prev: np.ndarray | None = None

    def reset(self) -> None:
        self._x_prev = None
        self._dx_prev = None

    def __call__(self, x: np.ndarray, dt: float) -> np.ndarray:
        x = np.asarray(x, dtype=float)
        if self._x_prev is None or self._x_prev.shape != x.shape or dt <= 0:
            self._x_prev = x
            self._dx_prev = np.zeros_like(x)
            return x

        dx = (x - self._x_prev) / dt
        a_d = _alpha(self.d_cutoff, dt)
        dx_hat = a_d * dx + (1 - a_d) * self._dx_prev

        cutoff = self.min_cutoff + self.beta * np.abs(dx_hat)
        # alpha per elemen: setiap landmark punya kecepatannya sendiri
        tau = 1.0 / (2.0 * math.pi * np.maximum(cutoff, 1e-6))
        a = 1.0 / (1.0 + tau / dt)
        x_hat = a * x + (1 - a) * self._x_prev

        self._x_prev = x_hat
        self._dx_prev = dx_hat
        return x_hat
