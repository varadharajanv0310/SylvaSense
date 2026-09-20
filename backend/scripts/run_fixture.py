"""
Run the assembler over golden fixtures and print what came back.

This is the batch gate. Not "does it import" — what did each source actually
say, which ones failed and why, and is the output something a person could
check by hand.

    python scripts/run_fixture.py            # all five
    python scripts/run_fixture.py intact     # one
"""

from __future__ import annotations

import sys as _sys

# Windows consoles default to cp1252 and will mangle the report
if hasattr(_sys.stdout, "reconfigure"):
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import sys
import time
from datetime import date, timedelta

from sylvasense.aoi import GOLDEN_BY_ID, golden
from sylvasense.evidence import assemble, confidence
from sylvasense.sources import registry  # noqa: F401  (registers sources)


def run(fixture_id: str | None, days: int = 365, profile: str = "eudr") -> None:
    aois = [GOLDEN_BY_ID[fixture_id]] if fixture_id else list(golden())
    end = date.today()
    start = end - timedelta(days=days)

    for aoi in aois:
        t0 = time.perf_counter()
        ev = assemble(aoi, start=start, end=end, profile=profile)
        elapsed = time.perf_counter() - t0

        print("=" * 78)
        print(f"{aoi.id:<12} {aoi.name}")
        print(f"{'':<12} {aoi.purpose}  [{aoi.state.value}]")
        print(f"{'':<12} bbox={[round(v, 3) for v in aoi.bbox]}  {elapsed:.1f}s")
        print("-" * 78)

        for obs in ev.observations:
            unit = f" {obs.unit}" if obs.unit else ""
            line = f"  {obs.key:<28} {str(obs.value):>22}{unit}"
            if obs.uncertainty:
                u = obs.uncertainty
                line += f"   [{u.low:g}, {u.high:g}]"
            print(line)
            print(f"  {'':<28} <- {obs.source}")
            for d in obs.degradations:
                print(f"  {'':<28}    ~ {d}")
            for c in obs.caveats:
                print(f"  {'':<28}    . {c}")

        print("-" * 78)
        for s in ev.statuses:
            mark = {"ok": "+", "degraded": "~", "unavailable": "-"}[s.availability.value]
            print(f"  [{mark}] {s.source_id:<20} {s.availability.value:<12} {s.reason[:70]}")

        print("-" * 78)
        for n in ev.notes:
            print(f"  * {n}")
        c = confidence(ev)
        print(f"\n  confidence {c['score']:.2f} — {c['basis']}")
        print()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    run(args[0] if args else None)
