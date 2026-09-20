"""
Probabilistic disturbance detection on Sentinel-1, following the RADD method
(Reiche et al.) rather than inventing one.

The shape of it:

  1. Split the series into a history period and a monitoring period.
  2. From history, learn each pixel's own forest backscatter distribution.
     Per-pixel matters — a pixel's neighbours are not interchangeable with it,
     and a global threshold on gamma0 fails the moment terrain or moisture
     varies.
  3. Convert each new observation to P(non-forest) against that pixel's forest
     distribution and a scene-derived non-forest distribution.
  4. Flag a candidate above 0.75, then *accumulate* evidence across subsequent
     observations by Bayesian update, confirming only once the posterior clears
     a high bar.

Step 4 is what separates this from thresholding. A single dark observation is
speckle, rain, or a wet field; the same pixel staying dark across three passes
is a clearing. The cost is latency, which is exactly the trade the confidence
level is there to expose.

Step 2 models seasonality explicitly (see `seasonal.py`). An earlier version
compared observations against a flat per-pixel median, which reported the dry
season as deforestation across the whole landscape — 67% of pixels on a fixture
where SAR found 19%. Each observation is now tested against what that pixel is
predicted to look like on that date.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Sequence

import numpy as np

from . import seasonal

#: single-observation probability above which a pixel becomes a candidate
FLAG_THRESHOLD = 0.75
#: posterior required before a candidate is reported as confirmed
CONFIRM_THRESHOLD = 0.975
#: a candidate that never confirms within this many observations is dropped
MAX_OPEN_OBSERVATIONS = 6
#: observations after a crossing that must keep supporting it before it counts
MIN_PERSISTENCE_OBS = 4
#: the post-crossing median residual must stay at least this share of the drop
#: below expectation. Clearing is permanent; speckle is not.
PERSISTENCE_FRACTION = 0.4
#: Days the monitoring period must span before a confirmation may stand.
#:
#: The persistence test asks whether a pixel that dropped *stayed* down, and
#: that is a question about time, not about sample count. Sentinel-1 covers
#: some places from several overlapping orbits, so scenes arrive in clusters a
#: day or two apart; twenty such observations inside six months are not twenty
#: independent chances to see a clearing hold.
#:
#: Measured on two verified primary-forest fixtures, false positives track the
#: monitoring *span* closely and the observation count not at all:
#:
#:      span    intact    intact-deep     (obs at intact-deep)
#:      182 d   41.6%        42.8%              29
#:      227 d   19.8%         4.0%              36
#:      272 d    3.1%         0.2%              42
#:      365 d    0.10%        0.09%             54
#:
#: 29 observations over 182 days confirm 42.8% of a national park as cleared;
#: 26 over 272 days confirm 3.1%. So the gate is the span. Below it the
#: detector reports every crossing as provisional and confirms nothing:
#: declining is the correct output of an underpowered test, and answering
#: anyway is how a monitoring system tells a national park it has been felled.
MIN_MONITOR_DAYS = 270
#: and a floor on raw count, since a long span sampled twice is no better
MIN_MONITOR_OBS = 12
#: a pixel's own post-crossing evidence must also span time, not just samples
MIN_PERSISTENCE_DAYS = 90


@dataclass
class DetectionResult:
    """Per-pixel disturbance state at the end of the monitoring period."""

    posterior: np.ndarray           # P(disturbed), 0..1
    confirmed: np.ndarray           # bool: crossed AND persisted
    first_flag_index: np.ndarray    # index into `dates` of first flag, -1 if none
    confirm_index: np.ndarray       # index of confirmation, -1 if none
    #: crossed the posterior bar but too near the end of the window to verify
    #: persistence. Real systems call these low-confidence recent alerts.
    provisional: np.ndarray | None = None
    dates: list[date] = field(default_factory=list)
    #: diagnostics the caller should be able to see
    forest_mu: np.ndarray | None = None
    nonforest_mu: float | None = None
    #: magnitude of the drop from expectation that counts as clearing
    expected_drop: float | None = None
    #: mean seasonal amplitude of the history period. Large values are where a
    #: non-seasonal detector would have produced false alarms.
    seasonal_amplitude: float | None = None
    #: share of pixels with too few clear observations for a seasonal fit
    fallback_fraction: float | None = None
    #: the monitoring series was too short for the persistence test to have
    #: power, so nothing was confirmed and every crossing is provisional
    underpowered: str = ""

    @property
    def confirmed_fraction(self) -> float:
        n = self.confirmed.size
        return float(self.confirmed.sum() / n) if n else 0.0

    @property
    def provisional_fraction(self) -> float:
        if self.provisional is None:
            return 0.0
        n = self.provisional.size
        return float(self.provisional.sum() / n) if n else 0.0

    def first_confirmed_date(self) -> date | None:
        """Earliest confirmation anywhere in the window."""
        idx = self.confirm_index[self.confirm_index >= 0]
        if idx.size == 0 or not self.dates:
            return None
        return self.dates[int(idx.min())]

    def median_confirmed_date(self) -> date | None:
        idx = self.confirm_index[self.confirm_index >= 0]
        if idx.size == 0 or not self.dates:
            return None
        return self.dates[int(np.median(idx))]

    def latency_observations(self) -> float | None:
        """How many observations it took to confirm, on average."""
        ok = self.confirm_index >= 0
        if not ok.any():
            return None
        return float(np.mean(self.confirm_index[ok] - self.first_flag_index[ok]))


def _gaussian_pdf(x: np.ndarray, mu: np.ndarray | float, sigma: np.ndarray | float) -> np.ndarray:
    sigma = np.maximum(sigma, 1e-3)
    z = (x - mu) / sigma
    return np.exp(-0.5 * z * z) / (sigma * np.sqrt(2.0 * np.pi))


def learn_forest(
    history: np.ndarray,
    dates: Sequence[date] | None = None,
    *,
    harmonics: int = 2,
) -> tuple[seasonal.SeasonalModel | None, np.ndarray, np.ndarray]:
    """
    Learn what "undisturbed" looks like for each pixel.

    With dates, fits a harmonic seasonal model so the expectation moves through
    the year. Without them, falls back to a flat median — kept only so the
    function stays usable on synthetic stacks in tests, never in production.

    Returns (model or None, level, sigma). `level` is the seasonally-adjusted
    mean, which is what the non-forest estimator should key off; the per-date
    expectation comes from the model.
    """
    if dates is not None and len(dates) >= 2 * harmonics + 4:
        model = seasonal.fit(history, list(dates), harmonics=harmonics)
        sigma = np.where(model.sigma > 0.15, model.sigma, 0.9)
        return model, model.level, sigma

    mu = np.nanmedian(history, axis=0)
    mad = np.nanmedian(np.abs(history - mu), axis=0)
    sigma = 1.4826 * mad  # MAD -> sigma for a normal
    sigma = np.where(np.isfinite(sigma) & (sigma > 0.15), sigma, 0.9)
    return None, mu, sigma


def estimate_drop(forest_level: np.ndarray, forest_sigma: np.ndarray) -> tuple[float, float]:
    """
    How far a pixel falls when it is cleared, and how variable that fall is.

    Expressed as a *drop relative to the pixel's own expectation*, not as an
    absolute level. That distinction is the one that matters: an earlier version
    placed an absolute non-forest mean near the seasonally-adjusted level, and
    since observations swing several dB either side of that level through the
    year, the seasonal trough landed on top of the non-forest distribution and
    the whole landscape flagged every dry season.

    Working in residual space removes the season from the comparison entirely.
    A pixel that tracks its own seasonal curve has a residual near zero however
    deep the trough goes; only a departure *from the curve* is evidence.

    The magnitude is read off the scene: the gap between the typical level and
    the darkest tail is what clearing looks like here, floored so a very quiet
    scene does not make ordinary noise look like a clearing.
    """
    finite = forest_level[np.isfinite(forest_level)]
    noise = float(np.nanmedian(forest_sigma))
    sigma = float(max(noise * 1.6, 0.6))
    if finite.size == 0:
        return 4.0, sigma

    observed_gap = float(np.nanmedian(finite) - np.percentile(finite, 5))
    drop = max(observed_gap, 3.0, 4.0 * noise)
    return float(drop), sigma


def detect(
    stack: np.ndarray,
    dates: Sequence[date],
    *,
    history_fraction: float = 0.5,
    harmonics: int = 2,
    min_persistence: int = MIN_PERSISTENCE_OBS,
    min_monitor: int = MIN_MONITOR_OBS,
    min_monitor_days: int = MIN_MONITOR_DAYS,
    min_persistence_days: int = MIN_PERSISTENCE_DAYS,
    persistence_fraction: float = PERSISTENCE_FRACTION,
    flag_threshold: float = FLAG_THRESHOLD,
    confirm_threshold: float = CONFIRM_THRESHOLD,
    max_open: int = MAX_OPEN_OBSERVATIONS,
) -> DetectionResult:
    """
    Run the detector over a (time, y, x) stack of backscatter in dB.

    Returns per-pixel posteriors and confirmation indices. Nothing here decides
    what the *area* of disturbance is — that is a sampling question, handled by
    the area estimator, not by counting these pixels.
    """
    if stack.ndim != 3:
        raise ValueError(f"expected (time, y, x), got {stack.shape}")
    n_time = stack.shape[0]
    if n_time < 4:
        raise ValueError(f"need at least 4 observations, got {n_time}")

    split = max(2, int(n_time * history_fraction))
    history, monitor = stack[:split], stack[split:]
    history_dates = list(dates[:split])
    monitor_dates = list(dates[split:])

    model, f_level, f_sigma = learn_forest(history, history_dates, harmonics=harmonics)
    # expressed as a drop from expectation, so the season cancels out
    drop, nf_sigma = estimate_drop(f_level, f_sigma)

    # expected value per monitoring date, per pixel
    if model is not None:
        expected = model.predict(monitor_dates)
    else:
        expected = np.broadcast_to(f_level, monitor.shape)

    shape = stack.shape[1:]
    # residuals are kept so persistence can be checked after the fact; a
    # crossing is a hypothesis, staying down is the evidence for it
    residuals = np.full(monitor.shape, np.nan, dtype="float32")
    posterior = np.zeros(shape, dtype="float32")
    open_since = np.full(shape, -1, dtype="int32")
    first_flag = np.full(shape, -1, dtype="int32")
    confirm_at = np.full(shape, -1, dtype="int32")
    confirmed = np.zeros(shape, dtype=bool)

    for t, obs in enumerate(monitor):
        valid = np.isfinite(obs)
        if not valid.any():
            continue

        # everything is judged on the departure from this pixel's own seasonal
        # curve, never on the raw value
        residual = obs - expected[t]
        residuals[t] = np.where(valid, residual, np.nan)
        p_f = _gaussian_pdf(residual, 0.0, f_sigma)
        p_nf = _gaussian_pdf(residual, -drop, nf_sigma)
        denom = p_f + p_nf
        p_nonforest = np.where(denom > 0, p_nf / np.maximum(denom, 1e-12), 0.0)

        # Disturbance lowers both VH gamma0 and NDVI, so only a reading *below*
        # the pixel's expectation can be a candidate. Without this, an upward
        # excursion on the far side of the forest mode can still out-score the
        # forest likelihood once the non-forest tail is wide enough.
        below = residual < 0
        opening = (
            valid & below & (p_nonforest > flag_threshold)
            & (open_since < 0) & ~confirmed
        )
        posterior = np.where(opening, p_nonforest, posterior)
        open_since = np.where(opening, t, open_since)
        first_flag = np.where(opening & (first_flag < 0), t, first_flag)

        # accumulate evidence on already-open candidates
        updating = valid & (open_since >= 0) & ~confirmed & ~opening
        prior = posterior
        num = prior * p_nonforest
        den = num + (1.0 - prior) * (1.0 - p_nonforest)
        updated = np.where(den > 0, num / np.maximum(den, 1e-12), prior)
        posterior = np.where(updating, updated, posterior)

        newly = (posterior >= confirm_threshold) & (open_since >= 0) & ~confirmed
        confirmed = confirmed | newly
        confirm_at = np.where(newly, t, confirm_at)

        # a candidate that keeps failing to confirm was noise; close it
        stale = (open_since >= 0) & ~confirmed & ((t - open_since) > max_open)
        posterior = np.where(stale, 0.0, posterior)
        open_since = np.where(stale, -1, open_since)

    # --- persistence ------------------------------------------------------
    # A posterior crossing says "this observation looks cleared". Only a run of
    # subsequent observations that stay down says "this ground is cleared".
    # Without this the detector confirmed 42-56% of verified primary forest:
    # over 50-100 observations a pixel gets many independent chances to cross
    # on speckle alone, and nothing checked whether it came back up.
    crossed = confirmed.copy()
    persisted = np.zeros(shape, dtype=bool)
    provisional = np.zeros(shape, dtype=bool)
    n_monitor = residuals.shape[0]

    span_days = (
        (monitor_dates[-1] - monitor_dates[0]).days if len(monitor_dates) > 1 else 0
    )
    if span_days < min_monitor_days or n_monitor < min_monitor:
        # not enough time after any crossing to tell a clearing from speckle
        return DetectionResult(
            posterior=posterior,
            provisional=crossed,
            confirmed=np.zeros(shape, dtype=bool),
            first_flag_index=first_flag,
            confirm_index=np.full(shape, -1, dtype=int),
            dates=monitor_dates,
            forest_mu=f_level,
            nonforest_mu=float(np.nanmedian(f_level) - drop),
            expected_drop=float(drop),
            seasonal_amplitude=(
                float(np.nanmean(model.amplitude())) if model is not None else None
            ),
            fallback_fraction=(
                float(model.insufficient.mean()) if model is not None else None
            ),
            underpowered=(
                f"monitoring period spans {span_days} days over {n_monitor} "
                f"observations; the persistence test needs >= {min_monitor_days} "
                f"days and >= {min_monitor} observations to separate a clearing "
                "from speckle, so nothing is confirmed and every crossing is "
                "reported as provisional. Widen the window."
            ),
        )

    # ordinal day of each monitoring observation, for the per-pixel span test
    day_of = np.array([d.toordinal() for d in monitor_dates], dtype="int64")

    ys, xs = np.nonzero(crossed)
    for y, x in zip(ys, xs):
        start_idx = int(confirm_at[y, x]) + 1
        window = residuals[start_idx:, y, x]
        finite = np.isfinite(window)
        after = window[finite]
        # the dates those surviving observations actually fall on
        after_days = day_of[start_idx:][finite]
        after_span = int(after_days[-1] - after_days[0]) if after_days.size > 1 else 0
        if after.size < min_persistence or after_span < min_persistence_days:
            # too close to the end of the window to judge; say so rather than
            # promoting it to a confirmation it has not earned
            provisional[y, x] = True
            continue
        if np.median(after) < -persistence_fraction * drop:
            persisted[y, x] = True
        else:
            posterior[y, x] = 0.0
            confirm_at[y, x] = -1

    confirmed = persisted

    return DetectionResult(
        posterior=posterior,
        provisional=provisional,
        confirmed=confirmed,
        first_flag_index=first_flag,
        confirm_index=confirm_at,
        dates=monitor_dates,
        forest_mu=f_level,
        nonforest_mu=float(np.nanmedian(f_level) - drop),
        expected_drop=drop,
        seasonal_amplitude=(
            float(np.nanmean(model.amplitude())) if model is not None else None
        ),
        fallback_fraction=(
            float(model.insufficient.mean()) if model is not None else None
        ),
    )
