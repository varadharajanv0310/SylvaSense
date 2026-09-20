"""
Search for a genuine intact-forest fixture instead of guessing one.

The first `intact` candidate was picked by reading a protected-area name off a
map and trusting it. Three independent layers then described it as grassland.
Guessing again with better intentions would be the same mistake with a longer
delay, so this script samples candidate cells across regions where intact
forest is plausible, scores each one on what the layers actually report, and
ranks them.

Acceptance is deliberately strict. A false-positive floor is only useful if the
place really is undisturbed — a fixture that is 80% forest would quietly
license a 20% false-positive rate as "correct".
"""

from __future__ import annotations

import sys
from datetime import date

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from sylvasense.aoi import AOI
from sylvasense.sources.layers import ALOSForestNonForest, ESAWorldCover, IOLandCover

#: candidate regions, described honestly as guesses about *where to look*
REGIONS = {
    # large contiguous indigenous territory on the Rondonia/Amazonas divide,
    # well inside the boundary rather than near the edge
    "uru-eu-wau-wau": [(-63.10, -11.35), (-62.85, -11.10), (-63.35, -11.55)],
    # Rondonia's western protected block, away from the BR-364 corridor
    "pacaas-novos": [(-63.95, -11.05), (-64.15, -11.30), (-63.75, -10.85)],
    # Jaru reserve interior, further in than the first attempt
    "jaru-interior": [(-62.05, -10.30), (-61.85, -10.15), (-62.20, -10.45)],
    # deep interior Amazonas, far from any road — the control group
    "amazonas-interior": [(-65.40, -5.60), (-66.10, -6.20), (-64.80, -5.10)],
}

CELL = 0.06  # ~6.6 km


def score(aoi: AOI) -> dict:
    """Run only the cheap annual layers; the imagery series is not needed here."""
    out: dict = {"covers": {}, "classes": {}}
    for src in (ESAWorldCover(), ALOSForestNonForest(), IOLandCover()):
        obs, status = src.run(aoi, date(2020, 1, 1), date.today())
        if not status.usable:
            out.setdefault("failed", []).append(f"{src.id}: {status.code}")
            continue
        for o in obs:
            if isinstance(o.value, (int, float)):
                out["covers"][src.id] = float(o.value)
            elif isinstance(o.value, str):
                out["classes"][src.id] = o.value
    covers = list(out["covers"].values())
    out["min"] = min(covers) if covers else 0.0
    out["max"] = max(covers) if covers else 0.0
    out["spread"] = out["max"] - out["min"]
    return out


def verdict(s: dict) -> tuple[bool, str]:
    """
    A fixture that is only mostly forest is worse than none: it would license
    its own shortfall as an acceptable false-positive rate.
    """
    if len(s["covers"]) < 3:
        return False, f"only {len(s['covers'])} layers reported"
    if s["min"] < 0.90:
        return False, f"weakest layer {s['min']:.0%} (need >= 90%)"
    if s["spread"] > 0.10:
        return False, f"layers spread {s['spread']:.0%} (need <= 10%)"
    modal = s["classes"].get("esa-worldcover")
    if modal != "tree cover":
        return False, f"WorldCover modal class '{modal}'"
    alos = s["classes"].get("alos-fnf")
    if alos != "dense forest":
        return False, f"ALOS modal class '{alos}'"
    return True, "all layers agree on closed forest"


def main() -> None:
    results = []
    for region, centres in REGIONS.items():
        for i, (lon, lat) in enumerate(centres):
            aoi = AOI.from_bbox(
                lon, lat, lon + CELL, lat + CELL,
                id=f"{region}-{i}", name=f"{region} candidate {i}",
            )
            s = score(aoi)
            ok, why = verdict(s)
            results.append((ok, s["min"], region, i, aoi, s, why))
            flag = "PASS" if ok else "    "
            covers = " ".join(f"{k.split('-')[0]}={v:.2f}" for k, v in s["covers"].items())
            print(f"  {flag} {region:<19}#{i}  {covers:<44} {why}")

    print()
    passing = [r for r in results if r[0]]
    if not passing:
        print("No candidate met the bar. Widen the search rather than lowering it.")
        return

    passing.sort(key=lambda r: (-r[1], r[5]["spread"]))
    ok, mn, region, i, aoi, s, why = passing[0]
    w, sth, e, n = aoi.bbox
    print("BEST CANDIDATE")
    print(f"  {region} #{i}")
    print(f"  bbox   {w:.3f}, {sth:.3f}, {e:.3f}, {n:.3f}")
    print(f"  covers {s['covers']}")
    print(f"  classes {s['classes']}")
    print(f"  weakest layer {mn:.1%}, spread {s['spread']:.1%}")
    print()
    print("  paste into aoi.py:")
    print(f"        geometry=_cell({w:.2f}, {sth:.2f}),")


if __name__ == "__main__":
    main()
