"""
STAC access. Search and windowed reads only — full scenes are never downloaded.

Planetary Computer is the default because sentinel-1-rtc and sentinel-2-l2a are
anonymous there, which means the whole pipeline is testable without anyone
holding a credential. CDSE is wired as a second catalogue for when it is
configured, so the architecture's "two independent catalogues" claim is real
rather than aspirational.
"""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from typing import Any, Iterable

import numpy as np
import planetary_computer as pc
import pystac_client
import structlog
import xarray as xr
from odc.stac import stac_load

from ..aoi import AOI
from ..cache import cache
from ..config import settings

log = structlog.get_logger(__name__)


@lru_cache(maxsize=4)
def client(url: str | None = None) -> pystac_client.Client:
    """
    Deliberately unsigned. Planetary Computer SAS tokens live about a day, so
    signing at search time and caching the result produces item metadata that
    silently rots: reads succeed while developing and 403 the next morning.
    Cache unsigned metadata, sign at the moment of read.
    """
    return pystac_client.Client.open(url or settings.pc_stac_url)


def search_items(
    collection: str,
    aoi: AOI,
    start: date,
    end: date,
    *,
    query: dict[str, Any] | None = None,
    catalogue: str | None = None,
) -> list[dict[str, Any]]:
    """
    Item metadata as plain dicts so results are picklable and replayable.
    Signed asset hrefs expire, so we cache the item JSON and re-sign on load.
    """
    parts = {
        "c": collection,
        "aoi": aoi.key(),
        "s": start.isoformat(),
        "e": end.isoformat(),
        "q": query or {},
        "cat": catalogue or settings.pc_stac_url,
    }

    def produce() -> list[dict[str, Any]]:
        cat = client(catalogue)
        search = cat.search(
            collections=[collection],
            bbox=aoi.bbox,
            datetime=f"{start.isoformat()}/{end.isoformat()}",
            query=query,
        )
        return [item.to_dict() for item in search.items()]

    entry = cache.fetch("stac-search", parts, produce)
    return entry.value


def load_window(
    items: Iterable[dict[str, Any]],
    aoi: AOI,
    bands: list[str],
    *,
    resolution: float = 10.0,
    crs: str = "utm",
    chunks: dict[str, int] | None = None,
) -> xr.Dataset:
    """
    Read only the AOI window from the items' COGs. Hrefs are re-signed at load
    time because Planetary Computer SAS tokens are short-lived and a cached
    href would otherwise 403 an hour later.
    """
    import pystac

    stac_items = []
    for raw in items:
        item = pystac.Item.from_dict(_unsigned(raw))
        try:
            item = pc.sign(item)
        except Exception:
            pass  # catalogues other than Planetary Computer need no signing
        stac_items.append(item)

    return stac_load(
        stac_items,
        bands=bands,
        bbox=aoi.bbox,
        resolution=resolution,
        crs=crs,
        chunks=chunks or {},
        groupby="solar_day",
    )


def _unsigned(raw: dict[str, Any]) -> dict[str, Any]:
    """
    Strip any SAS query string from asset hrefs before re-signing. Signing an
    already-signed href appends a second token and the request fails, which is
    how an expired cache entry turns into a WarpOperationError several layers
    away from the actual cause.
    """
    out = dict(raw)
    assets = {}
    for name, asset in (raw.get("assets") or {}).items():
        a = dict(asset)
        href = a.get("href", "")
        if "?" in href and ("sig=" in href or "st=" in href):
            a["href"] = href.split("?", 1)[0]
        assets[name] = a
    out["assets"] = assets
    return out


def item_date(raw: dict[str, Any]) -> date | None:
    props = raw.get("properties") or {}
    dt = props.get("datetime") or props.get("start_datetime")
    if not dt:
        return None
    return date.fromisoformat(dt[:10])


def date_range(items: list[dict[str, Any]]) -> tuple[date | None, date | None]:
    dates = [d for d in (item_date(i) for i in items) if d]
    return (min(dates), max(dates)) if dates else (None, None)


def valid_fraction(da: xr.DataArray, nodata: float | None = None) -> float:
    """Share of the window that carries a real value."""
    arr = da.values
    if nodata is not None:
        finite = np.isfinite(arr) & (arr != nodata)
    else:
        finite = np.isfinite(arr)
    total = finite.size
    return float(finite.sum() / total) if total else 0.0
