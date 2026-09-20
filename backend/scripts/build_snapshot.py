"""
Freeze a live report for each confirmed fixture into the front end's public
directory.

The page prefers the live API and falls back to this file. That is not a
convenience: the fit needs an Earthdata token and minutes of HDF5 reads, the
deployed app runs on Workers where no Python process exists, and a page that
silently shows nothing is worse than one that shows real numbers and says when
they were measured. The snapshot carries its own generation date so the page
can tell the reader how old it is.
"""
import json
import sys
import time
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from sylvasense.aoi import GOLDEN_AOIS, FixtureState
from sylvasense.api import fixture_report

OUT = Path(__file__).resolve().parents[2] / "public" / "sylvasense-report.json"

wanted = sys.argv[1:] or [
    a.id for a in GOLDEN_AOIS if a.state == FixtureState.CONFIRMED
]

sites = []
for fid in wanted:
    t0 = time.perf_counter()
    print(f"  {fid} ...", end=" ", flush=True)
    try:
        sites.append(fixture_report(fid))
        print(f"ok ({time.perf_counter() - t0:.0f}s)")
    except Exception as exc:
        print(f"FAILED {type(exc).__name__}: {exc}")

payload = {
    "generated": date.today().isoformat(),
    "note": (
        "Captured from the SylvaSense API against live Planetary Computer and "
        "NASA Earthdata reads. Served when the API is unreachable."
    ),
    "sites": sites,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, indent=1, default=str), encoding="utf-8")
print(f"\nwrote {OUT}  ({OUT.stat().st_size / 1024:.0f} KB, {len(sites)} sites)")
