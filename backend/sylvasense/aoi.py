"""
Areas of interest, and the five golden fixtures the whole backend is scored on.

On honesty about the fixtures: these are *candidates* chosen from the known
geography of Rondonia, not verified ground truth. Each carries a hypothesis
about what should be found there. `scripts/confirm_fixtures.py` runs the
pipeline over them and writes back what was actually observed; only then does
a fixture become `CONFIRMED` and earn the right to be used as a pass/fail gate.

Asserting an expectation we have not checked is how you end up believing a
broken pipeline works.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Iterable

from shapely.geometry import box, mapping, shape
from shapely.geometry.base import BaseGeometry


class FixtureState(str, Enum):
    CANDIDATE = "candidate"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


@dataclass
class AOI:
    id: str
    name: str
    geometry: BaseGeometry
    #: what this fixture is here to exercise
    purpose: str = ""
    hypothesis: str = ""
    state: FixtureState = FixtureState.CANDIDATE
    #: filled in by confirm_fixtures.py from observed data
    observed: dict[str, Any] = field(default_factory=dict)

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        return tuple(self.geometry.bounds)  # type: ignore[return-value]

    @property
    def centroid(self) -> tuple[float, float]:
        c = self.geometry.centroid
        return (c.x, c.y)

    def geojson(self) -> dict[str, Any]:
        return mapping(self.geometry)

    def key(self) -> str:
        """Stable hash of the geometry, for cache keys."""
        raw = json.dumps(mapping(self.geometry), sort_keys=True).encode()
        return hashlib.sha1(raw).hexdigest()[:16]

    @property
    def gedi_covered(self) -> bool:
        """GEDI flies on the ISS: nothing beyond +/-51.6 degrees latitude."""
        _, ymin, _, ymax = self.bbox
        return max(abs(ymin), abs(ymax)) <= 51.6

    @classmethod
    def from_geojson(cls, geom: dict[str, Any], id: str = "adhoc", name: str = "ad hoc") -> "AOI":
        return cls(id=id, name=name, geometry=shape(geom))

    @classmethod
    def from_bbox(cls, west: float, south: float, east: float, north: float, **kw: Any) -> "AOI":
        return cls(geometry=box(west, south, east, north), **kw)


def _cell(west: float, south: float, size: float = 0.06) -> BaseGeometry:
    """A small square cell — roughly 6.6 km at the equator."""
    return box(west, south, west + size, south + size)


#: The five cases. Chosen so that between them they break every naive approach:
#: one needs a date, one needs a low false-positive rate, one cannot use optical
#: at all, one is the case everybody gets wrong, and one has a confounding
#: spectral signature.
GOLDEN_AOIS: list[AOI] = [
    AOI(
        id="clearcut",
        name="Machadinho d'Oeste fishbone",
        geometry=_cell(-62.05, -9.44),
        purpose="alert latency and detection on unambiguous stand-replacing loss",
        hypothesis=(
            "Recent clear-cut with a datable transition. Both SAR and optical "
            "should find it; this fixture measures how many days each takes."
        ),
    ),
    AOI(
        id="intact",
        name="Parque Nacional de Pacaas Novos interior",
        geometry=_cell(-63.95, -11.05),
        purpose="false-positive floor",
        hypothesis=(
            "Closed primary forest. Any alert raised here is a false positive "
            "and bounds our specificity."
        ),
        state=FixtureState.CONFIRMED,
        observed={
            "tree_cover_fraction_2020": 1.0,
            "alos_forest_fraction": 1.0,
            "iolulc_tree_fraction": 1.0,
            "landcover_2020": "tree cover",
            "alos_forest_class": "dense forest",
            "method": (
                "selected by scripts/find_intact.py from 12 candidates across four "
                "regions; accepted only because all three independent layers agree "
                "at >= 90% with <= 10% spread. The first candidate for this slot "
                "was rejected at 40-85% cover with modal class grassland."
            ),
        },
    ),
    AOI(
        id="intact-deep",
        name="Interior Amazonas, off-road control",
        geometry=_cell(-65.40, -5.60),
        purpose="second false-positive floor, far from any road",
        hypothesis=(
            "Deep interior forest with no access corridor. Two independent "
            "intact fixtures give a far better specificity estimate than one, "
            "and this one cannot be explained away by proximity to an edge."
        ),
        state=FixtureState.CONFIRMED,
        observed={
            "tree_cover_fraction_2020": 1.0,
            "alos_forest_fraction": 1.0,
            "iolulc_tree_fraction": 1.0,
            "method": "scripts/find_intact.py, amazonas-interior candidate 0",
        },
    ),
    AOI(
        id="cloudy",
        name="Wet-season interfluve, upper Ji-Parana",
        geometry=_cell(-62.40, -10.10),
        purpose="SAR-only path",
        hypothesis=(
            "Persistent wet-season cloud should push clear-observation fraction "
            "below the optical threshold, forcing the SAR-only answer and a "
            "degraded-not-broken response."
        ),
    ),
    AOI(
        id="degradation",
        name="Selective logging, BR-364 corridor",
        geometry=_cell(-62.62, -9.86),
        purpose="the hard case",
        hypothesis=(
            "Sub-canopy extraction with the canopy largely retained. Expected "
            "to be our weakest result — the fixture exists to keep us honest "
            "about it rather than to be passed."
        ),
    ),
    AOI(
        id="burn",
        name="Late dry-season burn scar, Candeias do Jamari",
        geometry=_cell(-63.28, -9.06),
        purpose="confounding signature",
        hypothesis=(
            "Fire scar. Optical change is dramatic while SAR backscatter change "
            "is muted, so a naive optical-only detector over-calls area here."
        ),
    ),
]

GOLDEN_BY_ID = {a.id: a for a in GOLDEN_AOIS}


def golden(*ids: str) -> Iterable[AOI]:
    """Select fixtures by id, or all of them when called with no arguments."""
    if not ids:
        return list(GOLDEN_AOIS)
    return [GOLDEN_BY_ID[i] for i in ids]
