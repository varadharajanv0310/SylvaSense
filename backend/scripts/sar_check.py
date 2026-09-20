"""Does the SAR stream run now that signing is fixed?"""
import sys
from datetime import date, timedelta
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from sylvasense.aoi import GOLDEN_BY_ID
from sylvasense.detect import run_sar

end = date.today(); start = end - timedelta(days=545)
for fid in ("clearcut", "degradation"):
    r = run_sar(GOLDEN_BY_ID[fid], start, end)
    if not r.ok:
        print(f"{fid:<12} FAILED  n={r.n_observations}  {r.reason[:90]}")
        continue
    res = r.result
    print(f"{fid:<12} scenes={r.n_observations:<4} confirmed={res.confirmed_fraction:.3f}  "
          f"first={res.first_confirmed_date()}  obs_to_confirm={res.latency_observations()}  "
          f"nf_mu={res.nonforest_mu:.2f}dB")
