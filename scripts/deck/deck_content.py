"""Deck copy and diagram placement, shared by the builder."""

CY = "b6faff"      # cyan accent, from the template
WH = "ffffff"
FT = "f9f3fc"      # footer grey-lilac
AM = "ffc65c"      # amber, for the one number that matters

# the hero render on each slide; body text must stay clear of it
HERO_X = {1: 1440, 2: 610, 3: 750, 4: 800, 5: 1440, 6: 715, 7: 575, 8: 1440}

# The generated diagrams replace the stock 3D renders. They are near-black on
# a magenta deck, so each is inset with a hairline rather than bled to the
# edge - framed it reads as a screen, unframed it reads as a hole punched in
# the gradient. (x, y, w, h) in deck points, aspect preserved by construction.
# Three slides carry two insets stacked rather than one large: the extra
# diagrams had to go somewhere, and shrinking two to share a well beats
# adding slides the eight-section template has no room for.
DIAGRAM_AT = {
    2: [("slide2", 794, 195, 460, 258), ("provenance", 794, 468, 460, 258)],
    3: [("slide3", 752, 246, 652, 367)],
    4: [("slide4", 881, 190, 470, 264), ("coverage", 881, 470, 470, 264)],
    5: [("slide5", 232, 198, 976, 549)],
    6: [("stack6", 838, 195, 470, 264), ("convergence", 838, 474, 470, 264)],
    7: [("slide7", 592, 214, 784, 523)],
}


# spans kept from the original, by page: titles, footers, page numbers
KEEP = {
    1: ["ORION 1.0", "Problem Statement ID: ORION-PS-03",
        "Problem Statement Title: SylvaSense", "Team Name: Order of One"],
    2: ["Proposed Solution"], 3: ["Technical Approach"],
    4: ["Feasibility & Viability"], 5: ["Architecture Diagram"],
    6: ["Tech stack"], 7: ["Impact & Benefits"], 8: ["Research & References"],
}


def L(x, y, size, colour, bold, text):
    return dict(x=x, y=y, size=size, colour=colour, bold=bold, text=text)


def block(x, y, eyebrow, claim, evidence, *, claim_size=29, ev_size=23,
          ev2=None, gap=38, gap2=42):
    """label / claim / evidence — the unit every body block uses."""
    out = [L(x, y, 23.1, CY, True, eyebrow),
           L(x, y + gap, claim_size, WH, True, claim)]
    if evidence:
        out.append(L(x, y + gap + gap2, ev_size, WH, False, evidence))
    if ev2:
        out.append(L(x, y + gap + gap2 + ev_size * 1.32, ev_size, WH, False, ev2))
    return out


BODY = {}

# ---------------------------------------------------------------- 2 -------
BODY[2] = [
    L(78, 198, 23.1, CY, True, "SYLVASENSE"),
    L(78, 238, 61.1, WH, True, "From canopy"),
    L(78, 311, 61.1, WH, True, "to carbon."),
    L(78, 404, 26.0, WH, False, "One polygon in. Four kinds of evidence out."),
    L(78, 441, 28.0, CY, True, "Every number carries its uncertainty."),
]
_outputs = [
    ("01", "Crown GeoJSON", "Per-tree polygons, each with a confidence score"),
    ("02", "Spectral-toggle map", "Optical, radar and structure in one frame"),
    ("03", "Biomass + validation report", "Mg/ha with an interval that is checked"),
    ("04", "Live polygon inference", "Draw an area; evidence returns with its sources"),
]
for i, (n, head, sub) in enumerate(_outputs):
    y = 502 + i * 61
    BODY[2] += [L(80, y, 24.9, CY, True, n),
                L(144, y - 2, 26.0, WH, True, head),
                L(144, y + 28, 19.0, FT, False, sub)]

# ---------------------------------------------------------------- 3 -------
BODY[3] = [L(78, 166, 36.0, WH, True, "Three scales. One pipeline.")]
for i, (eye, claim, e1, e2) in enumerate([
    ("CROWNS  /  FINE AERIAL IMAGERY", "Mask2Former + Swin-S",
     "0.1 m NEON RGB, tiled and merged",
     "Every mask checked against the canopy height model"),
    ("BIOMASS  /  OPTICAL + SAR + LIDAR", "Gradient boosting + split conformal",
     "GEDI footprints are the calibration target",
     "Coverage measured on held-out ground, not assumed"),
    ("CHANGE  /  MULTI-YEAR OBSERVATIONS", "Harmonic baseline + Bayesian confirmation",
     "A drop must persist before it is called a detection",
     "Below its power threshold the detector reports nothing"),
]):
    BODY[3] += block(78, 242 + i * 150, eye, claim, e1, ev2=e2,
                     claim_size=31, ev_size=22, gap=36, gap2=40)
BODY[3] += [L(80, 698, 28.0, WH, True,
              "AGB = \u03a3 density \u00d7 area     |     Aboveground carbon = AGB \u00d7 CF")]

# ---------------------------------------------------------------- 4 -------
BODY[4] = [L(78, 176, 42.0, WH, True, "Three gates. Already passing.")]
for i, (eye, claim, e1) in enumerate([
    ("01   VERIFIED THE DATA", "6 sites audited on 3 independent layers",
     "2 of 5 candidates failed the audit and were rejected"),
    ("02   EARNED THE MODEL CHOICE", "Spatially-blocked folds, never a random split",
     "Neighbouring footprints are one observation, not two"),
    ("03   MEASURED THE TRADE-OFFS", "False positives on primary forest: 0.01\u20130.02%",
     "Coverage holds on unseen blocks \u2014 and one site fails, visibly"),
]):
    BODY[4] += block(78, 258 + i * 132, eye, claim, e1,
                     claim_size=28, ev_size=21, gap=34, gap2=38)
BODY[4] += [
    L(78, 636, 34.0, AM, True, "41.6%  →  0.01%"),
    L(78, 690, 21.0, WH, False,
      "A 365-day window was confirming a national park as cleared."),
    L(78, 716, 21.0, WH, False,
      "Persistence is a question about time. The gate is now a span."),
]

# ---------------------------------------------------------------- 6 -------
BODY[6] = []
for i, (eye, val) in enumerate([
    ("DATA", "Earth Engine \u00b7 Planetary Computer \u00b7 GEDI"),
    ("PREPARE", "Rasterio \u00b7 GDAL \u00b7 GeoPandas \u00b7 odc-stac"),
    ("MODEL", "PyTorch \u00b7 Mask2Former \u00b7 split conformal"),
    ("SERVE", "FastAPI \u00b7 Redis / Celery \u00b7 Docker"),
    ("EXPLORE", "TiTiler \u00b7 Mapbox GL JS \u00b7 deck.gl"),
]):
    y = 188 + i * 96
    BODY[6] += [L(80, y, 23.1, CY, True, eye),
                L(80, y + 36, 31.0, WH, True, val)]
BODY[6] += [
    L(80, 668, 23.0, WH, True,
      "Windowed COG reads. Cached reports."),
    L(80, 700, 20.0, CY, False, "Cold report 151–222 s · cached 3–23 ms"),
    L(80, 726, 20.0, CY, False, "7 sources, each free to fail alone"),
]

# ---------------------------------------------------------------- 7 -------
BODY[7] = [
    L(78, 200, 46.0, WH, True, "Evidence for"),
    L(78, 256, 46.0, WH, True, "every forest decision."),
]
for i, (eye, claim, ev) in enumerate([
    ("FOREST TEAMS", "Prioritise persistent loss alerts",
     "Confirmed and provisional kept apart"),
    ("RESTORATION TEAMS", "Track canopy and biomass trends",
     "Against a measured 2020 baseline"),
    ("CARBON ANALYSTS", "Trace stock change with its interval",
     "Bias-adjusted area, not pixel counts"),
    ("COMPLIANCE TEAMS", "Evidence for EUDR, due Dec 2026",
     "ESA WorldCover 2020 is the cut-off layer"),
]):
    BODY[7] += block(78, 344 + i * 104, eye, claim, ev,
                     claim_size=26, ev_size=20, gap=32, gap2=33)

# Slide 5's diagram carries the whole four-column grid, so the slide keeps
# only its title, its headline and its footer - the twelve boxes are in the
# image, and duplicating them as text would double every label.
BODY[5] = [L(78, 150, 36.0, WH, True, "One polygon. Three coordinated paths.")]

# ---------------------------------------------------------- inserts ----
# The deck is the template's eight slides. ORDER exists only so the page
# numbers stay derived from position rather than hard-coded.
ORDER = [1, 2, 3, 4, 5, 6, 7, 8]

# slide 8 keeps its reference list
SPAN_EDITS = {
    (5, "CCDC + SAR"): "Harmonic + Bayesian",
    (5, "Backtested trend"): "Persistence test",
    (8, "Primary references \u2022 Accessed 18 September 2026 \u2022 Proposed methods and synthetic 3D illustrations; no measured performance claimed"):
        "Primary references \u2022 Accessed 20 September 2026 \u2022 Synthetic 3D illustrations \u2022 First results measured on 6 sites",
}
REF = "a6f7ff"      # the pale cyan the reference sub-lines use

# The blank template carries no reference list and no footers; both were in
# the team's own export, so both are re-added here rather than lost.
BODY[8] = []
for _col, _entries in (
    (78, [
        ("01", "Official scope + submission rules",
         [("ORION PS-03 · Microsoft Club SIST", 0)]),
        ("02", "Satellite observations",
         [("Sentinel-1 processing", 0), ("Sentinel-2 resolution", 277)]),
        ("03", "Biomass reference targets",
         [("NASA GEDI L4A · footprints + quality", 0)]),
        ("04", "Crown-scale data",
         [("NEON 0.1 m RGB", 0), ("NEON 1 m CHM", 229)]),
        ("05", "Mask2Former + crown evidence",
         [("Cheng et al., 2022", 0), ("Nakada et al., 2026 preprint", 231)]),
    ]),
    (770, [
        ("06", "Crown segmentation benchmark",
         [("Detectree2 · Ball et al., 2023", 0)]),
        ("07", "Quantile biomass regression",
         [("XGBoost · official quantile objective", 0)]),
        ("08", "Time series + raster serving",
         [("Earth Engine CCDC", 0), ("TiTiler", 263)]),
        ("09", "Biome labels",
         [("RESOLVE ecoregions · Dinerstein et al., 2017", 0)]),
        ("10", "Biomass-to-carbon formulation",
         [("IPCC 2006 · Forest Land · Table 4.3", 0)]),
    ]),
):
    for _i, (_n, _head, _subs) in enumerate(_entries):
        _y = 204 + _i * 103
        BODY[8] += [L(_col, _y, 26.0, CY, True, _n),
                    L(_col + 64, _y, 29.0, WH, True, _head)]
        for _txt, _dx in _subs:
            BODY[8].append(L(_col + 64 + _dx, _y + 43, 21.1, REF, False, _txt))

FOOTERS = {
    2: "Four outputs from one request • Live system, first results on 6 sites • Live demo: [ PASTE YOUR URL ]",
    3: "Mg/ha \u00d7 ha = Mg \u2022 CF starts at 0.47; refine by forest type [10] \u2022 Crown / biomass / change methods: [2\u20138]",
    4: "Measured on 6 sites, 2024\u20132026 \u2022 60 automated tests \u2022 Rond\u00f4nia, Brazil",
    6: "Prescribed stack, with task queues and COG tile serving added for practical inference [1,7,8]",
    7: "Stock change is not credited sequestration [10] \u2022 Field verification remains essential",
    5: "Planned architecture • Separate crown and regional scales • "
       "Biome labels: RESOLVE [9] • Every output retains date and model version",
    8: "Primary references • Accessed 20 September 2026 • Synthetic 3D "
       "illustrations • First results measured on 6 sites",
}


