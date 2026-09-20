"""
Cloud and shadow masking.

Two implementations behind one protocol, deliberately. The scene-classification
mask ships with every L2A product and always works; OmniCloudMask is markedly
better but needs torch and a model download. Having both means the optical path
degrades rather than disappears on a thin machine — and it means we can score
them against each other on CloudSEN12 instead of taking either on faith.

Bad cloud masking is one of the largest sources of false deforestation alerts,
so this is not a detail.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np
import structlog
import xarray as xr

log = structlog.get_logger(__name__)

# Sentinel-2 L2A scene classification codes
SCL_NODATA = 0
SCL_SATURATED = 1
SCL_DARK = 2
SCL_CLOUD_SHADOW = 3
SCL_VEGETATION = 4
SCL_BARE = 5
SCL_WATER = 6
SCL_UNCLASSIFIED = 7
SCL_CLOUD_MEDIUM = 8
SCL_CLOUD_HIGH = 9
SCL_CIRRUS = 10
SCL_SNOW = 11

SCL_CLEAR = {SCL_VEGETATION, SCL_BARE, SCL_WATER, SCL_UNCLASSIFIED, SCL_SNOW}
SCL_OBSCURED = {SCL_CLOUD_SHADOW, SCL_CLOUD_MEDIUM, SCL_CLOUD_HIGH, SCL_CIRRUS}
SCL_INVALID = {SCL_NODATA, SCL_SATURATED, SCL_DARK}


@dataclass(frozen=True)
class CloudMask:
    """True where a pixel is usable."""

    clear: np.ndarray
    #: share of the window that is clear
    clear_fraction: float
    method: str
    caveats: tuple[str, ...] = ()


class CloudMasker(Protocol):
    name: str

    def available(self) -> bool: ...

    def mask(self, ds: xr.Dataset) -> CloudMask: ...


class SCLMasker:
    """
    Baseline. Uses the L2A scene classification layer, which is free, always
    present, and known to be mediocre — it under-detects thin cirrus and
    over-flags bright bare soil. Good enough to be a floor, not a ceiling.
    """

    name = "scl"

    def available(self) -> bool:
        return True

    def mask(self, ds: xr.Dataset) -> CloudMask:
        if "SCL" not in ds:
            raise KeyError("SCL band not loaded; request it in the band list")
        scl = ds["SCL"].values
        clear = np.isin(scl, list(SCL_CLEAR))
        valid = ~np.isin(scl, list(SCL_INVALID))
        denom = valid.sum()
        frac = float((clear & valid).sum() / denom) if denom else 0.0
        caveats = ("scene-classification mask; thin cirrus is under-detected",)
        return CloudMask(clear & valid, frac, self.name, caveats)


class OmniCloudMasker:
    """
    Successor to CloudS2Mask, trained on CloudSEN12. Better across sensors and
    processing levels, at the cost of a torch dependency and a model download.
    """

    name = "omnicloudmask"

    def __init__(self) -> None:
        self._impl = None

    def available(self) -> bool:
        try:
            import omnicloudmask  # noqa: F401
        except Exception:
            return False
        return True

    def mask(self, ds: xr.Dataset) -> CloudMask:
        from omnicloudmask import predict_from_array

        # the model wants red, green and NIR as (bands, y, x) reflectance
        need = ("B04", "B03", "B08")
        missing = [b for b in need if b not in ds]
        if missing:
            raise KeyError(f"OmniCloudMask needs {need}; missing {missing}")

        stack = np.stack([_as_2d(ds[b]) for b in need]).astype("float32")
        pred = predict_from_array(stack)
        classes = np.squeeze(pred)
        # 0 clear, 1 thick cloud, 2 thin cloud, 3 shadow
        clear = classes == 0
        frac = float(clear.sum() / clear.size) if clear.size else 0.0
        return CloudMask(clear, frac, self.name)


def _as_2d(da: xr.DataArray) -> np.ndarray:
    arr = da.values
    while arr.ndim > 2:
        arr = arr[0]
    return arr


def best_available() -> CloudMasker:
    """Prefer the better masker, fall back loudly rather than silently."""
    omni = OmniCloudMasker()
    if omni.available():
        return omni
    log.info("cloud_masker_fallback", using="scl", reason="omnicloudmask not installed")
    return SCLMasker()
