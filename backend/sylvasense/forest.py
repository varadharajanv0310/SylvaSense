"""
What counts as forest.

Hard-coding one definition is a design bug, not a simplification. FAO, the
EUDR and any given national inventory disagree about the same pixel, and the
disagreement is often larger than the measurement error we spend all our effort
reducing. So the definition is a parameter, it travels with the answer, and the
API states which one it applied.

The EUDR subtlety worth keeping in view: it does not ask "is this forest now".
It asks whether forest present on 31 December 2020 has since been converted to
agricultural use. That is a question about *change against a fixed baseline*,
which is why the 2020 layers matter more than the current ones.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

Profile = Literal["fao", "eudr", "national_br", "monitoring"]


@dataclass(frozen=True)
class ForestDefinition:
    id: str
    label: str
    min_area_ha: float
    min_canopy_cover: float
    min_height_m: float
    #: land under agricultural or urban use is excluded even if tree-covered
    excludes_agriculture: bool
    #: the date change is measured against, where the definition fixes one
    baseline: date | None
    notes: str = ""

    def meets_cover(self, cover_fraction: float | None) -> bool | None:
        if cover_fraction is None:
            return None
        return cover_fraction >= self.min_canopy_cover


FAO = ForestDefinition(
    id="fao",
    label="FAO Global Forest Resources Assessment",
    min_area_ha=0.5,
    min_canopy_cover=0.10,
    min_height_m=5.0,
    excludes_agriculture=True,
    baseline=None,
    notes="Trees able to reach 5 m in situ; excludes land predominantly under "
    "agricultural or urban use. Temporarily unstocked areas still count.",
)

EUDR = ForestDefinition(
    id="eudr",
    label="EU Deforestation Regulation",
    min_area_ha=0.5,
    min_canopy_cover=0.10,
    min_height_m=5.0,
    excludes_agriculture=True,
    baseline=date(2020, 12, 31),
    notes="Deforestation is conversion of forest to agricultural use after the "
    "cut-off. Degradation without conversion is treated separately, and "
    "agroforestry sits awkwardly across the boundary.",
)

NATIONAL_BR = ForestDefinition(
    id="national_br",
    label="Brazil national reporting",
    min_area_ha=0.5,
    min_canopy_cover=0.10,
    min_height_m=5.0,
    excludes_agriculture=True,
    baseline=None,
    notes="Thresholds align with FAO; operational mapping (PRODES/DETER) uses "
    "a minimum mapping unit nearer 6.25 ha, so small clearings are "
    "systematically under-counted relative to what we can detect.",
)

MONITORING = ForestDefinition(
    id="monitoring",
    label="Permissive monitoring definition",
    min_area_ha=0.1,
    min_canopy_cover=0.10,
    min_height_m=3.0,
    excludes_agriculture=False,
    baseline=None,
    notes="Deliberately loose. For change detection where we would rather "
    "raise a question than miss one; not suitable for compliance reporting.",
)

DEFINITIONS: dict[str, ForestDefinition] = {
    d.id: d for d in (FAO, EUDR, NATIONAL_BR, MONITORING)
}


def get(profile: str | None) -> ForestDefinition:
    return DEFINITIONS.get((profile or "fao").lower(), FAO)


def disagreement_note(cover_values: dict[str, float]) -> str | None:
    """
    Where independent layers disagree about tree cover, say so. A spread that
    straddles the 10% threshold means the forest/non-forest call is not
    resolvable from these inputs, and no amount of averaging fixes that.
    """
    vals = [v for v in cover_values.values() if v is not None]
    if len(vals) < 2:
        return None
    lo, hi = min(vals), max(vals)
    if hi - lo < 0.15:
        return None
    return (
        f"independent layers disagree on tree cover ({lo:.0%}-{hi:.0%}); "
        "treat the forest/non-forest call as unresolved"
    )
