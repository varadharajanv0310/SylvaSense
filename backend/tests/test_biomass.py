"""
The biomass estimator, exercised without a network.

Every live check of this module costs minutes of HDF5 and COG reads, so the
parts that can be wrong quietly — the grid lookup, the spatial splitting, the
aggregation, the conformal coverage — are pinned here on synthetic data where
the truth is known.
"""

from datetime import date, timedelta

import numpy as np
import pytest

from sylvasense.biomass import (
    FEATURES,
    FeatureGrid,
    _aggregate_to_cells,
    blocked_folds,
    predict_map,
)
from sylvasense.conformal import SplitConformal, evaluate_coverage
from sylvasense.sources.gedi import ShotSet


# --- fixtures ---------------------------------------------------------


def _truth(lon, lat):
    """A field the predictors genuinely carry, so a fit is possible at all."""
    return 260 + 90 * np.sin(lon * 9) * np.cos(lat * 7)


def _grid(ny=120, nx=140, noise=0.0, seed=0):
    rng = np.random.default_rng(seed)
    lon = np.linspace(-64.3, -63.6, nx)
    # descending, the order a raster actually comes in
    lat = np.linspace(-10.7, -11.4, ny)
    LON, LAT = np.meshgrid(lon, lat)
    t = _truth(LON, LAT)

    stack = np.full((len(FEATURES), ny, nx), np.nan, "float32")
    idx = FEATURES.index
    stack[idx("vh_db")] = (-18 + t / 40 + rng.normal(0, noise, (ny, nx))).astype("float32")
    stack[idx("vv_db")] = (-10 + t / 90 + rng.normal(0, noise, (ny, nx))).astype("float32")
    stack[idx("rvi")] = stack[idx("vh_db")] - stack[idx("vv_db")]
    stack[idx("ndvi")] = (0.4 + t / 900 + rng.normal(0, noise / 20, (ny, nx))).astype("float32")
    stack[idx("elevation")] = np.full((ny, nx), 200.0, "float32")
    return FeatureGrid(stack, lon, lat, FEATURES, {"synthetic": {"scenes": 0}})


def _beam_shots(grid, n_tracks=13, per_track=190, noise=55.0, seed=1):
    """Footprints along parallel tracks — GEDI's actual sampling pattern."""
    rng = np.random.default_rng(seed)
    lons, lats = [], []
    for i in range(n_tracks):
        lons.append(np.full(per_track, -64.25 + 0.055 * i) + rng.normal(0, 4e-4, per_track))
        lats.append(np.linspace(-11.38, -10.72, per_track) + rng.normal(0, 4e-4, per_track))
    lon, lat = np.concatenate(lons), np.concatenate(lats)
    agbd = _truth(lon, lat) + rng.normal(0, noise, lon.size)
    return ShotSet(
        agbd=agbd,
        lon=lon,
        lat=lat,
        pi_lower=agbd - 100,
        pi_upper=agbd + 100,
        n_scanned=lon.size,
        n_quality=lon.size,
        region=(-64.3, -11.4, -63.6, -10.7),
        granules=1,
    )


# --- the grid ---------------------------------------------------------


def test_sample_finds_the_right_cell_despite_descending_latitude():
    """
    Latitude runs downward in raster order. Searching it the same way as
    longitude silently returns the mirror-image row, which looks like a model
    that cannot learn rather than like a lookup bug.
    """
    grid = _grid()
    # the exact centre of a known cell
    yi, xi = 30, 45
    lon = np.array([grid.lon[xi]])
    lat = np.array([grid.lat[yi]])
    got = grid.sample(lon, lat, window=1)[0, FEATURES.index("elevation")]
    assert np.isclose(got, grid.data[FEATURES.index("elevation"), yi, xi])

    ndvi = grid.sample(lon, lat, window=1)[0, FEATURES.index("ndvi")]
    assert np.isclose(ndvi, 0.4 + _truth(lon[0], lat[0]) / 900, atol=1e-3)


def test_sample_off_grid_is_nan_not_a_clamped_edge_value():
    grid = _grid()
    out = grid.sample(np.array([-70.0, -60.0]), np.array([-11.0, -11.0]))
    assert np.isnan(out).all(), "points outside the region must not borrow the edge"


def test_window_averaging_reduces_predictor_noise():
    """A 3x3 mean is the whole justification for not point-sampling."""
    grid = _grid(noise=1.5, seed=3)
    rng = np.random.default_rng(4)
    lon = rng.uniform(-64.2, -63.7, 400)
    lat = rng.uniform(-11.3, -10.8, 400)
    want = 0.4 + _truth(lon, lat) / 900

    point = grid.sample(lon, lat, window=1)[:, FEATURES.index("ndvi")]
    windowed = grid.sample(lon, lat, window=3)[:, FEATURES.index("ndvi")]
    assert np.nanstd(windowed - want) < np.nanstd(point - want)


# --- splitting --------------------------------------------------------


def test_blocked_folds_are_disjoint_and_cover_everything():
    grid = _grid()
    shots = _beam_shots(grid)
    coords = np.column_stack([shots.lon, shots.lat])
    fit, test, folds = blocked_folds(coords)

    assert not (fit & test).any(), "a point cannot be both fit and test"
    assert (fit | test).all(), "every point must land somewhere"
    assert folds.size == fit.sum()
    assert set(np.unique(folds)) != {-1}, "fit points must get real fold ids"


def test_blocking_keeps_spatial_neighbours_on_the_same_side():
    """
    The guarantee depends on this. Shots 60 m apart along a beam are nearly
    the same observation; if a random split put one in fitting and its twin in
    the test set, the residuals would come out small and the reported coverage
    would be a measurement of the leak rather than of the model.

    So the property to check is not that the test set is in one corner - the
    blocks are shuffled, so it is not - but that a point's nearest neighbour
    almost always shares its side of the split. Under a random split at this
    test fraction that would happen about 75% of the time.
    """
    grid = _grid()
    shots = _beam_shots(grid)
    coords = np.column_stack([shots.lon, shots.lat])
    fit, test, _ = blocked_folds(coords, seed=0)

    # nearest neighbour of each point, brute force (n is small here)
    d = np.linalg.norm(coords[:, None, :] - coords[None, :, :], axis=2)
    np.fill_diagonal(d, np.inf)
    nn = np.argmin(d, axis=1)
    together = float((test == test[nn]).mean())

    assert together > 0.95, (
        f"only {together:.1%} of nearest neighbours share a side; the split is "
        "leaking across the block boundary"
    )

    # and a deliberately random split must fail the same check, or the test
    # is not measuring anything
    rng = np.random.default_rng(0)
    shuffled = rng.permutation(test)
    assert float((shuffled == shuffled[nn]).mean()) < 0.95


# --- aggregation ------------------------------------------------------


def test_aggregation_to_cells_reduces_target_noise():
    """
    A single L4A footprint carries an interval over 100 Mg/ha. Regressing one
    noisy shot onto one pixel asks the predictors to explain measurement
    error. The cell mean is both quieter and the thing the map claims.
    """
    grid = _grid()
    shots = _beam_shots(grid, per_track=400, noise=60.0)
    X, y, coords, per_cell = _aggregate_to_cells(grid, shots)

    assert y.size < shots.agbd.size, "cells must be fewer than footprints"
    assert per_cell.sum() == shots.agbd.size or per_cell.sum() <= shots.agbd.size
    assert (per_cell >= 1).all()
    assert X.shape == (y.size, len(FEATURES))

    cell_truth = _truth(coords[:, 0], coords[:, 1])
    # the aggregated target sits closer to truth than a single shot does
    assert np.std(y - cell_truth) < 60.0


def test_aggregation_survives_shots_entirely_off_the_grid():
    grid = _grid()
    shots = _beam_shots(grid)
    shots.lon = shots.lon + 40.0  # far away
    X, y, coords, per_cell = _aggregate_to_cells(grid, shots)
    assert y.size == 0 and X.shape[0] == 0


# --- the guarantee ----------------------------------------------------


def test_conformal_coverage_holds_on_blocks_never_seen():
    """
    The gate the whole module exists to pass: intervals calibrated out-of-fold
    must cover at their nominal rate on blocks used for neither training nor
    calibration.
    """
    from sklearn.ensemble import HistGradientBoostingRegressor

    grid = _grid(noise=0.4, seed=5)
    shots = _beam_shots(grid, noise=55.0, seed=6)
    X, y, coords, per_cell = _aggregate_to_cells(grid, shots)
    fit, test, folds = blocked_folds(coords, seed=0)

    def model():
        return HistGradientBoostingRegressor(
            max_depth=6, max_iter=200, learning_rate=0.06,
            min_samples_leaf=25, l2_regularization=1.0, random_state=0,
        )

    Xf, yf, wf = X[fit], y[fit], np.sqrt(per_cell[fit])
    oof = np.full(yf.size, np.nan)
    for f in np.unique(folds):
        hold = folds == f
        m = model()
        m.fit(Xf[~hold], yf[~hold], sample_weight=wf[~hold])
        oof[hold] = m.predict(Xf[hold])

    conf = SplitConformal(0.9).calibrate(yf, oof)
    final = model()
    final.fit(Xf, yf, sample_weight=wf)
    cover = evaluate_coverage(y[test], conf.interval(final.predict(X[test])))

    assert cover.n >= 20
    assert cover.passes, f"coverage {cover.empirical:.3f} below nominal {cover.nominal}"


def test_map_summary_interval_is_narrower_than_a_single_cell():
    """
    The mean of many correlated cells is better determined than any one of
    them. Averaging the per-cell intervals instead would keep a single-cell
    width and overstate the doubt on a regional figure — the same mistake the
    GEDI source had to unlearn.
    """
    from types import SimpleNamespace

    grid = _grid()
    ny, nx = grid.shape
    mean = np.full((ny, nx), 200.0)
    fit = SimpleNamespace(
        grid=grid,
        model=SimpleNamespace(predict=lambda X: np.full(X.shape[0], 200.0)),
        conformal=SplitConformal(0.9).calibrate(
            np.zeros(200), np.full(200, 30.0)
        ),
    )
    bm = predict_map(fit)
    per_cell_width = float(np.nanmean(bm.upper - bm.lower))
    s = bm.summary()
    assert s["agbd_high"] - s["agbd_low"] < per_cell_width
    assert s["cells"] == mean.size
    assert s["carbon_mean"] == pytest.approx(s["agbd_mean"] * 0.47, rel=1e-3)
