"""
Calibrated prediction intervals, model-agnostic.

Why conformal rather than the model's own variance: a random forest's spread
across trees, or a neural net's softmax, is not a probability of anything. It
is a number that correlates with confidence on the training distribution and
lies freely off it. Split conformal gives finite-sample coverage that holds for
*any* model, given only exchangeability between calibration and test data.

The catch, and the reason for the blocked splitter below: spatial data is not
exchangeable. Nearby pixels share almost everything, so a random calibration
split leaks test information into calibration, the residuals come out too
small, and the intervals are confidently too narrow. Blocking by geography is
what makes the guarantee mean something here.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Sequence

import numpy as np


@dataclass
class ConformalInterval:
    lower: np.ndarray
    upper: np.ndarray
    level: float
    #: the calibrated quantile applied
    quantile: float
    method: str

    @property
    def width(self) -> np.ndarray:
        return self.upper - self.lower


@dataclass
class CoverageReport:
    """The only honest way to state whether the intervals work."""

    nominal: float
    empirical: float
    n: int
    mean_width: float

    @property
    def passes(self) -> bool:
        """
        Coverage must reach nominal within Monte Carlo error. One-sided: an
        interval that over-covers is merely wide, one that under-covers is wrong.
        """
        se = math.sqrt(max(self.nominal * (1 - self.nominal), 1e-9) / max(self.n, 1))
        return self.empirical >= self.nominal - 2 * se

    def as_dict(self) -> dict:
        return {
            "nominal": self.nominal,
            "empirical": round(self.empirical, 4),
            "n": self.n,
            "mean_width": round(self.mean_width, 4),
            "passes": self.passes,
        }


class SplitConformal:
    """
    Absolute-residual split conformal regression.

    Calibrate on held-out residuals, take the ceil((n+1)(1-alpha))/n quantile,
    and add it symmetrically. Simple, and it is the version whose coverage
    guarantee is easiest to defend in a review.
    """

    def __init__(self, level: float = 0.9) -> None:
        if not 0 < level < 1:
            raise ValueError("level must be in (0, 1)")
        self.level = level
        self.quantile_: float | None = None

    def calibrate(self, y_true: np.ndarray, y_pred: np.ndarray) -> "SplitConformal":
        residuals = np.abs(np.asarray(y_true, float) - np.asarray(y_pred, float))
        residuals = residuals[np.isfinite(residuals)]
        n = residuals.size
        if n < 20:
            raise ValueError(
                f"only {n} calibration residuals; the quantile is meaningless below ~20"
            )
        alpha = 1 - self.level
        # the finite-sample correction is what makes the guarantee exact
        k = math.ceil((n + 1) * (1 - alpha))
        if k > n:
            raise ValueError(
                f"level {self.level} needs at least {k} calibration points, have {n}"
            )
        self.quantile_ = float(np.sort(residuals)[k - 1])
        return self

    def interval(self, y_pred: np.ndarray, *, floor: float | None = 0.0) -> ConformalInterval:
        if self.quantile_ is None:
            raise RuntimeError("calibrate() before interval()")
        pred = np.asarray(y_pred, float)
        lo = pred - self.quantile_
        hi = pred + self.quantile_
        if floor is not None:
            lo = np.maximum(lo, floor)  # biomass and height cannot be negative
        return ConformalInterval(lo, hi, self.level, self.quantile_, "split_conformal_absolute")


def evaluate_coverage(
    y_true: np.ndarray, interval: ConformalInterval
) -> CoverageReport:
    y = np.asarray(y_true, float)
    inside = (y >= interval.lower) & (y <= interval.upper)
    ok = np.isfinite(y)
    n = int(ok.sum())
    return CoverageReport(
        nominal=interval.level,
        empirical=float(inside[ok].sum() / n) if n else 0.0,
        n=n,
        mean_width=float(np.mean(interval.width[ok])) if n else 0.0,
    )


def spatial_blocks(
    coords: np.ndarray, n_blocks: int = 10, *, seed: int = 0
) -> np.ndarray:
    """
    Assign each sample to a spatial block, so calibration and test never share
    a neighbourhood. A random split here would inflate apparent coverage and
    hand back intervals that are too narrow in exactly the places we care about.
    """
    xy = np.asarray(coords, float)
    if xy.ndim != 2 or xy.shape[1] != 2:
        raise ValueError("coords must be (n, 2)")
    side = max(1, int(math.sqrt(n_blocks)))
    out = np.empty(len(xy), dtype=int)
    for dim in range(2):
        v = xy[:, dim]
        edges = np.quantile(v, np.linspace(0, 1, side + 1)[1:-1]) if side > 1 else []
        idx = np.digitize(v, edges)
        out = idx if dim == 0 else out * side + idx
    rng = np.random.default_rng(seed)
    order = rng.permutation(out.max() + 1)
    return order[out]


def blocked_split(
    coords: np.ndarray, calib_fraction: float = 0.5, *, n_blocks: int = 16, seed: int = 0
) -> tuple[np.ndarray, np.ndarray]:
    """Boolean masks (calibration, test) that respect spatial blocking."""
    blocks = spatial_blocks(coords, n_blocks, seed=seed)
    uniq = np.unique(blocks)
    n_cal = max(1, int(len(uniq) * calib_fraction))
    cal_blocks = set(uniq[:n_cal].tolist())
    is_cal = np.array([b in cal_blocks for b in blocks])
    return is_cal, ~is_cal
