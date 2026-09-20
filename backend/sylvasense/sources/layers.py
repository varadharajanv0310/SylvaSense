"""
Reference layers we consume rather than rebuild.

The selection is deliberate: these are *independent* of Sentinel-1 and of each
other in sensor, algorithm and producer. ALOS is L-band where Sentinel-1 is
C-band; WorldCover and io-lulc are different teams classifying different
inputs. Convergence between them is informative precisely because their errors
are uncorrelated — three layers that all derive from Sentinel-2 agreeing would
tell us almost nothing.

ESA WorldCover 2020 matters especially: the EUDR cut-off is 31 December 2020,
so it is the closest thing to an authoritative snapshot of the baseline year.
"""

from __future__ import annotations

from collections import Counter
from datetime import date

import numpy as np
import structlog

from ..aoi import AOI
from ..config import settings
from ..provenance import Observation
from .base import Source, registry
from .stac import load_window, search_items

log = structlog.get_logger(__name__)

VERSION = "0.1.0"

#: ESA WorldCover class codes
WORLDCOVER = {
    10: "tree cover",
    20: "shrubland",
    30: "grassland",
    40: "cropland",
    50: "built-up",
    60: "bare / sparse",
    70: "snow and ice",
    80: "permanent water",
    90: "herbaceous wetland",
    95: "mangroves",
    100: "moss and lichen",
}

#: ALOS PALSAR forest/non-forest codes
ALOS_FNF = {0: "no data", 1: "dense forest", 2: "non-dense forest", 3: "non-forest", 4: "water"}


class ESAWorldCover(Source):
    """
    10 m global land cover for 2020 and 2021. Independent of anything we
    compute, and 2020 is the EUDR baseline year.
    """

    id = "esa-worldcover"
    title = "ESA WorldCover 10 m (2020 / 2021)"
    provides = ("tree_cover_fraction_2020", "landcover_2020")
    collection = "esa-worldcover"

    def observe(self, aoi: AOI, start: date, end: date) -> list[Observation]:
        # the collection is two fixed epochs, so ignore the caller's window
        items = search_items(
            self.collection, aoi, date(2020, 1, 1), date(2021, 12, 31)
        )
        if not items:
            return []
        epoch_2020 = [i for i in items if "2020" in str(i.get("properties", {}))] or items
        ds = load_window(epoch_2020[:1], aoi, bands=["map"], resolution=10.0)
        arr = np.asarray(ds["map"].values).ravel()
        arr = arr[arr > 0]
        if arr.size == 0:
            return []

        counts = Counter(int(v) for v in arr)
        total = sum(counts.values())
        tree_frac = counts.get(10, 0) / total
        dominant = max(counts, key=counts.get)

        return [
            Observation(
                key="tree_cover_fraction_2020",
                value=round(tree_frac, 4),
                unit="fraction",
                source=self.id,
                sensor="Sentinel-1 + Sentinel-2 (ESA WorldCover)",
                acquired_from=date(2020, 1, 1),
                acquired_to=date(2020, 12, 31),
                method="fraction of AOI classified 'tree cover' (class 10)",
                version=VERSION,
                caveats=["WorldCover's tree definition is not the EUDR forest definition"],
            ),
            Observation(
                key="landcover_2020",
                value=WORLDCOVER.get(dominant, f"class {dominant}"),
                source=self.id,
                sensor="Sentinel-1 + Sentinel-2 (ESA WorldCover)",
                acquired_from=date(2020, 1, 1),
                acquired_to=date(2020, 12, 31),
                method="modal WorldCover class over AOI",
                version=VERSION,
                extra={
                    "composition": {
                        WORLDCOVER.get(k, str(k)): round(v / total, 4)
                        for k, v in counts.most_common(5)
                    }
                },
            ),
        ]


class ALOSForestNonForest(Source):
    """
    Annual L-band forest/non-forest mosaic. The independence argument: L-band
    penetrates further into canopy than C-band, so its failures are not
    Sentinel-1's failures.
    """

    id = "alos-fnf"
    title = "ALOS PALSAR Forest / Non-Forest mosaic (25 m, annual)"
    provides = ("alos_forest_fraction", "alos_forest_class")
    collection = "alos-fnf-mosaic"

    def observe(self, aoi: AOI, start: date, end: date) -> list[Observation]:
        items = search_items(self.collection, aoi, date(2017, 1, 1), end)
        if not items:
            return []
        items = sorted(items, key=lambda i: str(i.get("properties", {}).get("start_datetime", "")))
        latest = items[-1]
        year = str(latest.get("properties", {}).get("start_datetime", ""))[:4]

        ds = load_window([latest], aoi, bands=["C"], resolution=25.0)
        arr = np.asarray(ds["C"].values).ravel()
        arr = arr[arr > 0]
        if arr.size == 0:
            return []

        counts = Counter(int(v) for v in arr)
        total = sum(counts.values())
        forest = (counts.get(1, 0) + counts.get(2, 0)) / total
        dominant = max(counts, key=counts.get)

        return [
            Observation(
                key="alos_forest_fraction",
                value=round(forest, 4),
                unit="fraction",
                source=self.id,
                sensor="ALOS-2 PALSAR-2 (L-band)",
                acquired_from=date(int(year), 1, 1) if year.isdigit() else None,
                acquired_to=date(int(year), 12, 31) if year.isdigit() else None,
                method="fraction classified dense or non-dense forest",
                version=VERSION,
                caveats=["annual mosaic; cannot date a disturbance within the year"],
            ),
            Observation(
                key="alos_forest_class",
                value=ALOS_FNF.get(dominant, f"class {dominant}"),
                source=self.id,
                sensor="ALOS-2 PALSAR-2 (L-band)",
                method="modal forest/non-forest class over AOI",
                version=VERSION,
            ),
        ]


class IOLandCover(Source):
    """Annual 10 m land cover — a second, independent classification series."""

    id = "io-lulc"
    title = "Impact Observatory annual land cover (10 m)"
    provides = ("iolulc_tree_fraction", "iolulc_class")
    collection = "io-lulc-annual-v02"
    #: IO class 2 is trees
    TREES = 2

    def observe(self, aoi: AOI, start: date, end: date) -> list[Observation]:
        items = search_items(self.collection, aoi, date(2017, 1, 1), end)
        if not items:
            return []
        items = sorted(items, key=lambda i: str(i.get("properties", {}).get("start_datetime", "")))
        latest = items[-1]
        year = str(latest.get("properties", {}).get("start_datetime", ""))[:4]

        ds = load_window([latest], aoi, bands=["data"], resolution=10.0)
        arr = np.asarray(ds["data"].values).ravel()
        arr = arr[arr > 0]
        if arr.size == 0:
            return []
        counts = Counter(int(v) for v in arr)
        total = sum(counts.values())

        return [
            Observation(
                key="iolulc_tree_fraction",
                value=round(counts.get(self.TREES, 0) / total, 4),
                unit="fraction",
                source=self.id,
                sensor="Sentinel-2 (Impact Observatory)",
                acquired_from=date(int(year), 1, 1) if year.isdigit() else None,
                acquired_to=date(int(year), 12, 31) if year.isdigit() else None,
                method="fraction classified 'trees'",
                version=VERSION,
                caveats=["derived from Sentinel-2; not independent of our own optical path"],
            )
        ]


class Terrain(Source):
    """
    Slope context. Not evidence about forest, but the thing that explains SAR
    artefacts — a steep AOI with odd backscatter deserves a caveat, not an alert.
    """

    id = "nasadem"
    title = "NASADEM 30 m elevation"
    provides = ("elevation_mean", "slope_mean")
    collection = "nasadem"

    def observe(self, aoi: AOI, start: date, end: date) -> list[Observation]:
        items = search_items(self.collection, aoi, date(2000, 1, 1), date(2001, 1, 1))
        if not items:
            return []
        ds = load_window(items[:1], aoi, bands=["elevation"], resolution=30.0)
        z = np.asarray(ds["elevation"].values, dtype="float32")
        while z.ndim > 2:
            z = z[0]
        if z.size == 0 or not np.isfinite(z).any():
            return []

        gy, gx = np.gradient(z, 30.0, 30.0)
        slope = np.degrees(np.arctan(np.hypot(gx, gy)))
        slope_mean = float(np.nanmean(slope))

        terrain_note = []
        if slope_mean > 10:
            terrain_note.append(
                f"mean slope {slope_mean:.1f} degrees; SAR backscatter here is "
                "terrain-sensitive even after RTC"
            )
        return [
            Observation(
                key="elevation_mean",
                value=round(float(np.nanmean(z)), 1),
                unit="m",
                source=self.id,
                sensor="SRTM (NASADEM)",
                method="mean elevation over AOI",
                version=VERSION,
            ),
            Observation(
                key="slope_mean",
                value=round(slope_mean, 2),
                unit="degrees",
                source=self.id,
                sensor="SRTM (NASADEM)",
                method="mean of slope from 30 m elevation gradient",
                version=VERSION,
                caveats=terrain_note,
            ),
        ]


registry.register(ESAWorldCover())
registry.register(ALOSForestNonForest())
registry.register(IOLandCover())
registry.register(Terrain())
