"""
Wall-to-wall aboveground biomass, calibrated against GEDI footprints.

GEDI measures biomass well and covers almost nothing: 25 m footprints on beams
600 m apart, so a given hectare is sampled roughly never. Sentinel-1 and -2
cover everything and measure biomass badly. The standard move - and the one
taken here - is to use GEDI as the reference and the imagery as the predictor,
fitting a model on the footprints where both exist and applying it everywhere.

Three decisions in this module are the ones that matter:

**The model's own uncertainty is not used.** A gradient-boosted ensemble's
spread across trees is a number that correlates with confidence on the training
distribution and means nothing off it. Intervals come from split conformal
instead, which gives finite-sample coverage for any model.

**The split is three-way and geographic.** Train, calibrate and test are
disjoint sets of spatial *blocks*, never a random shuffle of footprints. Shots
60 m apart along a beam are nearly the same observation; a random split puts
one in train and its twin in calibration, the residuals come out small, and
the intervals are confidently too narrow exactly where they matter. The blocked
split is what makes the reported coverage mean something.

**C-band saturates.** Sentinel-1 backscatter stops responding to biomass
somewhere around 100-150 Mg/ha, which is below most of the Amazon. The model
can still separate forest from not-forest and can rank moderately stocked
stands, but it cannot resolve 250 from 350 Mg/ha, and the conformal interval
widens to say so rather than pretending otherwise. This is a limit of the
sensor, not of the fit, and it is reported as a caveat on every prediction.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

import numpy as np
import structlog

from .aoi import AOI
from .cache import cache
from .conformal import (
    ConformalInterval,
    CoverageReport,
    SplitConformal,
    evaluate_coverage,
    spatial_blocks,
)
from .sources.gedi import ShotSet, _authenticate, _region_for, collect_shots
from .sources.stac import load_window, search_items

log = structlog.get_logger(__name__)

VERSION = "0.1.0"

#: Model grid. Finer than this and GEDI geolocation error (~10 m, 1-sigma) plus
#: footprint/pixel mismatch dominates; coarser and the map stops being useful.
GRID_M = 100.0
#: The stack is loaded in EPSG:4326 so its axes *are* longitude and latitude and
#: footprints can be looked up without a reprojection step. The cost is that a
#: cell is only square at the equator; at 11 degrees south a 0.0009 degree cell
#: is 100 m north-south and 98 m east-west, which is below the noise of matching
#: a 25 m footprint to a 100 m pixel at all.
GRID_DEG = GRID_M / 111_320.0
#: scenes to stack per sensor - enough for a stable median, few enough to read
MAX_S1_ITEMS = 24
MAX_S2_ITEMS = 12
#: below this the fit is not worth reporting at all
MIN_TRAIN = 120
#: conformal needs a calibration set with a meaningful quantile
MIN_CALIB = 40
#: predictors are averaged over this many cells on a side when sampling
WINDOW = 3

FEATURES = (
    "vv_db",
    "vh_db",
    "rvi",
    "vh_std",
    "ndvi",
    "ndmi",
    "nir",
    "swir",
    "elevation",
    "slope",
)


@dataclass
class FeatureGrid:
    """Predictors on a regular grid, with the lon/lat of every cell centre."""

    data: np.ndarray  # (n_features, ny, nx)
    lon: np.ndarray  # (nx,)
    lat: np.ndarray  # (ny,)
    names: tuple[str, ...]
    sources: dict[str, Any] = field(default_factory=dict)

    @property
    def shape(self) -> tuple[int, int]:
        return self.data.shape[1], self.data.shape[2]

    def index_of(self, lon: np.ndarray, lat: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Cell (row, col) for each point, plus a mask of which ones are on the grid."""
        xi = np.clip(np.searchsorted(self.lon, lon), 0, len(self.lon) - 1)
        # lat descends in raster order, so search the reversed axis
        yi = len(self.lat) - 1 - np.searchsorted(self.lat[::-1], lat)
        yi = np.clip(yi, 0, len(self.lat) - 1)
        inside = (
            (lon >= self.lon.min())
            & (lon <= self.lon.max())
            & (lat >= self.lat.min())
            & (lat <= self.lat.max())
        )
        return yi, xi, inside

    def sample(
        self, lon: np.ndarray, lat: np.ndarray, *, window: int = WINDOW
    ) -> np.ndarray:
        """
        Features at each point, averaged over a `window` x `window` box.

        Point sampling looks more precise and is not. A single 100 m SAR cell
        still carries speckle after the temporal median, and GEDI geolocation
        is good to about 10 m one-sigma, so 'the pixel under the footprint' is
        already a fiction at this scale. Averaging a 300 m box trades an
        imaginary precision for a real reduction in predictor noise.
        """
        yi, xi, inside = self.index_of(lon, lat)
        r = max(0, window // 2)
        ny, nx = self.shape
        acc = np.zeros((len(FEATURES), len(lon)), dtype="float64")
        cnt = np.zeros((len(FEATURES), len(lon)), dtype="float64")
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                v = self.data[:, np.clip(yi + dy, 0, ny - 1), np.clip(xi + dx, 0, nx - 1)]
                ok = np.isfinite(v)
                acc += np.where(ok, v, 0.0)
                cnt += ok
        with np.errstate(invalid="ignore", divide="ignore"):
            out = (acc / cnt).T
        out[~inside] = np.nan
        return out

    def flat(self) -> np.ndarray:
        """(ny*nx, n_features) for wall-to-wall prediction."""
        return self.data.reshape(self.data.shape[0], -1).T.astype("float64")


def _region_aoi(region: tuple[float, float, float, float]) -> AOI:
    w, s, e, n = region
    return AOI.from_bbox(w, s, e, n, id="biomass-region", name="biomass fit region")


def _axes(ds) -> tuple[np.ndarray, np.ndarray]:
    """
    Cell-centre lon/lat. Because the stack is requested in EPSG:4326 these are
    the axes themselves. An earlier version loaded in UTM and reprojected the
    axes here; it silently returned metres whenever the rioxarray accessor was
    not registered, every footprint fell outside the grid, and the failure
    surfaced three steps later as 'no footprints on the grid'. Asking for the
    CRS we want is cheaper than detecting the one we got.
    """
    # in EPSG:4326 odc-stac names the dims longitude/latitude, in a projected
    # CRS it names them x/y
    xname = "longitude" if "longitude" in ds.coords else "x"
    yname = "latitude" if "latitude" in ds.coords else "y"
    x = np.asarray(ds[xname].values, float)
    y = np.asarray(ds[yname].values, float)
    if np.nanmax(np.abs(x)) > 360 or np.nanmax(np.abs(y)) > 90:
        raise RuntimeError(
            f"predictor stack is not in degrees (x up to {np.nanmax(np.abs(x)):.0f}); "
            "the CRS request did not take effect"
        )
    return x, y


def build_features(
    region: tuple[float, float, float, float], start: date, end: date
) -> FeatureGrid:
    """
    Stack the predictors over `region`. Every band is optional: a missing
    sensor leaves its columns NaN, which the gradient booster handles natively
    rather than refusing to run. What it cannot do is invent the signal, so the
    source inventory travels with the grid and into the provenance envelope.
    """
    aoi = _region_aoi(region)
    layers: dict[str, np.ndarray] = {}
    sources: dict[str, Any] = {}
    lon = lat = None

    # --- Sentinel-1 RTC: the structural predictor -------------------------
    try:
        items = search_items("sentinel-1-rtc", aoi, start, end)
        if items:
            items = items[:MAX_S1_ITEMS]
            ds = load_window(
                items,
                aoi,
                bands=["vv", "vh"],
                resolution=GRID_DEG,
                crs="EPSG:4326",
                chunks={"longitude": 512, "latitude": 512},
            )
            vv = ds["vv"].where(ds["vv"] > 0)
            vh = ds["vh"].where(ds["vh"] > 0)
            vv_db = (10 * np.log10(vv)).median("time").compute()
            vh_med = (10 * np.log10(vh)).median("time").compute()
            vh_sd = (10 * np.log10(vh)).std("time").compute()
            lon, lat = _axes(ds)
            layers["vv_db"] = np.asarray(vv_db.values, "float32")
            layers["vh_db"] = np.asarray(vh_med.values, "float32")
            # the cross-pol excess, which is what volume scattering in a
            # canopy actually produces; bare ground has almost none
            layers["rvi"] = layers["vh_db"] - layers["vv_db"]
            layers["vh_std"] = np.asarray(vh_sd.values, "float32")
            sources["sentinel-1-rtc"] = {"scenes": len(items)}
    except Exception as exc:
        log.warning("biomass_s1_failed", error=str(exc))

    # --- Sentinel-2: the spectral predictor -------------------------------
    try:
        items = search_items("sentinel-2-l2a", aoi, start, end)
        clear = [
            i
            for i in items
            if float(i.get("properties", {}).get("eo:cloud_cover", 100)) < 20
        ][:MAX_S2_ITEMS]
        if clear:
            ds = load_window(
                clear,
                aoi,
                bands=["B04", "B08", "B11", "SCL"],
                resolution=GRID_DEG,
                crs="EPSG:4326",
                chunks={"longitude": 512, "latitude": 512},
            )
            scl = ds["SCL"]
            # SCL 4 and 5 are vegetation and bare soil; everything else is
            # cloud, shadow, water or snow and has no place in a composite
            keep = (scl == 4) | (scl == 5)
            red = ds["B04"].where(keep).astype("float32")
            nir = ds["B08"].where(keep).astype("float32")
            swir = ds["B11"].where(keep).astype("float32")
            ndvi = ((nir - red) / (nir + red)).median("time").compute()
            ndmi = ((nir - swir) / (nir + swir)).median("time").compute()
            if lon is None:
                lon, lat = _axes(ds)
            layers["ndvi"] = np.asarray(ndvi.values, "float32")
            layers["ndmi"] = np.asarray(ndmi.values, "float32")
            layers["nir"] = np.asarray(nir.median("time").compute().values, "float32")
            layers["swir"] = np.asarray(swir.median("time").compute().values, "float32")
            sources["sentinel-2-l2a"] = {"scenes": len(clear)}
    except Exception as exc:
        log.warning("biomass_s2_failed", error=str(exc))

    # --- terrain: not a biomass signal, a confounder to hold constant -----
    try:
        items = search_items("nasadem", aoi, date(2000, 1, 1), date(2001, 1, 1))
        if items:
            ds = load_window(
                items[:1], aoi, bands=["elevation"],
                resolution=GRID_DEG, crs="EPSG:4326",
            )
            z = np.asarray(ds["elevation"].values, "float32")
            while z.ndim > 2:
                z = z[0]
            gy, gx = np.gradient(z.astype("float64"), GRID_M, GRID_M)
            if lon is None:
                lon, lat = _axes(ds)
            layers["elevation"] = z
            layers["slope"] = np.degrees(np.arctan(np.hypot(gx, gy))).astype("float32")
            sources["nasadem"] = {"scenes": 1}
    except Exception as exc:
        log.warning("biomass_terrain_failed", error=str(exc))

    if lon is None or not layers:
        raise RuntimeError("no predictor layers could be loaded for the region")

    ny, nx = next(iter(layers.values())).shape
    stack = np.full((len(FEATURES), ny, nx), np.nan, dtype="float32")
    for i, name in enumerate(FEATURES):
        arr = layers.get(name)
        if arr is not None and arr.shape == (ny, nx):
            stack[i] = arr
    return FeatureGrid(stack, np.asarray(lon), np.asarray(lat), FEATURES, sources)


def _aggregate_to_cells(
    grid: FeatureGrid, shots: ShotSet
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Collapse footprints onto grid cells before fitting.

    A single L4A footprint carries a prediction interval well over 100 Mg/ha.
    Regressing one noisy 25 m shot onto one 100 m pixel asks the features to
    explain variance that is mostly measurement error, and they cannot, so the
    fit looks worthless when the real problem is the target. The map claims to
    predict a *cell* value anyway, so the cell mean is both the less noisy
    target and the honest one.
    """
    yi, xi, inside = grid.index_of(shots.lon, shots.lat)
    agbd = shots.agbd.astype("float64")
    ok = inside & np.isfinite(agbd)
    if not ok.any():
        return np.empty((0, len(FEATURES))), np.array([]), np.empty((0, 2)), np.array([])

    ny, nx = grid.shape
    flat = yi[ok] * nx + xi[ok]
    uniq, inv = np.unique(flat, return_inverse=True)
    counts = np.bincount(inv)
    means = np.bincount(inv, weights=agbd[ok]) / counts

    cell_y, cell_x = uniq // nx, uniq % nx
    clon, clat = grid.lon[cell_x], grid.lat[cell_y]
    X = grid.sample(clon, clat)
    good = np.isfinite(X).any(axis=1)
    return X[good], means[good], np.column_stack([clon, clat])[good], counts[good]


def blocked_folds(
    coords: np.ndarray, *, n_blocks: int = 36, n_folds: int = 5, seed: int = 0
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Split into fit and test by spatial block, then assign the fit blocks to
    cross-validation folds - also by block, never by point.

    Blocking is the whole point. Shots 60 m apart along a beam are nearly the
    same observation; put one in training and its twin in calibration and the
    residuals come out small, the intervals narrow, and the coverage number
    becomes a measurement of the leak rather than of the model.

    Returns (fit_mask, test_mask, fold_id_for_fit_points).
    """
    blocks = spatial_blocks(coords, n_blocks, seed=seed)
    uniq = np.unique(blocks)
    n_test = max(1, int(len(uniq) * 0.25))
    test_b = set(uniq[-n_test:].tolist())
    test_mask = np.array([b in test_b for b in blocks])
    fit_mask = ~test_mask

    fit_blocks = [b for b in uniq if b not in test_b]
    fold_of = {b: i % max(1, min(n_folds, len(fit_blocks))) for i, b in enumerate(fit_blocks)}
    folds = np.array([fold_of.get(b, -1) for b in blocks[fit_mask]])
    return fit_mask, test_mask, folds


@dataclass
class BiomassFit:
    """A fitted model plus the evidence that its intervals are honest."""

    model: Any
    conformal: SplitConformal
    coverage: CoverageReport
    n_train: int
    n_calib: int
    n_test: int
    rmse: float
    bias: float
    r2: float
    gedi_mean: float
    region: tuple[float, float, float, float]
    grid: FeatureGrid
    shots: int
    cells: int
    shots_per_cell: float
    saturation_note: str
    held_out: bool = True
    importances: dict[str, float] = field(default_factory=dict)

    @property
    def usable(self) -> bool:
        return self.coverage.passes and self.n_train >= MIN_TRAIN

    @property
    def ranks_cells(self) -> bool:
        """
        Whether the map carries spatial *pattern*, as opposed to a level.

        In intact interior forest this comes out false and that is the correct
        answer, not a bug: neighbouring hectares really do hold the same stock,
        so almost all of GEDI's cell-to-cell scatter there is its own
        measurement error, and no predictor can or should reproduce it. The
        interval still covers; the ranking is what fails, and the envelope has
        to say which of the two it is.
        """
        return self.r2 > 0.1

    def caveats(self) -> list[str]:
        w, s_, e, n = self.region
        span_km = (e - w) * 111.0
        out = [
            self.saturation_note,
            f"the model is fitted over a {span_km:.0f} km box, not over the "
            "plot: GEDI does not sample a single hectare densely enough to "
            "calibrate anything, so the plot value is this regional model "
            "evaluated locally",
            "GEDI L4A is itself a model over waveform metrics, not a measurement "
            "of biomass; its error propagates into everything calibrated to it",
            f"footprints are matched to {GRID_M:.0f} m cells and GEDI geolocation "
            "is about 10 m, so the map inherits that blur",
        ]
        if not self.ranks_cells:
            out.append(
                f"R2 {self.r2:.2f} on held-out blocks: the model does not rank "
                "cells inside this region, so read the map as a level with an "
                "interval rather than as a pattern"
            )
        return out

    def as_dict(self) -> dict:
        return {
            "version": VERSION,
            "n_train": self.n_train,
            "n_calibration": self.n_calib,
            "n_test": self.n_test,
            "gedi_footprints": self.shots,
            "grid_cells_with_footprints": self.cells,
            "footprints_per_cell": round(self.shots_per_cell, 2),
            "rmse_mg_ha": round(self.rmse, 1),
            "bias_mg_ha": round(self.bias, 1),
            "r2": round(self.r2, 3),
            "gedi_mean_mg_ha": round(self.gedi_mean, 1),
            "coverage": self.coverage.as_dict(),
            "coverage_on_held_out_blocks": self.held_out,
            "grid_resolution_m": GRID_M,
            "feature_importance": {
                k: round(v, 3)
                for k, v in sorted(self.importances.items(), key=lambda kv: -kv[1])[:6]
            },
            "predictor_sources": self.grid.sources,
            "saturation": self.saturation_note,
            "ranks_cells": self.ranks_cells,
            "caveats": self.caveats(),
        }


def fit_biomass(
    aoi: AOI,
    end: date,
    *,
    level: float = 0.9,
    years: int = 3,
    seed: int = 0,
) -> BiomassFit:
    """
    Fit AGBD ~ imagery over the AOI's region, calibrate, and measure coverage
    on blocks the model has never seen.
    """
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.inspection import permutation_importance

    if not _authenticate():
        raise RuntimeError(
            "GEDI needs SYLVA_EARTHDATA_TOKEN; there is no reference data without it"
        )

    region = _region_for(aoi)
    start = end - timedelta(days=365 * years)

    shots: ShotSet = cache.fetch(
        "gedi-l4a",
        {"region": [round(v, 3) for v in region], "end": end.isoformat()},
        lambda: collect_shots(region, end),
    ).value
    if shots.n_quality < MIN_TRAIN:
        raise RuntimeError(
            f"only {shots.n_quality} quality GEDI footprints in the region; "
            f"need >= {MIN_TRAIN} to fit anything worth calibrating"
        )

    grid: FeatureGrid = cache.fetch(
        "biomass-features",
        {
            "region": [round(v, 3) for v in region],
            "end": end.isoformat(),
            "res": GRID_M,
        },
        lambda: build_features(region, start, end),
    ).value

    X, y, coords, per_cell = _aggregate_to_cells(grid, shots)
    if y.size < MIN_TRAIN:
        raise RuntimeError(
            f"only {y.size} grid cells carry a footprint; not enough to fit"
        )

    fit_mask, test_mask, folds = blocked_folds(coords, seed=seed)
    if fit_mask.sum() < MIN_TRAIN or test_mask.sum() < 20:
        raise RuntimeError(
            f"spatial blocks split unusably ({fit_mask.sum()} fit / "
            f"{test_mask.sum()} test); the footprints are probably confined "
            "to one or two beam tracks"
        )

    def _new_model():
        return HistGradientBoostingRegressor(
            max_depth=6,
            max_iter=300,
            learning_rate=0.06,
            min_samples_leaf=25,
            l2_regularization=1.0,
            random_state=seed,
        )

    # Cross-conformal over spatial folds. A single split calibrates on one
    # patch of ground and is then asked to cover a different patch; when the
    # model is not spatially stationary the residuals there are larger and the
    # intervals come out too narrow. Measured on this region that showed up as
    # 0.865 coverage against a nominal 0.90. Rotating the fold makes every
    # block out-of-fold exactly once, so the pooled residuals carry the
    # between-block variation rather than averaging it away.
    Xf, yf, wf = X[fit_mask], y[fit_mask], np.sqrt(per_cell[fit_mask])
    oof = np.full(yf.size, np.nan)
    for f in np.unique(folds):
        hold = folds == f
        if hold.all() or hold.sum() == 0:
            continue
        m = _new_model()
        m.fit(Xf[~hold], yf[~hold], sample_weight=wf[~hold])
        oof[hold] = m.predict(Xf[hold])
    got = np.isfinite(oof)
    if got.sum() < MIN_CALIB:
        raise RuntimeError(f"only {got.sum()} out-of-fold residuals; cannot calibrate")
    conf = SplitConformal(level=level).calibrate(yf[got], oof[got])

    # the shipped model sees every fit block; only the test blocks stay unseen
    model = _new_model()
    model.fit(Xf, yf, sample_weight=wf)

    truth, pred = y[test_mask], model.predict(X[test_mask])
    held_out = True
    cover = evaluate_coverage(truth, conf.interval(pred))

    resid = truth - pred
    rmse = float(np.sqrt(np.mean(resid**2)))
    bias = float(np.mean(resid))
    var = float(np.var(truth))
    r2 = float(1 - np.mean(resid**2) / var) if var > 0 else 0.0

    importances: dict[str, float] = {}
    try:
        n_imp = min(600, truth.size)
        pi = permutation_importance(
            model, X[test_mask][:n_imp], truth[:n_imp], n_repeats=4, random_state=seed
        )
        total = float(np.sum(np.clip(pi.importances_mean, 0, None))) or 1.0
        importances = {
            name: float(max(v, 0.0)) / total
            for name, v in zip(grid.names, pi.importances_mean)
        }
    except Exception as exc:
        log.warning("biomass_importance_failed", error=str(exc))

    gedi_mean = float(np.mean(y))
    note = (
        "C-band backscatter saturates near 100-150 Mg/ha; above that the model "
        "is interpolating between spectral and terrain cues, and the intervals "
        "widen accordingly"
        if gedi_mean > 120
        else "stocks here are mostly below C-band saturation, where the SAR "
        "predictors carry real information"
    )

    return BiomassFit(
        model=model,
        conformal=conf,
        coverage=cover,
        n_train=int(fit_mask.sum()),
        n_calib=int(got.sum()),
        n_test=int(test_mask.sum()),
        rmse=rmse,
        bias=bias,
        r2=r2,
        gedi_mean=gedi_mean,
        region=region,
        grid=grid,
        shots=int(per_cell.sum()),
        cells=int(y.size),
        shots_per_cell=float(np.mean(per_cell)),
        saturation_note=note,
        held_out=held_out,
        importances=importances,
    )


@dataclass
class BiomassMap:
    mean: np.ndarray
    lower: np.ndarray
    upper: np.ndarray
    lon: np.ndarray
    lat: np.ndarray
    level: float

    def summary(self, bbox: tuple[float, float, float, float] | None = None) -> dict:
        """Mean stock over a sub-box, or over the whole grid."""
        m, lo, hi = self.mean, self.lower, self.upper
        if bbox:
            w, s, e, n = bbox
            xs = (self.lon >= w) & (self.lon <= e)
            ys = (self.lat >= s) & (self.lat <= n)
            if xs.any() and ys.any():
                sel = np.ix_(ys, xs)
                m, lo, hi = m[sel], lo[sel], hi[sel]
        ok = np.isfinite(m)
        if not ok.any():
            return {}
        # the interval on the *mean* of correlated cells, not the average of
        # per-cell intervals - the same mistake the GEDI source had to unlearn.
        # 25 is the number of 100 m cells in a 500 m correlation patch.
        n_eff = max(ok.sum() / 25.0, 1.0)
        half = float(np.nanmean(hi[ok] - lo[ok])) / 2.0 / math.sqrt(n_eff)
        mean = float(np.nanmean(m[ok]))
        return {
            "agbd_mean": round(mean, 1),
            "agbd_low": round(max(0.0, mean - half), 1),
            "agbd_high": round(mean + half, 1),
            "carbon_mean": round(mean * 0.47, 1),
            "cells": int(ok.sum()),
            "level": self.level,
        }


def predict_map(fit: BiomassFit) -> BiomassMap:
    """Apply the fitted model wall to wall, with conformal bounds."""
    flat = fit.grid.flat()
    ok = np.isfinite(flat).any(axis=1)
    pred = np.full(flat.shape[0], np.nan)
    if ok.any():
        pred[ok] = fit.model.predict(flat[ok])
    iv: ConformalInterval = fit.conformal.interval(pred)
    ny, nx = fit.grid.shape
    return BiomassMap(
        mean=pred.reshape(ny, nx),
        lower=np.asarray(iv.lower).reshape(ny, nx),
        upper=np.asarray(iv.upper).reshape(ny, nx),
        lon=fit.grid.lon,
        lat=fit.grid.lat,
        level=fit.conformal.level,
    )
