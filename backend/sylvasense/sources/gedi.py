"""
GEDI L4A footprint biomass — the calibration source.

Two things about GEDI shape this module, and both were learned by trying:

**It is a sample, not a map.** GEDI beams are ~600 m apart and each footprint is
25 m across. A 6.6 km AOI often has no shots at all — CMR reports a granule as
intersecting because granule polygons are generous, while the actual track
misses. So a plot-scale request is expanded to a region, and the answer is
labelled as regional. Reporting a regional mean as if it were plot-level
biomass would be exactly the kind of quiet lie the provenance envelope exists
to prevent.

**It is slow.** Each granule is a multi-GB HDF5 read over HTTP range requests,
about 40 s apiece even reading only the arrays we need. That is fine for
building a calibration set once and caching it; it is not an interactive
source, and the request path must not block on it.

v3 ships `agbd_pi_lower`/`agbd_pi_upper` — its own prediction intervals — which
are better grounded than anything we would fit downstream, so they are carried
through rather than recomputed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date

import numpy as np
import structlog

from ..aoi import AOI
from ..cache import cache
from ..config import settings
from ..provenance import Observation, Uncertainty
from .base import Source, registry

log = structlog.get_logger(__name__)

VERSION = "0.2.0"

#: ORNL DAAC, footprint-level aboveground biomass density
L4A_COLLECTION = "GEDI_L4A_AGB_Density_V3_2508"
#: GEDI's own mission window
MISSION_START = "2019-04-18"

#: A plot-sized AOI rarely intersects a beam track. Widen to at least this many
#: degrees so the answer is based on shots that exist.
MIN_REGION_DEG = 0.7
#: below this many quality shots the regional mean is not worth reporting
MIN_SHOTS = 25
#: Granules to read per request. Each costs ~40 s, so this is a real budget
#: and not a formality — but three was too few, and the way it failed was
#: instructive. Two fixtures returned *zero* usable footprints at three
#: granules while scanning 20,036 and 16,894 shots respectively: the beams
#: crossed the region perfectly well, and every single shot failed the quality
#: filter. Three granules is a small enough sample that an unlucky draw of
#: degraded or low-sensitivity passes wipes it out entirely.
#:
#:      fixture       3 granules              8 granules
#:      intact-deep   20,036 scanned, 0 ok    63,691 scanned, 177 ok
#:      burn          16,894 scanned, 0 ok    38,446 scanned, 1,565 ok
#:
#: Eight recovers both. The cost is ~5 minutes on a cold region, which is why
#: this is cached and why the module docstring insists it is a calibration
#: source rather than an interactive one.
MAX_GRANULES = 8


@dataclass
class ShotSet:
    agbd: np.ndarray
    #: footprint centres, needed to sample imagery features at each shot
    lon: np.ndarray
    lat: np.ndarray
    pi_lower: np.ndarray
    pi_upper: np.ndarray
    n_scanned: int
    n_quality: int
    region: tuple[float, float, float, float]
    granules: int

    @property
    def usable(self) -> bool:
        return self.n_quality >= MIN_SHOTS


def _region_for(aoi: AOI) -> tuple[float, float, float, float]:
    """Expand the AOI to a box wide enough for beam tracks to cross it."""
    w, s, e, n = aoi.bbox
    cx, cy = (w + e) / 2, (s + n) / 2
    half = max(MIN_REGION_DEG, (e - w), (n - s)) / 2
    return (cx - half, cy - half, cx + half, cy + half)


def _authenticate() -> bool:
    token = settings.earthdata_token
    if not token:
        return False
    os.environ.setdefault("EARTHDATA_TOKEN", token)
    try:
        import earthaccess

        auth = earthaccess.login(strategy="environment", persist=False)
        return bool(auth and getattr(auth, "authenticated", False))
    except Exception as exc:
        log.warning("earthdata_login_failed", error=str(exc))
        return False


def collect_shots(region: tuple[float, float, float, float], end: date) -> ShotSet:
    """Read quality footprints inside `region`. Cached; the reads are expensive."""
    import earthaccess
    import h5py

    granules = earthaccess.search_data(
        short_name=L4A_COLLECTION,
        bounding_box=region,
        temporal=(MISSION_START, end.isoformat()),
        count=MAX_GRANULES,
    )
    if not granules:
        return ShotSet(*[np.array([])] * 5, 0, 0, region, 0)

    files = earthaccess.open(granules[:MAX_GRANULES])
    w, s, e, n = region
    agbd_all, lo_all, hi_all, lon_all, lat_all = [], [], [], [], []
    scanned = 0

    for fh in files:
        try:
            with h5py.File(fh, "r") as hf:
                for beam in (k for k in hf.keys() if k.startswith("BEAM")):
                    g = hf[beam]
                    if "lat_lowestmode" not in g:
                        continue
                    lat = g["lat_lowestmode"][:]
                    lon = g["lon_lowestmode"][:]
                    inside = (lon >= w) & (lon <= e) & (lat >= s) & (lat <= n)
                    if not inside.any():
                        continue
                    idx = np.nonzero(inside)[0]
                    scanned += idx.size

                    agbd = g["agbd"][idx]
                    # v3's flag name; v2.1 called it l4_quality_flag
                    qf = g["l4a_quality_flag_rel3"][idx]
                    deg = g["degrade_flag"][idx]
                    sens = g["sensitivity"][idx]
                    # the standard L4A filter: quality pass, not degraded, and
                    # enough beam sensitivity to see through the canopy
                    ok = (qf == 1) & (deg == 0) & (sens > 0.95) & (agbd >= 0) & np.isfinite(agbd)
                    if not ok.any():
                        continue
                    agbd_all.append(agbd[ok])
                    lo_all.append(g["agbd_pi_lower"][idx][ok])
                    hi_all.append(g["agbd_pi_upper"][idx][ok])
                    lon_all.append(lon[idx][ok])
                    lat_all.append(lat[idx][ok])
        except Exception as exc:  # one bad granule must not lose the rest
            log.warning("gedi_granule_failed", error=str(exc))
            continue

    if not agbd_all:
        return ShotSet(*[np.array([])] * 5, scanned, 0, region, len(granules))

    a = np.concatenate(agbd_all)
    return ShotSet(
        agbd=a,
        lon=np.concatenate(lon_all),
        lat=np.concatenate(lat_all),
        pi_lower=np.concatenate(lo_all),
        pi_upper=np.concatenate(hi_all),
        n_scanned=scanned,
        n_quality=a.size,
        region=region,
        granules=len(granules),
    )


class GEDIBiomass(Source):
    """Footprint aboveground biomass density, aggregated over a region."""

    id = "gedi-l4a"
    title = "GEDI L4A footprint aboveground biomass (ORNL DAAC, v3)"
    provides = ("gedi_agbd_mean", "gedi_shot_count", "gedi_carbon_mean")
    requires_credential = "SYLVA_EARTHDATA_TOKEN"

    def preflight(self, aoi: AOI):
        if not aoi.gedi_covered:
            return self.unavailable(
                "out_of_coverage",
                "GEDI flies on the ISS and does not sample beyond +/-51.6 degrees latitude",
            )
        if not settings.earthdata_token:
            return self.missing_credential()
        return None

    def observe(self, aoi: AOI, start: date, end: date) -> list[Observation]:
        if not _authenticate():
            return []

        region = _region_for(aoi)
        entry = cache.fetch(
            "gedi-l4a",
            {"region": [round(v, 3) for v in region], "end": end.isoformat()},
            lambda: collect_shots(region, end),
        )
        shots: ShotSet = entry.value

        if shots.n_quality == 0:
            return []

        degradations: list[str] = []
        if not shots.usable:
            degradations.append(
                f"only {shots.n_quality} quality footprints in the region "
                f"(want >= {MIN_SHOTS}); the regional mean is thin"
            )

        w, s, e, n = region
        span_km = (e - w) * 111.0
        regional = [
            f"GEDI is a sample, not a map: this is the mean of "
            f"{shots.n_quality} footprints over a {span_km:.0f} km box, not a "
            f"value for the requested plot",
            "footprint biomass is modelled from waveform metrics, not measured",
        ]

        mean = float(np.mean(shots.agbd))
        n = shots.n_quality

        # Averaging the per-footprint prediction intervals is the wrong
        # uncertainty for a *mean*: those intervals describe a single 25 m
        # shot, and averaging them keeps a single-shot width while the mean of
        # n shots is far better determined. The interval on the mean is the
        # standard error, inflated for spatial autocorrelation — GEDI shots
        # along a beam are 60 m apart and anything but independent, so the
        # naive sqrt(n) is optimistic and a design-effect factor is applied.
        sd = float(np.std(shots.agbd, ddof=1)) if n > 1 else 0.0
        design_effect = 2.5  # conservative; shots along a track are correlated
        se_mean = sd / np.sqrt(max(n / design_effect, 1.0))
        half = 1.96 * se_mean

        single_shot_width = float(np.mean(shots.pi_upper - shots.pi_lower))

        out = [
            Observation(
                key="gedi_agbd_mean",
                value=round(mean, 1),
                unit="Mg/ha",
                source=self.id,
                sensor="GEDI (ISS)",
                acquired_from=date(2019, 4, 18),
                acquired_to=end,
                method=(
                    f"mean of quality L4A footprints (l4a_quality_flag_rel3 == 1, "
                    f"degrade_flag == 0, sensitivity > 0.95) over {shots.granules} granules"
                ),
                version=VERSION,
                uncertainty=Uncertainty(
                    low=round(max(0.0, mean - half), 1),
                    high=round(mean + half, 1),
                    level=0.95,
                    method="se_of_mean_with_design_effect",
                ),
                caveats=list(regional),
                degradations=list(degradations),
                extra={
                    "footprints_scanned": shots.n_scanned,
                    "footprints_passing_qa": shots.n_quality,
                    "region_bbox": [round(v, 3) for v in region],
                    "median_agbd": round(float(np.median(shots.agbd)), 1),
                    "footprint_sd": round(sd, 1),
                    "single_footprint_pi_width": round(single_shot_width, 1),
                    "design_effect_assumed": design_effect,
                },
            ),
            Observation(
                key="gedi_shot_count",
                value=shots.n_quality,
                unit="footprints",
                source=self.id,
                sensor="GEDI (ISS)",
                method="footprints passing the standard L4A quality filter",
                version=VERSION,
                degradations=list(degradations),
            ),
            Observation(
                key="gedi_carbon_mean",
                value=round(mean * 0.47, 1),
                unit="MgC/ha",
                source=self.id,
                sensor="GEDI (ISS)",
                method="AGBD x 0.47 carbon fraction",
                version=VERSION,
                caveats=list(regional)
                + [
                    "0.47 is a convention, not a measurement; species-specific "
                    "fractions range roughly 0.44-0.50",
                    "this is an above-ground stock, not an annual flux, and it "
                    "excludes roots and soil carbon entirely",
                ],
                degradations=list(degradations),
            ),
        ]
        return out


registry.register(GEDIBiomass())
