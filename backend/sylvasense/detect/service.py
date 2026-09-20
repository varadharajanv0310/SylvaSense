"""
Wiring the detector to real imagery, and integrating independent alert streams.

Integration is the part that buys accuracy. Optical and radar fail in
uncorrelated ways — cloud blinds one, wet soil and terrain confuse the other —
so agreement between them is worth far more than either alone, and the earliest
of the two sets the latency. This mirrors how GFW's integrated alerts work and
why they detect more than any single system.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import structlog

from ..aoi import AOI
from ..config import settings
from ..provenance import Observation, Uncertainty
from ..sources.stac import item_date, load_window, search_items
from .bayes import DetectionResult, detect

log = structlog.get_logger(__name__)

VERSION = "0.1.0"


@dataclass
class StreamResult:
    stream: str
    sensor: str
    result: DetectionResult | None
    n_observations: int
    reason: str = ""

    @property
    def ok(self) -> bool:
        return self.result is not None


def _to_db(a: np.ndarray) -> np.ndarray:
    a = np.asarray(a, dtype="float32")
    a = np.where(a > 0, a, np.nan)
    return (10.0 * np.log10(a)).astype("float32")


def run_sar(aoi: AOI, start: date, end: date, *, band: str = "vh") -> StreamResult:
    """
    VH by default: cross-polarised backscatter is dominated by volume
    scattering from canopy, so it drops hardest when canopy is removed. VV
    carries more surface/moisture signal and is noisier for this purpose.
    """
    items = search_items("sentinel-1-rtc", aoi, start, end)

    # Sentinel-1 does not acquire the same polarisations everywhere: over parts
    # of this catalogue a sixth of the scenes come back HH/HV rather than
    # VV/VH. Those carry no `vh` asset, so a stack that includes them either
    # fails outright or - worse, if the loader were more forgiving - splices
    # two incomparable polarisations into one series and hands the detector a
    # level shift that looks exactly like clearing. Keep one polarisation.
    mixed = len(items)
    items = [i for i in items if band in (i.get("assets") or {})]
    dropped = mixed - len(items)

    if len(items) < 8:
        return StreamResult(
            "sar", "Sentinel-1 C-SAR", None, len(items),
            f"only {len(items)} scenes carrying {band.upper()}"
            + (f" ({dropped} of {mixed} were HH/HV)" if dropped else "")
            + "; need >= 8 to split history and monitoring",
        )
    if dropped:
        log.info("sar_polarisation_filtered", dropped=dropped, kept=len(items), band=band)

    items = sorted(items, key=lambda i: str(item_date(i)))
    ds = load_window(items, aoi, bands=[band], resolution=20.0)
    stack = _to_db(ds[band].values)
    dates = [d.astype("datetime64[D]").astype(object) for d in ds.time.values]

    try:
        res = detect(stack, dates)
    except ValueError as exc:
        return StreamResult("sar", "Sentinel-1 C-SAR", None, len(items), str(exc))
    return StreamResult("sar", "Sentinel-1 C-SAR", res, stack.shape[0])


def run_optical(aoi: AOI, start: date, end: date) -> StreamResult:
    """
    The same Bayesian machinery on NDVI. Running one algorithm over two physics
    keeps the comparison honest: a difference in the result is a difference in
    the sensors, not in the method.
    """
    items = search_items("sentinel-2-l2a", aoi, start, end,
                         query={"eo:cloud_cover": {"lt": 60}})
    if len(items) < 8:
        return StreamResult("optical", "Sentinel-2 MSI", None, len(items),
                            f"only {len(items)} usable scenes after cloud filtering")

    items = sorted(items, key=lambda i: str(item_date(i)))
    ds = load_window(items, aoi, bands=["B04", "B08", "SCL"], resolution=20.0)

    red = np.asarray(ds["B04"].values, dtype="float32")
    nir = np.asarray(ds["B08"].values, dtype="float32")
    scl = np.asarray(ds["SCL"].values)
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / (nir + red)
    # blank anything the scene classification does not call clear land/water
    clear = np.isin(scl, [4, 5, 6, 7, 11])
    ndvi = np.where(clear, ndvi, np.nan).astype("float32")

    # NDVI and VH gamma0 already run the same way: forest is high (NDVI ~0.85,
    # VH ~-8 dB) and clearing lowers both. An earlier version negated NDVI on
    # the mistaken belief they were opposed, which inverted the class the
    # non-forest estimator picked out and was a large part of why this stream
    # over-reported. Scaled, not negated.
    stack = (ndvi * 10.0).astype("float32")
    dates = [d.astype("datetime64[D]").astype(object) for d in ds.time.values]

    usable = np.isfinite(stack).any(axis=(1, 2)).sum()
    if usable < 8:
        return StreamResult("optical", "Sentinel-2 MSI", None, int(usable),
                            f"only {usable} scenes had any clear pixels")
    try:
        res = detect(stack, dates)
    except ValueError as exc:
        return StreamResult("optical", "Sentinel-2 MSI", None, int(usable), str(exc))
    return StreamResult("optical", "Sentinel-2 MSI", res, int(usable))


def integrate(streams: list[StreamResult], aoi: AOI) -> list[Observation]:
    """
    Combine independent streams. Confirmation by either raises the alert (that
    is where the sensitivity comes from); confirmation by both raises the
    confidence. The reported date is the earliest, because the point of
    integration is timeliness.
    """
    live = [s for s in streams if s.ok]
    out: list[Observation] = []

    for s in streams:
        if not s.ok:
            out.append(
                Observation(
                    key=f"alert_{s.stream}_status",
                    value="unavailable",
                    source=f"sylvasense-detect-{s.stream}",
                    sensor=s.sensor,
                    method="RADD-style Bayesian disturbance detection",
                    version=VERSION,
                    caveats=[s.reason],
                )
            )
            continue

        r = s.result
        assert r is not None
        first = r.first_confirmed_date()
        out.append(
            Observation(
                key=f"alert_{s.stream}_confirmed_fraction",
                value=round(r.confirmed_fraction, 4),
                unit="fraction",
                source=f"sylvasense-detect-{s.stream}",
                sensor=s.sensor,
                acquired_from=r.dates[0] if r.dates else None,
                acquired_to=r.dates[-1] if r.dates else None,
                method=(
                    "per-pixel Gaussian forest model from history; Bayesian update "
                    f"per observation; confirm at posterior >= 0.975 over {s.n_observations} scenes"
                ),
                version=VERSION,
                extra={
                    "first_confirmed": first.isoformat() if first else None,
                    "observations_to_confirm": r.latency_observations(),
                    "nonforest_mu_db": round(r.nonforest_mu, 2) if r.nonforest_mu else None,
                },
                caveats=[
                    "pixel fraction, not an area estimate; map-counted area is biased "
                    "and must be corrected by the stratified estimator before reporting"
                ],
                degradations=[r.underpowered] if r.underpowered else [],
            )
        )

        # "nothing confirmed" and "nothing happened" are different claims, and
        # the gap between them is where the honest uncertainty lives. A pixel
        # that crossed the posterior bar but could not be shown to have stayed
        # down is real information: it is what a low-confidence recent alert
        # is, and it is what the whole window becomes when the monitoring
        # period is too short for the persistence test to have any power.
        if r.provisional is not None:
            out.append(
                Observation(
                    key=f"alert_{s.stream}_provisional_fraction",
                    value=round(float(r.provisional.mean()), 4),
                    unit="fraction",
                    source=f"sylvasense-detect-{s.stream}",
                    sensor=s.sensor,
                    acquired_from=r.dates[0] if r.dates else None,
                    acquired_to=r.dates[-1] if r.dates else None,
                    method=(
                        "crossed the posterior threshold but persistence could "
                        "not be verified within the window"
                    ),
                    version=VERSION,
                    caveats=[
                        "not an alert: these are crossings awaiting confirmation, "
                        "and on stable forest most of them are speckle"
                    ],
                    degradations=[r.underpowered] if r.underpowered else [],
                )
            )

    if not live:
        return out

    # --- the integrated answer ------------------------------------------
    shapes = {s.result.confirmed.shape for s in live if s.result is not None}
    combinable = len(shapes) == 1
    dates = [s.result.first_confirmed_date() for s in live if s.result is not None]
    dates = [d for d in dates if d]
    earliest = min(dates) if dates else None

    agreement = None
    if combinable and len(live) > 1:
        masks = [s.result.confirmed for s in live if s.result is not None]
        both = np.logical_and.reduce(masks)
        either = np.logical_or.reduce(masks)
        agreement = float(both.sum() / either.sum()) if either.sum() else 0.0
        fraction = float(either.sum() / either.size)
    elif live[0].result is not None:
        fraction = live[0].result.confirmed_fraction
    else:
        fraction = 0.0

    caveats = [
        "pixel fraction, not an area estimate",
    ]
    if len(live) == 1:
        caveats.append(
            f"only the {live[0].stream} stream was usable; a single-sensor alert "
            "carries the failure modes of that sensor alone"
        )

    out.append(
        Observation(
            key="alert_integrated_confirmed_fraction",
            value=round(fraction, 4),
            unit="fraction",
            source="sylvasense-detect-integrated",
            sensor=" + ".join(s.sensor for s in live),
            acquired_to=earliest,
            method=(
                "union of confirmed pixels across independent streams; "
                "earliest confirmation sets the date"
            ),
            version=VERSION,
            confidence=0.9 if len(live) > 1 else 0.6,
            extra={
                "streams_used": [s.stream for s in live],
                "earliest_confirmation": earliest.isoformat() if earliest else None,
                "cross_sensor_agreement": round(agreement, 4) if agreement is not None else None,
            },
            caveats=caveats,
        )
    )
    return out


def detect_disturbance(aoi: AOI, start: date, end: date) -> list[Observation]:
    """Full detection pass for one AOI. Never raises into the caller."""
    streams: list[StreamResult] = []
    for runner, label in ((run_sar, "sar"), (run_optical, "optical")):
        try:
            streams.append(runner(aoi, start, end))
        except Exception as exc:  # a failed stream must not take the other down
            log.warning("stream_failed", stream=label, error=str(exc))
            streams.append(
                StreamResult(label, "unknown", None, 0, f"{type(exc).__name__}: {exc}")
            )
    return integrate(streams, aoi)
