"""
The plot-level evidence API — Batch 2's shippable surface.

Deliberately not a "score this plot" endpoint. It returns what each independent
source says, which ones could not speak and why, where they disagree, and which
forest definition was applied. A caller who wants a verdict can form one; a
caller who wants to check our working can do that too. That distinction is the
whole product.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import os

import structlog
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import biomass as biomass_mod
from . import forest
from .cache import cache
from .aoi import AOI, GOLDEN_AOIS, GOLDEN_BY_ID
from .config import settings
from .area import Stratum, estimate
from .detect import detect_disturbance
from .evidence import assemble, confidence
from .sources import registry  # noqa: F401  (import registers sources)

log = structlog.get_logger(__name__)

#: Two years, because one is not enough to confirm anything.
#:
#: The detector splits its series into history and monitoring. Over 365 days
#: Sentinel-1 gives about 27 scenes here, so 14 land in monitoring, and with
#: that few the persistence test cannot tell a clearing from speckle: measured
#: on verified primary forest the false-positive rate was 41.6%. At 730 days it
#: is 0.10%. The detector now refuses to confirm below its own power threshold,
#: but the default window should not be one that trips it.
DEFAULT_WINDOW_DAYS = 730

app = FastAPI(
    title="SylvaSense evidence API",
    version="0.1.0",
    description=(
        "Plot-level convergence of evidence for forest monitoring. Every value "
        "carries its source, acquisition window, method and uncertainty."
    ),
)


# The front end is served by Next on another port, so every call to this API
# is cross-origin. Read-only evidence over public satellite data carries no
# secret worth protecting with an origin check - the Earthdata token never
# leaves the server - so the permissive policy costs nothing here. A deployment
# that added write routes would need to narrow it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class PlotRequest(BaseModel):
    geometry: dict[str, Any] = Field(
        ..., description="GeoJSON geometry (Polygon or MultiPolygon), WGS84"
    )
    start: date | None = Field(None, description="analysis window start; defaults to 1 year back")
    end: date | None = Field(None, description="analysis window end; defaults to today")
    profile: forest.Profile = Field("fao", description="which forest definition to apply")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "version": app.version,
        "offline": settings.offline,
        "sources": len(registry.all()),
    }


@app.get("/sources")
def sources() -> dict[str, Any]:
    """What the system can draw on, and what each one needs to work."""
    return {
        "sources": [
            {
                "id": s.id,
                "title": s.title,
                "provides": list(s.provides),
                "requires_credential": s.requires_credential,
            }
            for s in registry.all()
        ]
    }


@app.get("/definitions")
def definitions() -> dict[str, Any]:
    return {
        "definitions": [
            {
                "id": d.id,
                "label": d.label,
                "min_area_ha": d.min_area_ha,
                "min_canopy_cover": d.min_canopy_cover,
                "min_height_m": d.min_height_m,
                "excludes_agriculture": d.excludes_agriculture,
                "baseline": d.baseline.isoformat() if d.baseline else None,
                "notes": d.notes,
            }
            for d in forest.DEFINITIONS.values()
        ]
    }


@app.get("/fixtures")
def fixtures() -> dict[str, Any]:
    """The golden AOIs, with their state made explicit rather than implied."""
    return {
        "fixtures": [
            {
                "id": a.id,
                "name": a.name,
                "state": a.state.value,
                "purpose": a.purpose,
                "hypothesis": a.hypothesis,
                "bbox": list(a.bbox),
                "gedi_covered": a.gedi_covered,
                "observed": a.observed,
            }
            for a in GOLDEN_AOIS
        ],
        "note": (
            "Candidate fixtures carry an unverified hypothesis. Only confirmed "
            "fixtures may be used as pass/fail gates."
        ),
    }


class DisturbanceRequest(BaseModel):
    geometry: dict[str, Any]
    start: date | None = None
    end: date | None = None


class BiomassRequest(BaseModel):
    geometry: dict[str, Any]
    level: float = 0.9


class AreaRequest(BaseModel):
    """
    Bias-adjusted area from a reference sample. The caller supplies the map
    strata and the reference labels of the sampled units; we supply the
    estimator and the confidence interval.
    """

    strata: list[dict[str, Any]] = Field(
        ...,
        description="[{label, n_units, sample: [reference labels]}]",
        examples=[[
            {"label": "change", "n_units": 2000, "sample": ["change", "no-change"]},
            {"label": "no-change", "n_units": 98000, "sample": ["no-change"]},
        ]],
    )
    total_area_ha: float
    confidence_level: float = 0.95


@app.post("/disturbance")
def disturbance(req: DisturbanceRequest) -> dict[str, Any]:
    """
    Bayesian time-series detection on independent sensors, integrated.

    Returns pixel fractions and confirmation dates. It deliberately does not
    return an area: see /area. Response-cached, because the detector runs over
    a hundred-odd scenes and the answer does not change within a day.
    """
    try:
        aoi = AOI.from_geojson(req.geometry)
    except Exception as exc:
        raise HTTPException(422, f"could not read geometry: {exc}") from exc
    end = req.end or date.today()
    start = req.start or (end - timedelta(days=DEFAULT_WINDOW_DAYS))
    parts = {"aoi": aoi.key(), "start": start.isoformat(), "end": end.isoformat()}

    def produce() -> dict[str, Any]:
        obs = detect_disturbance(aoi, start, end)
        return {
            "aoi": {"bbox": list(aoi.bbox), "centroid": list(aoi.centroid)},
            "window": {"start": start.isoformat(), "end": end.isoformat()},
            "observations": [o.as_dict() for o in obs],
        }

    return cache.fetch("disturbance", parts, produce).value


@app.post("/area")
def area(req: AreaRequest) -> dict[str, Any]:
    """The only endpoint permitted to return hectares."""
    try:
        strata = [
            Stratum(s["label"], int(s["n_units"]), list(s["sample"])) for s in req.strata
        ]
        assessment = estimate(
            strata, req.total_area_ha, confidence_level=req.confidence_level
        )
    except (KeyError, TypeError) as exc:
        raise HTTPException(422, f"malformed strata: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {
        **assessment.as_dict(),
        "method_reference": "Olofsson et al. 2014, Remote Sensing of Environment 148:42-57",
    }


@app.post("/plot")
def plot(req: PlotRequest) -> dict[str, Any]:
    """
    Full evidence table for a polygon.

    Response-cached like /report, and for the same reason: caching the STAC
    searches still leaves every call re-reading windows out of the COGs and
    re-deriving each observation. Same polygon, same window, same day means
    the same answer, so it is computed once.
    """
    try:
        aoi = AOI.from_geojson(req.geometry)
    except Exception as exc:
        raise HTTPException(422, f"could not read geometry: {exc}") from exc
    end = req.end or date.today()
    start = req.start or (end - timedelta(days=DEFAULT_WINDOW_DAYS))
    parts = {"aoi": aoi.key(), "start": start.isoformat(), "end": end.isoformat(),
             "profile": req.profile}
    return cache.fetch(
        "plot", parts, lambda: _respond(aoi, start, end, req.profile)
    ).value


@app.get("/fixtures/{fixture_id}/evidence")
def fixture_evidence(
    fixture_id: str,
    profile: forest.Profile = "fao",
    days: int = DEFAULT_WINDOW_DAYS,
) -> dict[str, Any]:
    aoi = GOLDEN_BY_ID.get(fixture_id)
    if aoi is None:
        raise HTTPException(404, f"no fixture '{fixture_id}'")
    end = date.today()
    return _respond(aoi, end - timedelta(days=days), end, profile)


def _respond(
    aoi: AOI, start: date | None, end: date | None, profile: str
) -> dict[str, Any]:
    ev = assemble(aoi, start=start, end=end, profile=profile)
    definition = forest.get(profile)
    return {
        "aoi": {
            "id": aoi.id,
            "bbox": list(aoi.bbox),
            "centroid": list(aoi.centroid),
            "gedi_covered": aoi.gedi_covered,
        },
        "window": {
            "start": start.isoformat() if start else None,
            "end": end.isoformat() if end else None,
        },
        "definition": {
            "id": definition.id,
            "label": definition.label,
            "baseline": definition.baseline.isoformat() if definition.baseline else None,
        },
        "confidence": confidence(ev),
        **ev.as_dict(),
        "disclaimer": (
            "Evidence layers, not a compliance determination. Areas reported "
            "here are map-derived; bias-adjusted area estimation arrives in a "
            "later batch and is required before any figure is used for "
            "reporting."
        ),
    }


@app.get("/biomass/{fixture_id}")
def fixture_biomass(fixture_id: str, level: float = 0.9) -> dict[str, Any]:
    """
    Wall-to-wall aboveground biomass over the fixture, calibrated on GEDI.

    Cold this takes minutes - GEDI granules are multi-GB HDF5 reads and the
    predictor stack is three sensors over a 78 km box - so it is cached and
    deliberately kept off the plot request path.
    """
    aoi = GOLDEN_BY_ID.get(fixture_id)
    if aoi is None:
        raise HTTPException(404, f"no fixture '{fixture_id}'")
    try:
        fit = biomass_mod.fit_biomass(aoi, date.today(), level=level)
    except Exception as exc:
        # a missing token or a beam that never crossed is not a server fault
        return {
            "fixture": fixture_id,
            "available": False,
            "reason": f"{type(exc).__name__}: {exc}",
        }
    bm = biomass_mod.predict_map(fit)
    return {
        "fixture": fixture_id,
        "available": True,
        "aoi": bm.summary(aoi.bbox),
        "region": bm.summary(),
        "fit": fit.as_dict(),
        "usable": fit.usable,
    }


@app.get("/report/{fixture_id}")
def fixture_report(
    fixture_id: str,
    profile: forest.Profile = "fao",
    days: int = DEFAULT_WINDOW_DAYS,
    refresh: bool = False,
) -> dict[str, Any]:
    """
    Everything the front end needs about one site, in one round trip:
    evidence, disturbance, biomass, and the definition being applied.

    **The whole response is cached, not just its inputs.** Caching the STAC
    searches and the GEDI granules still left every request re-running the
    Bayesian detector over 130 scenes and re-fitting the biomass model: a warm
    call took 1 minute 54 seconds, which is correct and unusable. Nothing in
    here changes between requests on the same day, so the report itself is the
    right thing to cache. `?refresh=true` forces a recompute.

    Each block is allowed to fail on its own. A report missing its biomass
    section because Earthdata was down is worth more than a 500, and the
    absence is stated rather than left as a gap in the JSON.
    """
    aoi = GOLDEN_BY_ID.get(fixture_id)
    if aoi is None:
        raise HTTPException(404, f"no fixture '{fixture_id}'")

    parts = {
        "fixture": fixture_id,
        "profile": profile,
        "days": days,
        # a report is a statement about a window ending today; tomorrow's is a
        # different report, so the date belongs in the key
        "as_of": date.today().isoformat(),
    }
    if refresh:
        cache.forget("report", parts)
    return cache.fetch("report", parts, lambda: _build_report(aoi, profile, days)).value


def _build_report(aoi: AOI, profile: str, days: int) -> dict[str, Any]:
    end = date.today()
    start = end - timedelta(days=days)

    out: dict[str, Any] = {
        "fixture": {
            "id": aoi.id,
            "name": aoi.name,
            "state": aoi.state.value,
            "purpose": aoi.purpose,
            "hypothesis": aoi.hypothesis,
            "bbox": [round(v, 4) for v in aoi.bbox],
            "centroid": [round(v, 4) for v in aoi.centroid],
        },
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "generated": end.isoformat(),
    }

    for name, fn in (
        ("evidence", lambda: _respond(aoi, start, end, profile)),
        ("disturbance", lambda: [o.as_dict() for o in detect_disturbance(aoi, start, end)]),
        ("biomass", lambda: fixture_biomass(aoi.id)),
    ):
        try:
            out[name] = fn()
        except Exception as exc:
            log.warning("report_block_failed", block=name, error=str(exc))
            out[name] = {"available": False, "reason": f"{type(exc).__name__}: {exc}"}
    return out


@app.post("/biomass")
def biomass_for_geometry(req: BiomassRequest) -> dict[str, Any]:
    """
    Wall-to-wall biomass over an arbitrary polygon, calibrated on GEDI.

    The fixture route exists because those six sites are cached; this one is
    for anywhere else, and it is slow the first time by construction - GEDI
    granules are multi-GB HDF5 reads and the predictor stack is three sensors
    over a 78 km box. The result is cached on the geometry, so the second call
    for the same area is immediate.

    It can legitimately return `available: false`. GEDI beams are 600 m apart
    and not every region has enough quality footprints to calibrate against;
    saying so is the correct answer, and an uncalibrated number would not be.
    """
    try:
        aoi = AOI.from_geojson(req.geometry)
    except Exception as exc:
        raise HTTPException(422, f"could not read geometry: {exc}") from exc
    if not aoi.gedi_covered:
        return {
            "available": False,
            "reason": "GEDI flies on the ISS and does not sample beyond "
                      "+/-51.6 degrees latitude",
        }

    parts = {"aoi": aoi.key(), "level": req.level, "as_of": date.today().isoformat()}

    def produce() -> dict[str, Any]:
        try:
            fit = biomass_mod.fit_biomass(aoi, date.today(), level=req.level)
        except Exception as exc:
            return {"available": False, "reason": f"{type(exc).__name__}: {exc}"}
        bm = biomass_mod.predict_map(fit)
        return {
            "available": True,
            "aoi": bm.summary(aoi.bbox),
            "region": bm.summary(),
            "fit": fit.as_dict(),
            "usable": fit.usable,
        }

    return cache.fetch("biomass-plot", parts, produce).value


#: uploads are read in full into memory, so cap them
MAX_UPLOAD_MB = 64


@app.post("/footprint")
async def footprint(file: UploadFile = File(...)) -> dict[str, Any]:
    """
    Read the area covered by an uploaded file, so it can be analysed.

    A georeferenced raster already knows where it is. Rather than asking
    someone to retype coordinates they already have in a GeoTIFF, this reads
    the CRS and bounds, reprojects the corners to WGS84 and hands back a
    polygon the other endpoints accept. A .geojson is simply parsed.

    A plain JPEG or PNG is refused, and the refusal is the point: an image
    with no CRS has no location, and guessing one would put a real answer on
    the wrong piece of ground. That is a worse failure than declining.
    """
    raw = await file.read()
    size_mb = len(raw) / 1e6
    if size_mb > MAX_UPLOAD_MB:
        raise HTTPException(413, f"{size_mb:.0f} MB exceeds the {MAX_UPLOAD_MB} MB limit")
    name = (file.filename or "upload").lower()

    # --- GeoJSON: take the geometry as given ------------------------------
    if name.endswith((".geojson", ".json")):
        import json as _json

        try:
            doc = _json.loads(raw.decode("utf-8"))
        except Exception as exc:
            raise HTTPException(422, f"not valid JSON: {exc}") from exc
        geom = doc.get("geometry") or doc
        if doc.get("type") == "FeatureCollection":
            feats = doc.get("features") or []
            if not feats:
                raise HTTPException(422, "FeatureCollection has no features")
            geom = feats[0].get("geometry")
        try:
            aoi = AOI.from_geojson(geom)
        except Exception as exc:
            raise HTTPException(422, f"could not read geometry: {exc}") from exc
        return {
            "kind": "geojson",
            "filename": file.filename,
            "geometry": geom,
            "bbox": [round(v, 6) for v in aoi.bbox],
            "centroid": [round(v, 6) for v in aoi.centroid],
            "area_km2": round(_area_km2(aoi.bbox), 2),
            "gedi_covered": aoi.gedi_covered,
        }

    # --- raster: read its own georeferencing ------------------------------
    import tempfile

    import rasterio
    from rasterio.warp import transform_bounds

    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(name)[1] or ".tif",
                                     delete=False) as fh:
        fh.write(raw)
        tmp = fh.name
    try:
        with rasterio.open(tmp) as ds:
            if ds.crs is None:
                raise HTTPException(
                    422,
                    "this image carries no coordinate system, so there is no way "
                    "to know what ground it covers. Upload a georeferenced "
                    "GeoTIFF, or give coordinates directly.",
                )
            w, s_, e, n = transform_bounds(ds.crs, "EPSG:4326", *ds.bounds, densify_pts=21)
            geom = {
                "type": "Polygon",
                "coordinates": [[[w, s_], [e, s_], [e, n], [w, n], [w, s_]]],
            }
            aoi = AOI.from_geojson(geom)
            res = ds.res
            return {
                "kind": "raster",
                "filename": file.filename,
                "geometry": geom,
                "bbox": [round(v, 6) for v in aoi.bbox],
                "centroid": [round(v, 6) for v in aoi.centroid],
                "area_km2": round(_area_km2(aoi.bbox), 2),
                "gedi_covered": aoi.gedi_covered,
                "raster": {
                    "crs": str(ds.crs),
                    "width": ds.width,
                    "height": ds.height,
                    "bands": ds.count,
                    "pixel_m": round(float(res[0]), 3) if ds.crs.is_projected else None,
                    "dtype": str(ds.dtypes[0]),
                },
                "note": (
                    "The extent is used to locate the analysis; the pixels "
                    "themselves are not modelled. Crown segmentation needs "
                    "sub-metre imagery and its own trained model."
                ),
            }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"could not open as a raster: {exc}") from exc
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def _area_km2(bbox: tuple[float, float, float, float]) -> float:
    import math

    w, s, e, n = bbox
    mid = math.radians((s + n) / 2)
    return abs(e - w) * 111.32 * math.cos(mid) * abs(n - s) * 110.574
