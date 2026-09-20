"""
Fit the wall-to-wall biomass model on a fixture and report whether its
intervals actually cover. Usage: run_biomass.py [fixture_id ...]
"""
import sys
import time
from datetime import date

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from sylvasense.aoi import GOLDEN_AOIS
from sylvasense.biomass import fit_biomass, predict_map

END = date(2025, 12, 31)
wanted = sys.argv[1:] or ["intact", "clearcut"]

for fid in wanted:
    aoi = next((a for a in GOLDEN_AOIS if a.id == fid), None)
    if aoi is None:
        print(f"!! no fixture {fid!r}")
        continue
    print(f"\n=== {aoi.id}  {aoi.name} ===")
    t0 = time.perf_counter()
    try:
        fit = fit_biomass(aoi, END)
    except Exception as exc:
        print(f"  FAILED after {time.perf_counter()-t0:.0f}s: {type(exc).__name__}: {exc}")
        continue

    d = fit.as_dict()
    c = d["coverage"]
    print(f"  fitted in {time.perf_counter()-t0:.0f}s on {d['n_train']} footprints "
          f"(calib {d['n_calibration']}, test {d['n_test']})")
    print(f"  predictors: {d['predictor_sources']}")
    print(f"  GEDI mean {d['gedi_mean_mg_ha']} Mg/ha   model RMSE {d['rmse_mg_ha']}   "
          f"bias {d['bias_mg_ha']}   R2 {d['r2']}")
    print(f"  coverage {c['empirical']:.3f} vs nominal {c['nominal']} on {c['n']} "
          f"held-out shots, mean width {c['mean_width']:.0f} Mg/ha "
          f"-> {'PASS' if c['passes'] else 'FAIL'}"
          f"{'' if d['coverage_on_held_out_blocks'] else '  (calibration set, NOT a test)'}")
    print(f"  importance: {d['feature_importance']}")
    print(f"  note: {d['saturation']}")

    t1 = time.perf_counter()
    bm = predict_map(fit)
    print(f"  map {bm.mean.shape} in {time.perf_counter()-t1:.0f}s")
    print(f"  region : {bm.summary()}")
    print(f"  the AOI: {bm.summary(aoi.bbox)}")
