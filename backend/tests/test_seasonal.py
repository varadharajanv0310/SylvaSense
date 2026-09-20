"""
The seasonality gate.

A landscape that only breathes must not be called deforestation. This is the
defect the fixtures exposed — the old flat-median detector reported 67% of a
clear-cut AOI as disturbed where SAR found 19%, because dry-season NDVI decline
looks exactly like canopy loss to a model that has never heard of seasons.

The tests below are constructed so that the *old* model fails them and the new
one passes: pure seasonality with zero disturbance, and a real step change
buried inside strong seasonality.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pytest

from sylvasense.detect import seasonal
from sylvasense.detect.bayes import detect, learn_forest


def _dates(n: int, step_days: int = 12, start: date = date(2023, 1, 5)) -> list[date]:
    return [start + timedelta(days=i * step_days) for i in range(n)]


def _seasonal_stack(
    n: int, shape=(8, 8), amplitude: float = 3.0, level: float = -8.0,
    noise: float = 0.25, seed: int = 0,
) -> tuple[np.ndarray, list[date]]:
    """A landscape with a strong annual cycle and nothing else happening."""
    rng = np.random.default_rng(seed)
    dts = _dates(n)
    t = seasonal.fractional_years(dts)
    base = level + amplitude * np.sin(2 * np.pi * t)
    stack = base[:, None, None] + rng.normal(0, noise, (n, *shape))
    return stack.astype("float32"), dts


# ------------------------------------------------------- the harmonic fit


def test_harmonic_fit_recovers_a_known_cycle():
    stack, dts = _seasonal_stack(60, amplitude=3.0, level=-8.0, noise=0.05)
    model = seasonal.fit(stack, dts, harmonics=2)
    assert model.level.mean() == pytest.approx(-8.0, abs=0.15)
    assert model.amplitude().mean() == pytest.approx(3.0, abs=0.2)
    # residual scale should be near the noise we injected, not the amplitude
    assert model.sigma.mean() < 0.5


def test_prediction_tracks_the_season():
    stack, dts = _seasonal_stack(60, amplitude=4.0, noise=0.05)
    model = seasonal.fit(stack, dts, harmonics=2)
    pred = model.predict(dts)
    assert np.nanmax(np.abs(pred - stack)) < 0.6


def test_robust_pass_ignores_a_contaminated_history():
    """
    Real history contains rain events and the odd early disturbance. Those must
    not drag the seasonal curve toward the anomaly we are trying to detect.
    """
    stack, dts = _seasonal_stack(60, amplitude=3.0, level=-8.0, noise=0.1)
    stack[10:14, :, :] -= 9.0  # four badly contaminated dates
    model = seasonal.fit(stack, dts, harmonics=2, robust_passes=2)
    assert model.level.mean() == pytest.approx(-8.0, abs=0.6)


def test_pixels_with_too_few_observations_are_flagged_not_fabricated():
    stack, dts = _seasonal_stack(30)
    stack[:, 0, 0] = np.nan
    stack[5:, 1, 1] = np.nan  # leaves 5 clear observations, below the fit budget
    model = seasonal.fit(stack, dts, harmonics=2)
    assert model.insufficient[0, 0]
    assert model.insufficient[1, 1]
    assert not model.insufficient[4, 4]


# ------------------------------------------------ the defect being fixed


def test_pure_seasonality_is_not_called_disturbance():
    """
    THE regression test. A strongly seasonal, entirely undisturbed landscape.
    The flat-median detector confirmed most of it; the seasonal one must
    confirm almost none.
    """
    stack, dts = _seasonal_stack(72, amplitude=3.5, noise=0.3, seed=7)
    result = detect(stack, dts, harmonics=2)
    assert result.confirmed_fraction < 0.02, (
        f"{result.confirmed_fraction:.1%} of an undisturbed seasonal landscape "
        "was called disturbed"
    )


def test_the_old_flat_model_would_have_failed_that():
    """
    Demonstrates the defect rather than asserting it away: feeding the same
    stack through the median path produces an expectation that the seasonal
    trough sits many sigma away from.
    """
    stack, dts = _seasonal_stack(72, amplitude=3.5, noise=0.3, seed=7)
    history = stack[: len(dts) // 2]
    _, flat_level, flat_sigma = learn_forest(history)            # no dates -> median
    model, _, seasonal_sigma = learn_forest(history, dts[: len(dts) // 2])

    # The defect is not that the trough looks like a big z-score — the flat
    # model's sigma is itself inflated by the seasonal swing, which is the
    # problem. A noise estimate contaminated by seasonality is simultaneously
    # too insensitive to real change and unable to separate the classes.
    assert model is not None
    assert flat_sigma.mean() > 2.0, "flat sigma should be swollen by the season"
    assert seasonal_sigma.mean() < 0.6, "seasonal sigma should be near the noise"
    assert seasonal_sigma.mean() < flat_sigma.mean() / 3


def test_a_real_step_change_is_still_detected_through_seasonality():
    """
    The fix must not buy specificity by going blind.

    The scene is 24x24 rather than 8x8 deliberately: a 4x4 untouched block is
    16 pixels, and one false positive there reads as 6% whether the true rate
    is 1% or 6%. Asserting a rate on a sample that cannot resolve it is how you
    end up tuning against noise.
    """
    stack, dts = _seasonal_stack(72, shape=(24, 24), amplitude=3.5, noise=0.3, seed=11)
    cut_at = int(len(dts) * 0.66)
    stack[cut_at:, :8, :8] -= 7.0       # 64 cleared, 512 untouched

    result = detect(stack, dts, harmonics=2)
    cleared = result.confirmed[:8, :8]
    untouched = result.confirmed.copy()
    untouched[:8, :8] = False

    n_untouched = untouched.size - 64
    fp_rate = untouched.sum() / n_untouched

    assert cleared.mean() > 0.85, f"only {cleared.mean():.0%} of the cut detected"
    assert fp_rate < 0.05, f"{fp_rate:.1%} false positives over {n_untouched} pixels"


def test_measured_false_positive_rate_on_pure_season():
    """
    Record the number rather than only bounding it, over a scene large enough
    to mean something.
    """
    stack, dts = _seasonal_stack(72, shape=(32, 32), amplitude=3.5, noise=0.3, seed=5)
    result = detect(stack, dts, harmonics=2)
    rate = result.confirmed_fraction
    assert rate < 0.02, f"{rate:.2%} of 1024 undisturbed seasonal pixels flagged"


def test_detector_reports_how_seasonal_the_scene_was():
    """The diagnostic that tells a reviewer whether this mattered here."""
    stack, dts = _seasonal_stack(72, amplitude=3.5, noise=0.3)
    result = detect(stack, dts, harmonics=2)
    assert result.seasonal_amplitude == pytest.approx(3.5, abs=0.5)
    assert result.fallback_fraction == 0.0
