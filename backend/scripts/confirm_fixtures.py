"""
Test each fixture's hypothesis against what the layers actually report, and
write the verdict to fixtures_observed.json.

The point of this script is to stop me believing my own labels. A fixture
called "intact" that three independent layers describe as grassland is not an
intact-forest fixture, and using it as a false-positive gate would bake a wrong
assumption into every later batch.

Verdicts are deliberately conservative: a hypothesis that cannot be tested from
Batch 2 evidence is marked UNTESTABLE_YET, not CONFIRMED.
"""

from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from sylvasense.aoi import golden
from sylvasense.evidence import assemble
from sylvasense.sources import registry  # noqa: F401

OUT = Path(__file__).resolve().parent.parent / "fixtures_observed.json"

#: cover layers we can cross-check
COVER = ("tree_cover_fraction_2020", "alos_forest_fraction", "iolulc_tree_fraction")


def judge(fid: str, vals: dict[str, float], extras: dict) -> tuple[str, str]:
    """Return (verdict, why). Conservative by construction."""
    covers = [v for k, v in vals.items() if k in COVER]
    lo = min(covers) if covers else None
    hi = max(covers) if covers else None
    modal = extras.get("landcover_2020")
    alos_class = extras.get("alos_forest_class")

    if fid == "intact":
        if lo is None:
            return "untestable_yet", "no cover layer returned"
        if lo >= 0.85 and modal == "tree cover":
            return "confirmed", f"all layers >= {lo:.0%}, modal class tree cover"
        return (
            "rejected",
            f"cover spans {lo:.0%}-{hi:.0%}, modal class '{modal}', ALOS '{alos_class}'"
            " — this is not undisturbed forest",
        )

    if fid == "clearcut":
        if lo is None:
            return "untestable_yet", "no cover layer returned"
        if hi <= 0.45 and alos_class == "non-forest":
            return (
                "partially_confirmed",
                f"low cover ({lo:.0%}-{hi:.0%}) and ALOS non-forest are consistent with "
                "cleared land, but the *date* of clearing cannot be established from "
                "annual layers — needs the Batch 3 alert engine",
            )
        return "rejected", f"cover {lo:.0%}-{hi:.0%} too high for a clear-cut"

    if fid == "cloudy":
        rate = vals.get("clear_fraction")
        if rate is None:
            return "untestable_yet", "optical source returned nothing"
        if rate < 0.25:
            return "confirmed", f"clear-observation rate {rate:.0%} forces the SAR-only path"
        return (
            "rejected",
            f"clear-observation rate {rate:.0%} over a 365-day window is unremarkable; "
            "to exercise the SAR-only path this fixture needs a wet-season-only window",
        )

    if fid == "degradation":
        if lo is None:
            return "untestable_yet", "no cover layer returned"
        return (
            "untestable_yet",
            f"cover {lo:.0%}-{hi:.0%} with modal '{modal}'. Sub-canopy extraction is "
            "invisible to annual land-cover layers by definition — this fixture can "
            "only be judged once time-series detection exists",
        )

    if fid == "burn":
        return (
            "untestable_yet",
            "a burn scar is a temporal signature; annual composites cannot confirm it. "
            "Needs the Batch 3 detectors plus a dry-season window",
        )

    return "untestable_yet", "no rule for this fixture"


def main(days: int = 365) -> None:
    end = date.today()
    start = end - timedelta(days=days)
    report = {}

    for aoi in golden():
        ev = assemble(aoi, start=start, end=end, profile="eudr")
        vals = {
            o.key: o.value
            for o in ev.observations
            if isinstance(o.value, (int, float))
        }
        extras = {
            o.key: o.value for o in ev.observations if isinstance(o.value, str)
        }
        verdict, why = judge(aoi.id, vals, extras)
        report[aoi.id] = {
            "name": aoi.name,
            "hypothesis": aoi.hypothesis,
            "verdict": verdict,
            "why": why,
            "window": {"start": start.isoformat(), "end": end.isoformat()},
            "observed": {**vals, **extras},
            "unavailable": [s.source_id for s in ev.unavailable],
        }
        print(f"{aoi.id:<12} {verdict.upper():<20} {why}")

    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nwritten to {OUT}")


if __name__ == "__main__":
    main()
