"""Batch 3 gate: run detection on the fixtures and report latency."""
from __future__ import annotations

import sys
from datetime import date, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from sylvasense.aoi import GOLDEN_BY_ID, golden
from sylvasense.detect import detect_disturbance


def main(fixture: str | None = None, days: int = 730) -> None:
    aois = [GOLDEN_BY_ID[fixture]] if fixture else list(golden())
    end = date.today()
    start = end - timedelta(days=days)
    for aoi in aois:
        print("=" * 76)
        print(f"{aoi.id:<12} {aoi.name}")
        print(f"{'':<12} window {start} .. {end}")
        print("-" * 76)
        for obs in detect_disturbance(aoi, start, end):
            print(f"  {obs.key:<38} {obs.value}")
            for k, v in (obs.extra or {}).items():
                if v is not None:
                    print(f"  {'':<38}   {k} = {v}")
            for c in obs.caveats:
                print(f"  {'':<38}   ! {c[:70]}")
        print()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    main(args[0] if args else None)
