"""
Per-pixel seasonal models for time-series change detection.

Why this module exists: the first detector compared every observation against a
per-pixel median. In a seasonal landscape that is wrong in a specific and
damaging way — a dry-season NDVI trough sits several standard deviations from
the annual median, so the detector calls disturbance on the whole landscape
every dry season. Measured on the clear-cut fixture it inflated confirmed
pixels from 19% (SAR) to 67% (optical). The optical number was not detecting
more, it was detecting summer.

The fix is the standard one from CCDC and BFAST: fit a harmonic model per
pixel on the history period, then test each new observation against what that
pixel is *predicted* to look like on that date.

    y(t) = a0 + sum_k [ a_k cos(2*pi*k*t) + b_k sin(2*pi*k*t) ]

with t in fractional years. One harmonic captures a single wet/dry cycle; two
captures bimodal rainfall, which much of the tropics has.

Implementation note: the design matrix is shared across pixels because all
pixels share the observation dates, so the whole image is solved at once
through batched normal equations rather than a per-pixel loop. Validity
differs per pixel (cloud), which is why the normal equations are accumulated
with a mask instead of using a plain lstsq.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Sequence

import numpy as np

#: below this many clear observations a pixel cannot support a seasonal fit
MIN_OBS_PER_HARMONIC = 4


def fractional_years(dates: Sequence[date]) -> np.ndarray:
    """Dates as fractional years from the first observation."""
    if not dates:
        return np.zeros(0)
    origin = dates[0]
    return np.array([(d - origin).days / 365.25 for d in dates], dtype="float64")


def design_matrix(t: np.ndarray, harmonics: int = 2, trend: bool = False) -> np.ndarray:
    """
    Columns: [1, (cos, sin) per harmonic, optional t].

    Trend is off by default. A linear term fitted on one year of history and
    extrapolated across the next will drift, and a drifting baseline is
    indistinguishable from gradual degradation — which is precisely the signal
    we are trying to keep.
    """
    cols = [np.ones_like(t)]
    for k in range(1, harmonics + 1):
        w = 2.0 * np.pi * k * t
        cols.append(np.cos(w))
        cols.append(np.sin(w))
    if trend:
        cols.append(t)
    return np.stack(cols, axis=1)


@dataclass
class SeasonalModel:
    """A fitted per-pixel harmonic model."""

    coefficients: np.ndarray   # (n_params, y, x)
    sigma: np.ndarray          # (y, x) robust residual scale
    harmonics: int
    trend: bool
    origin: date
    #: pixels with too few clear observations to fit; these fall back to a median
    insufficient: np.ndarray   # (y, x) bool

    @property
    def level(self) -> np.ndarray:
        """The a0 term — the pixel's mean level with seasonality removed."""
        return self.coefficients[0]

    def predict(self, when: Sequence[date]) -> np.ndarray:
        """Expected value at each date, shape (n_dates, y, x)."""
        t = np.array([(d - self.origin).days / 365.25 for d in when], dtype="float64")
        X = design_matrix(t, self.harmonics, self.trend)
        # (n_dates, n_params) x (n_params, y, x) -> (n_dates, y, x)
        return np.einsum("tp,pyx->tyx", X, self.coefficients)

    def amplitude(self) -> np.ndarray:
        """
        Seasonal amplitude of the first harmonic. Useful as a diagnostic: a
        pixel with large amplitude is one where the flat-median detector would
        have been badly wrong.
        """
        if self.harmonics < 1:
            return np.zeros_like(self.level)
        a1, b1 = self.coefficients[1], self.coefficients[2]
        return np.hypot(a1, b1)


def fit(
    stack: np.ndarray,
    dates: Sequence[date],
    *,
    harmonics: int = 2,
    trend: bool = False,
    robust_passes: int = 1,
) -> SeasonalModel:
    """
    Fit a harmonic model per pixel over (time, y, x).

    Runs one robust pass by default: fit, down-weight observations more than
    three robust deviations out, refit. History periods routinely contain a
    rain event or an early disturbance, and without this they bias the seasonal
    curve toward the very anomaly we want to detect later.
    """
    if stack.ndim != 3:
        raise ValueError(f"expected (time, y, x), got {stack.shape}")
    n_time = stack.shape[0]
    if len(dates) != n_time:
        raise ValueError(f"{len(dates)} dates for {n_time} observations")

    n_params = 1 + 2 * harmonics + (1 if trend else 0)
    t = fractional_years(dates)
    X = design_matrix(t, harmonics, trend)

    y = stack.reshape(n_time, -1).astype("float64")     # (t, p)
    valid = np.isfinite(y)
    y = np.where(valid, y, 0.0)
    weights = valid.astype("float64")

    coef = None
    for _ in range(max(1, robust_passes + 1)):
        coef = _weighted_solve(X, y, weights, n_params)
        resid = y - X @ coef                            # (t, p)
        resid = np.where(valid, resid, np.nan)
        scale = _robust_scale(resid)
        if robust_passes <= 0:
            break
        with np.errstate(invalid="ignore", divide="ignore"):
            z = np.abs(resid) / np.maximum(scale, 1e-6)
        # hard down-weight rather than full rejection, so a pixel never loses
        # so many observations that the system becomes underdetermined
        weights = np.where(np.isfinite(z) & (z > 3.0), 0.15, 1.0) * valid
        robust_passes -= 1

    resid = np.where(valid, y - X @ coef, np.nan)
    sigma = _robust_scale(resid)
    sigma = np.where(np.isfinite(sigma) & (sigma > 1e-3), sigma, np.nan)

    n_valid = valid.sum(axis=0)
    insufficient = n_valid < max(n_params + 2, MIN_OBS_PER_HARMONIC * harmonics)

    # a pixel that cannot support the fit falls back to a flat level so the
    # detector still has something to compare against
    if insufficient.any():
        with np.errstate(invalid="ignore"):
            median = np.nanmedian(np.where(valid, y, np.nan), axis=0)
        coef = coef.copy()
        coef[0] = np.where(insufficient, np.nan_to_num(median), coef[0])
        coef[1:] = np.where(insufficient[None, :], 0.0, coef[1:])

    shape = stack.shape[1:]
    fallback = np.nanmedian(sigma) if np.isfinite(sigma).any() else 1.0
    sigma = np.where(np.isfinite(sigma), sigma, fallback)

    return SeasonalModel(
        coefficients=coef.reshape(n_params, *shape),
        sigma=sigma.reshape(shape),
        harmonics=harmonics,
        trend=trend,
        origin=dates[0],
        insufficient=insufficient.reshape(shape),
    )


def _weighted_solve(
    X: np.ndarray, y: np.ndarray, w: np.ndarray, n_params: int
) -> np.ndarray:
    """
    Batched weighted least squares via normal equations.

    Solves every pixel at once: A[p] = X^T W_p X, b[p] = X^T W_p y_p. A small
    ridge term keeps the system solvable where a pixel's observations happen to
    be clustered in one season and the harmonic columns go collinear.
    """
    # (t, p) weights -> per-pixel n_params x n_params
    A = np.einsum("ti,tj,tp->pij", X, X, w, optimize=True)
    b = np.einsum("ti,tp->pi", X, w * y, optimize=True)
    ridge = 1e-6 * np.eye(n_params)[None, :, :]
    # NumPy 2 treats a 2-D `b` as a stack of matrices, not a stack of vectors,
    # so the column axis has to be explicit or the core dimensions mismatch
    rhs = b[..., None]                                   # (p, n_params, 1)
    try:
        coef = np.linalg.solve(A + ridge, rhs)[..., 0]   # (p, n_params)
    except np.linalg.LinAlgError:
        coef = np.einsum("pij,pj->pi", np.linalg.pinv(A + ridge), b)
    return coef.T                                        # (n_params, p)


def _robust_scale(resid: np.ndarray) -> np.ndarray:
    """MAD-derived sigma per pixel, immune to the outliers we care about."""
    with np.errstate(invalid="ignore"):
        med = np.nanmedian(resid, axis=0)
        mad = np.nanmedian(np.abs(resid - med), axis=0)
    return 1.4826 * mad
