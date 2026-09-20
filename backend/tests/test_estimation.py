"""
Batch 4 gates. Both are pass/fail, not directional.

The area test checks the estimator against numbers computed by hand from
Olofsson's equations, because an area estimator that is quietly wrong is worse
than no area estimator: it produces a plausible figure with a confidence
interval around the wrong answer.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from sylvasense.area import Stratum, allocate_sample, draw_sample, estimate
from sylvasense.conformal import (
    SplitConformal,
    blocked_split,
    evaluate_coverage,
)


# ------------------------------------------------------------------- area


def test_stratified_estimator_matches_hand_computation():
    """
    Worked by hand from Olofsson et al. eq. 9-10.

      strata: change W=0.02 (2,000 of 100,000 px), no-change W=0.98
      sample: 100 from each
              change stratum   -> 80 really change, 20 really not
              no-change stratum ->  5 really change, 95 really not

      p_change = 0.02*(80/100) + 0.98*(5/100) = 0.016 + 0.049 = 0.065
      var      = 0.02^2 * (0.8*0.2)/99 + 0.98^2 * (0.05*0.95)/99
               = 6.46465e-7 + 4.60800e-4 = 4.61447e-4
      SE       = 0.0214813
    """
    strata = [
        Stratum("change", 2_000, ["change"] * 80 + ["no-change"] * 20),
        Stratum("no-change", 98_000, ["change"] * 5 + ["no-change"] * 95),
    ]
    a = estimate(strata, total_area_ha=100_000.0)
    change = a.estimates["change"]

    assert change.proportion == pytest.approx(0.065, abs=1e-9)
    assert change.standard_error == pytest.approx(0.0214813, abs=1e-6)
    assert change.area_ha == pytest.approx(6_500.0, abs=1e-6)

    # the interval is symmetric about the estimate at 1.96 SE; compare against
    # the estimator's own SE rather than a hand-rounded constant, which is only
    # good to ~7 places and would fail spuriously
    lo, hi = change.area_ci_ha
    half = 1.959963985 * change.standard_error * 100_000
    assert lo == pytest.approx(6_500 - half, rel=1e-9)
    assert hi == pytest.approx(6_500 + half, rel=1e-9)
    assert half == pytest.approx(4_210.0, abs=1.0)  # ~ +/- 4,210 ha at 95%


def test_map_counting_is_biased_and_the_bias_is_reported():
    """The whole reason this module exists: 2% mapped, 6.5% actual."""
    strata = [
        Stratum("change", 2_000, ["change"] * 80 + ["no-change"] * 20),
        Stratum("no-change", 98_000, ["change"] * 5 + ["no-change"] * 95),
    ]
    change = estimate(strata, 100_000.0).estimates["change"]
    assert change.mapped_area_ha == pytest.approx(2_000.0)
    assert change.area_ha == pytest.approx(6_500.0)
    # counting pixels would have understated the loss by 4,500 ha
    assert change.bias_ha == pytest.approx(-4_500.0)


def test_accuracy_measures():
    strata = [
        Stratum("change", 2_000, ["change"] * 80 + ["no-change"] * 20),
        Stratum("no-change", 98_000, ["change"] * 5 + ["no-change"] * 95),
    ]
    a = estimate(strata, 100_000.0)
    assert a.users_accuracy["change"] == pytest.approx(0.80)
    assert a.overall_accuracy == pytest.approx(0.02 * 0.80 + 0.98 * 0.95)
    # producer's accuracy of change: 0.016 / 0.065
    assert a.producers_accuracy["change"] == pytest.approx(0.016 / 0.065)


def test_a_perfect_map_is_unbiased():
    strata = [
        Stratum("change", 5_000, ["change"] * 50),
        Stratum("no-change", 95_000, ["no-change"] * 50),
    ]
    a = estimate(strata, 1_000.0)
    assert a.estimates["change"].proportion == pytest.approx(0.05)
    assert a.estimates["change"].standard_error == pytest.approx(0.0)
    assert a.overall_accuracy == pytest.approx(1.0)


def test_undersized_stratum_is_refused_not_guessed():
    with pytest.raises(ValueError, match="fewer than 2"):
        estimate([Stratum("change", 10, ["change"]),
                  Stratum("no", 90, ["no"] * 30)], 100.0)


def test_small_samples_raise_a_warning():
    a = estimate(
        [Stratum("change", 2_000, ["change"] * 8 + ["no"] * 2),
         Stratum("no", 98_000, ["no"] * 10)],
        100_000.0,
    )
    assert any("sample units" in w for w in a.warnings)


def test_rare_class_gets_a_floor_not_proportional_starvation():
    alloc = allocate_sample(
        {"change": 2_000, "no-change": 998_000},
        total_sample=500,
        rare_classes=["change"],
        min_per_stratum=50,
    )
    assert alloc["change"] >= 50          # proportional would have given ~1
    assert sum(alloc.values()) == 500


def test_draw_sample_is_within_the_stratum():
    mask = np.zeros((20, 20), bool)
    mask[5:10, 5:10] = True
    pts = draw_sample(mask, 12, seed=1)
    assert len(pts) == 12
    assert all(mask[y, x] for y, x in pts)
    assert len(set(pts)) == 12  # without replacement


# -------------------------------------------------------------- conformal


def test_conformal_coverage_reaches_nominal():
    rng = np.random.default_rng(0)
    n = 4000
    truth = rng.normal(150, 40, n)
    pred = truth + rng.normal(0, 18, n)  # a biased-free but noisy model

    cal, test = slice(0, n // 2), slice(n // 2, None)
    cp = SplitConformal(level=0.9).calibrate(truth[cal], pred[cal])
    iv = cp.interval(pred[test])
    report = evaluate_coverage(truth[test], iv)

    assert report.passes, f"coverage {report.empirical:.3f} below nominal {report.nominal}"
    assert 0.88 <= report.empirical <= 0.95


def test_conformal_widens_for_a_worse_model():
    rng = np.random.default_rng(1)
    truth = rng.normal(100, 30, 2000)
    tight = SplitConformal(0.9).calibrate(truth, truth + rng.normal(0, 5, 2000))
    loose = SplitConformal(0.9).calibrate(truth, truth + rng.normal(0, 25, 2000))
    assert loose.quantile_ > tight.quantile_ * 2


def test_interval_respects_a_physical_floor():
    cp = SplitConformal(0.9)
    cp.quantile_ = 50.0
    iv = cp.interval(np.array([10.0, 200.0]), floor=0.0)
    assert iv.lower[0] == 0.0          # biomass cannot be negative
    assert iv.lower[1] == pytest.approx(150.0)


def test_too_few_calibration_points_is_refused():
    with pytest.raises(ValueError, match="calibration residuals"):
        SplitConformal(0.9).calibrate(np.arange(10.0), np.arange(10.0))


def test_blocked_split_separates_neighbourhoods():
    """
    The point of blocking: a random split would put a pixel's neighbour in the
    other half, leak the answer, and produce intervals that are too narrow.
    """
    rng = np.random.default_rng(3)
    coords = rng.uniform(0, 100, (2000, 2))
    cal, test = blocked_split(coords, 0.5, n_blocks=16, seed=3)

    assert cal.sum() > 0 and test.sum() > 0
    assert not np.any(cal & test)
    # blocks are contiguous in space, so the two halves occupy different ground
    assert abs(coords[cal].mean(axis=0)[0] - coords[test].mean(axis=0)[0]) > 1.0
