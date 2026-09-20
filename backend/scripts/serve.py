"""
Start the API and warm it, in that order.

The warming matters. Every block of a report is cached, but the report itself
is assembled from a Bayesian detector run over ~130 scenes and a biomass model
fit against GEDI: the first call for a site took 3 minutes 15 seconds even with
every input already on disk. Cached, the same call takes 0.09 seconds. A front
end that hits a cold API looks broken; one that hits a warm API is instant, so
the server warms itself in the background while it serves.

    python scripts/serve.py            # serve on 8000 and warm every fixture
    python scripts/serve.py --no-warm  # just serve
"""
import argparse
import sys
import threading
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8000)
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--no-warm", action="store_true")
args = parser.parse_args()

BASE = f"http://{args.host}:{args.port}"


def warm() -> None:
    """Pull every fixture through the API once so the next caller is served hot."""
    for _ in range(60):  # wait for the server to bind
        try:
            urllib.request.urlopen(f"{BASE}/health", timeout=2).read()
            break
        except Exception:
            time.sleep(1)
    else:
        print("[warm] server never came up; skipping", flush=True)
        return

    try:
        import json

        with urllib.request.urlopen(f"{BASE}/fixtures", timeout=10) as fh:
            ids = [f["id"] for f in json.load(fh)["fixtures"]]
    except Exception as exc:
        print(f"[warm] could not list fixtures: {exc}", flush=True)
        return

    for fid in ids:
        t0 = time.perf_counter()
        try:
            # generous: a cold report is minutes, and that is the point of this
            urllib.request.urlopen(f"{BASE}/report/{fid}", timeout=1800).read()
            print(f"[warm] {fid} ready in {time.perf_counter() - t0:.0f}s", flush=True)
        except urllib.error.URLError as exc:
            print(f"[warm] {fid} failed: {exc}", flush=True)
    print("[warm] all fixtures cached; responses are now instant", flush=True)


if not args.no_warm:
    threading.Thread(target=warm, daemon=True).start()

import uvicorn  # noqa: E402  (imported late so --help stays fast)

uvicorn.run("sylvasense.api:app", host=args.host, port=args.port)
