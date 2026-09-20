"""
Find ground that was forest in 2020 and is not forest now.

The `clearcut` fixture cannot measure sensitivity: it was already 32-37% tree
cover at the EUDR baseline, so it is *previously* cleared land, and a detector
watching 2025-2026 should find little there. Testing recall against it would
have told us the detector was blind when it was merely looking at the wrong
ground — the same mistake that the `intact` fixture made in the other
direction.

So: search for cells where an independent 2020 layer says closed forest and an
independent recent layer says it is gone. The transition is then bracketed by
two sources that know nothing about our detector.
"""

from __future__ import annotations

import sys
from datetime import date

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import numpy as np

from sylvasense.aoi import AOI
from sylvasense.sources.layers import ESAWorldCover, IOLandCover

#: the arc of deforestation, where new clearing is most likely
STRIPS = {
    "machadinho": (-62.30, -62.00, -9.60, -9.30),
    "candeias": (-63.40, -63.10, -9.20, -8.90),
    "buritis": (-63.90, -63.60, -10.30, -10.00),
    "cujubim": (-62.90, -62.60, -9.40, -9.10),
}
CELL = 0.06
PER_STRIP = 4


def main() -> None:
    rng = np.random.default_rng(11)
    rows = []

    for name, (w0, w1, s0, s1) in STRIPS.items():
        for i in range(PER_STRIP):
            lon = float(rng.uniform(w0, w1 - CELL))
            lat = float(rng.uniform(s0, s1 - CELL))
            aoi = AOI.from_bbox(lon, lat, lon + CELL, lat + CELL,
                                id=f"{name}-{i}", name=f"{name} {i}")

            wc_2020 = _first(ESAWorldCover(), aoi, "tree_cover_fraction_2020")
            io_now = _first(IOLandCover(), aoi, "iolulc_tree_fraction")
            if wc_2020 is None or io_now is None:
                print(f"       {name:<12}#{i}  layers unavailable")
                continue

            loss = wc_2020 - io_now
            good = wc_2020 >= 0.85 and io_now <= 0.55 and loss >= 0.35
            rows.append((good, loss, name, i, aoi, wc_2020, io_now))
            flag = "PASS" if good else "    "
            print(f"  {flag} {name:<12}#{i}  2020={wc_2020:.2f}  now={io_now:.2f}  "
                  f"loss={loss:+.2f}")

    print()
    passing = sorted([r for r in rows if r[0]], key=lambda r: -r[1])
    if not passing:
        print("Nothing met the bar. The strips may be already-cleared rather than")
        print("recently-cleared; widen the search before relaxing the threshold.")
        return

    _, loss, name, i, aoi, wc, io = passing[0]
    w, s, e, n = aoi.bbox
    print("BEST CANDIDATE — forest in 2020, gone now")
    print(f"  {name} #{i}")
    print(f"  WorldCover 2020 tree cover {wc:.0%} -> io-lulc now {io:.0%}  ({loss:+.0%})")
    print(f"  bbox {w:.3f}, {s:.3f}, {e:.3f}, {n:.3f}")
    print(f"\n  paste into aoi.py:   geometry=_cell({w:.2f}, {s:.2f}),")


def _first(source, aoi: AOI, key: str) -> float | None:
    obs, status = source.run(aoi, date(2020, 1, 1), date.today())
    if not status.usable:
        return None
    for o in obs:
        if o.key == key and isinstance(o.value, (int, float)):
            return float(o.value)
    return None


if __name__ == "__main__":
    main()
