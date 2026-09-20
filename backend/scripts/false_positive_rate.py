"""
The measurement the rejected fixture made impossible: a false-positive rate on
real imagery.

Any pixel confirmed over closed primary forest is a false positive. Two
independent intact sites, so the number cannot be explained away by one
unlucky location.

The sweep over window lengths is the point. An earlier version measured one
window (545 days), reported 3.09%, and left the impression that 3.09% was
*the* false-positive rate. It is the rate at one window length. At 365 days
the same detector on the same forest confirmed 41.6%, and the API's default
window was 365 days. A single-number gate hid that completely, so the gate is
now a curve.
"""
import sys
from datetime import date, timedelta
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from sylvasense.aoi import GOLDEN_BY_ID
from sylvasense.detect import run_optical, run_sar

WINDOWS = [int(d) for d in sys.argv[1:]] or [365, 455, 545, 730, 1095]
end = date.today()

print(f"{'fixture':<14}{'stream':<9}{'days':>6}{'scenes':>7}{'span':>7}"
      f"{'FALSE POS':>11}{'provisional':>13}")
print("-" * 70)
rates: dict[tuple, float] = {}
for fid in ("intact", "intact-deep"):
    for name, fn in (("sar", run_sar), ("optical", run_optical)):
        for days in WINDOWS:
            r = fn(GOLDEN_BY_ID[fid], end - timedelta(days=days), end)
            if not r.ok:
                print(f"{fid:<14}{name:<9}{days:>6}{r.n_observations:>7}"
                      f"   n/a  {r.reason[:30]}")
                continue
            res = r.result
            span = (res.dates[-1] - res.dates[0]).days if len(res.dates) > 1 else 0
            # a run the detector refused to confirm is not evidence of accuracy,
            # so it does not count toward the worst-case rate
            if not res.underpowered:
                rates[(fid, name, days)] = res.confirmed_fraction
            mark = "  (refused)" if res.underpowered else ""
            print(f"{fid:<14}{name:<9}{days:>6}{r.n_observations:>7}{span:>7}"
                  f"{res.confirmed_fraction:>10.2%}{res.provisional_fraction:>12.2%}{mark}")
print("-" * 70)
if rates:
    worst = max(rates, key=rates.get)
    print(f"  worst false-positive rate where the detector DID confirm: "
          f"{rates[worst]:.2%}  ({worst[0]}/{worst[1]} at {worst[2]}d)")
    print("  runs marked (refused) confirmed nothing because the monitoring "
          "span was below the power threshold.")
