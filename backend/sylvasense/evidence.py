"""
The convergence-of-evidence assembler.

This is the layer that turns several partial, disagreeing, sometimes absent
sources into one answer with an honest confidence. Three rules it exists to
enforce:

  1. Sources run independently and never see each other's output. Correlated
     evidence is worth much less than it looks, and the only way to keep it
     honest is to keep them ignorant of each other.
  2. Disagreement is reported, not averaged. Two layers straddling a decision
     threshold is information; their mean is not.
  3. A missing source widens the answer, it does not break it.

No estimator lives here. Batches 3 and 4 add them behind this same interface.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Any

import structlog

from . import forest
from .aoi import AOI
from .config import settings
from .provenance import Evidence, Observation
from .sources.base import Source, registry

log = structlog.get_logger(__name__)

#: layers that each claim to measure tree cover, for the disagreement check
COVER_KEYS = (
    "tree_cover_fraction_2020",
    "alos_forest_fraction",
    "iolulc_tree_fraction",
)


def assemble(
    aoi: AOI,
    *,
    start: date | None = None,
    end: date | None = None,
    profile: str = "fao",
    sources: list[Source] | None = None,
    max_workers: int = 6,
) -> Evidence:
    end = end or date.today()
    start = start or (end - timedelta(days=365))
    definition = forest.get(profile)
    ev = Evidence()

    chosen = sources if sources is not None else registry.all()
    # sources are independent by construction, so running them concurrently
    # costs nothing conceptually and hides most of the network latency
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(s.run, aoi, start, end): s for s in chosen}
        for fut, src in futures.items():
            observations, status = fut.result()
            for obs in observations:
                ev.add(obs)
            ev.record(status)

    _annotate(ev, aoi, definition)
    return ev


def _annotate(ev: Evidence, aoi: AOI, definition: forest.ForestDefinition) -> None:
    """Add the cross-source reasoning that no single source could produce."""

    covers = {}
    for key in COVER_KEYS:
        for obs in ev.by_key(key):
            if isinstance(obs.value, (int, float)):
                covers[obs.source] = float(obs.value)

    note = forest.disagreement_note(covers)
    if note:
        ev.notes.append(note)

    if covers:
        agreed = definition.meets_cover(min(covers.values()))
        unanimous = agreed is definition.meets_cover(max(covers.values()))
        ev.notes.append(
            f"forest test under '{definition.id}' "
            f"(>= {definition.min_canopy_cover:.0%} cover, >= {definition.min_height_m:g} m): "
            + (
                f"{'met' if agreed else 'not met'} by all {len(covers)} independent layers"
                if unanimous
                else "not resolvable — layers fall on both sides of the threshold"
            )
        )
    else:
        ev.notes.append(
            "no independent tree-cover layer returned a value; the "
            "forest/non-forest call cannot be made from this evidence"
        )

    if not aoi.gedi_covered:
        ev.notes.append(
            "AOI lies outside GEDI's +/-51.6 degree sampling band; height and "
            "biomass would have to come from ICESat-2 instead"
        )

    if definition.baseline:
        ev.notes.append(
            f"'{definition.id}' measures change against {definition.baseline.isoformat()}, "
            "so the 2020 layers are the ones that matter for compliance"
        )

    stale = [o for o in ev.observations if (o.stale_days() or 0) > settings.stale_after_days]
    if stale:
        ev.notes.append(
            f"{len(stale)} observation(s) served from cache older than "
            f"{settings.stale_after_days:g} days"
        )


def confidence(ev: Evidence) -> dict[str, Any]:
    """
    A blunt, legible confidence account. Deliberately not a learned score —
    at this stage an interpretable ratio beats a number nobody can defend.
    Batch 4 replaces the quantitative half with conformal intervals.
    """
    total = len(ev.statuses)
    ok = sum(1 for s in ev.statuses if s.availability.value == "ok")
    degraded = len(ev.degraded)
    missing = len(ev.unavailable)

    score = (ok + 0.5 * degraded) / total if total else 0.0

    # layers landing on opposite sides of the decision threshold: the call
    # cannot be made at all
    if any("not resolvable" in n for n in ev.notes):
        score *= 0.6
    # layers agreeing on the class but not the magnitude: the call can be made,
    # but nothing quantitative built on it should be trusted
    elif any("disagree on tree cover" in n for n in ev.notes):
        score *= 0.75

    return {
        "score": round(score, 3),
        "basis": f"{ok} of {total} sources nominal, {degraded} degraded, {missing} unavailable",
        "limits": [s.reason for s in ev.unavailable if s.reason],
    }
