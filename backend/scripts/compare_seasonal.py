"""Measure the seasonality fix against live data, both streams."""
import sys
from datetime import date, timedelta
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from sylvasense.aoi import GOLDEN_BY_ID
from sylvasense.detect import run_optical, run_sar

end = date.today(); start = end - timedelta(days=545)
print(f"{'fixture':<13}{'stream':<9}{'scenes':>7}{'confirmed':>11}{'provis':>9}{'first':>13}{'drop':>7}")
print("-" * 71)
for fid in ("clearcut", "degradation", "intact"):
    aoi = GOLDEN_BY_ID[fid]
    for name, fn in (("sar", run_sar), ("optical", run_optical)):
        r = fn(aoi, start, end)
        if not r.ok:
            print(f"{fid:<13}{name:<9}{r.n_observations:>7}   FAILED {r.reason[:40]}")
            continue
        res = r.result
        drop = f"{res.expected_drop:.2f}" if res.expected_drop else "-"
        first = res.first_confirmed_date()
        print(f"{fid:<13}{name:<9}{r.n_observations:>7}{res.confirmed_fraction:>11.3f}"
              f"{res.provisional_fraction:>9.3f}{str(first):>13}{drop:>7}")
