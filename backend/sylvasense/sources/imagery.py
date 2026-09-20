"""
The two imagery sources the rest of the system is built on.

Sentinel-1 is the backbone and Sentinel-2 is the confirmation, not the other
way round. In the tropics optical is unusable for much of the year, so any
design that blocks on a clear optical view has already failed in the places
that matter most.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import structlog

from ..aoi import AOI
from ..config import settings
from ..preprocess.cloud import best_available
from ..provenance import Observation, Uncertainty
from .base import Source, registry
from .stac import date_range, item_date, load_window, search_items

log = structlog.get_logger(__name__)

VERSION = "0.1.0"


class Sentinel1RTC(Source):
    """
    Radiometrically terrain-corrected gamma0. RTC rather than GRD is a
    correctness requirement, not a preference: untreated terrain effects
    dominate backscatter on any slope and will masquerade as disturbance.
    """

    id = "sentinel-1-rtc"
    title = "Sentinel-1 RTC gamma0 (Planetary Computer)"
    provides = ("sar_scene_count", "sar_vv_mean", "sar_vh_mean", "sar_vh_vv_ratio")
    collection = "sentinel-1-rtc"

    def observe(self, aoi: AOI, start: date, end: date) -> list[Observation]:
        items = search_items(self.collection, aoi, start, end)
        if not items:
            return []

        first, last = date_range(items)
        thin: list[str] = []
        if len(items) < settings.min_sar_scenes:
            thin.append(
                f"only {len(items)} SAR scenes in window "
                f"(want >= {settings.min_sar_scenes}); time-series confidence reduced"
            )

        ds = load_window(items, aoi, bands=["vv", "vh"], resolution=20.0)
        vv = _db(ds["vv"].values)
        vh = _db(ds["vh"].values)

        out = [
            Observation(
                key="sar_scene_count",
                value=len(items),
                unit="scenes",
                source=self.id,
                sensor="Sentinel-1 C-SAR",
                acquired_from=first,
                acquired_to=last,
                method="STAC item count over AOI bbox",
                version=VERSION,
                degradations=list(thin),
                extra={"orbit_states": _orbits(items)},
            )
        ]

        for key, arr, label in (("sar_vv_mean", vv, "VV"), ("sar_vh_mean", vh, "VH")):
            if arr.size == 0 or not np.isfinite(arr).any():
                continue
            mean = float(np.nanmean(arr))
            std = float(np.nanstd(arr))
            out.append(
                Observation(
                    key=key,
                    value=round(mean, 3),
                    unit="dB",
                    source=self.id,
                    sensor="Sentinel-1 C-SAR",
                    acquired_from=first,
                    acquired_to=last,
                    method=f"temporal mean of {label} gamma0, 20 m, AOI window",
                    version=VERSION,
                    uncertainty=Uncertainty(
                        low=round(mean - std, 3),
                        high=round(mean + std, 3),
                        level=0.68,
                        method="ensemble_spread",
                    ),
                    degradations=list(thin),
                )
            )

        # VH/VV separates volume scattering (canopy) from surface (cleared).
        if np.isfinite(vv).any() and np.isfinite(vh).any():
            ratio = float(np.nanmean(vh) - np.nanmean(vv))  # dB difference
            out.append(
                Observation(
                    key="sar_vh_vv_ratio",
                    value=round(ratio, 3),
                    unit="dB",
                    source=self.id,
                    sensor="Sentinel-1 C-SAR",
                    acquired_from=first,
                    acquired_to=last,
                    method="mean(VH dB) - mean(VV dB); proxy for volume scattering",
                    version=VERSION,
                    degradations=list(thin),
                    caveats=["indicative only; not a calibrated forest/non-forest decision"],
                )
            )
        return out


class Sentinel2L2A(Source):
    """
    Surface reflectance, cloud-masked. Reports its own clear fraction so the
    caller can see when the optical answer is thin instead of guessing.
    """

    id = "sentinel-2-l2a"
    title = "Sentinel-2 L2A surface reflectance (Planetary Computer)"
    provides = ("clear_fraction", "ndvi_mean", "optical_scene_count")
    collection = "sentinel-2-l2a"

    def observe(self, aoi: AOI, start: date, end: date) -> list[Observation]:
        items = search_items(
            self.collection, aoi, start, end, query={"eo:cloud_cover": {"lt": 90}}
        )
        if not items:
            return []
        first, last = date_range(items)

        ds = load_window(
            items, aoi, bands=["B04", "B08", "SCL"], resolution=20.0
        )
        masker = best_available()
        try:
            cm = masker.mask(ds)
        except Exception as exc:
            log.warning("cloud_mask_failed", error=str(exc))
            return []

        caveats = list(cm.caveats)
        thin: list[str] = []
        if cm.clear_fraction < settings.min_clear_fraction:
            thin.append(
                f"clear fraction {cm.clear_fraction:.2f} below "
                f"{settings.min_clear_fraction:.2f}; optical evidence is thin here"
            )

        out = [
            Observation(
                key="optical_scene_count",
                value=len(items),
                unit="scenes",
                source=self.id,
                sensor="Sentinel-2 MSI",
                acquired_from=first,
                acquired_to=last,
                method="STAC item count, eo:cloud_cover < 90",
                version=VERSION,
                caveats=list(caveats),
                degradations=list(thin),
            ),
            Observation(
                key="clear_fraction",
                value=round(cm.clear_fraction, 4),
                unit="fraction",
                source=self.id,
                sensor="Sentinel-2 MSI",
                acquired_from=first,
                acquired_to=last,
                method=f"cloud/shadow mask via {cm.method}",
                version=VERSION,
                caveats=list(caveats),
                degradations=list(thin),
            ),
        ]

        red = _as_stack(ds["B04"].values)
        nir = _as_stack(ds["B08"].values)
        with np.errstate(divide="ignore", invalid="ignore"):
            ndvi = (nir - red) / (nir + red)
        ndvi = np.where(np.broadcast_to(cm.clear, ndvi.shape), ndvi, np.nan)

        if np.isfinite(ndvi).any():
            mean = float(np.nanmean(ndvi))
            std = float(np.nanstd(ndvi))
            out.append(
                Observation(
                    key="ndvi_mean",
                    value=round(mean, 4),
                    unit="index",
                    source=self.id,
                    sensor="Sentinel-2 MSI",
                    acquired_from=first,
                    acquired_to=last,
                    method="mean NDVI over cloud-masked pixels, 20 m",
                    version=VERSION,
                    uncertainty=Uncertainty(
                        low=round(mean - std, 4),
                        high=round(mean + std, 4),
                        level=0.68,
                        method="ensemble_spread",
                    ),
                    caveats=list(caveats)
                    + ["greenness saturates in closed canopy; not a biomass measure"],
                    degradations=list(thin),
                )
            )
        return out


def _db(arr: np.ndarray) -> np.ndarray:
    """RTC assets are linear power; work in dB and drop zeros cleanly."""
    a = np.asarray(arr, dtype="float64")
    a = np.where(a > 0, a, np.nan)
    return 10.0 * np.log10(a)


def _as_stack(arr: np.ndarray) -> np.ndarray:
    return np.asarray(arr, dtype="float32")


def _orbits(items: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for i in items:
        state = (i.get("properties") or {}).get("sat:orbit_state", "unknown")
        counts[state] = counts.get(state, 0) + 1
    return counts


registry.register(Sentinel1RTC())
registry.register(Sentinel2L2A())
