"""
Rebuild the ORION deck with restructured body copy.

The first pass swapped text span-for-span, which inherited the template's
density: four to six lines a slide, each a bare noun phrase. This lays the
body out from scratch instead. Every block now runs label / claim / evidence,
so the slide says what it does *and* why that is worth anything, and still
fits on one breath.

Titles, footers and page numbers are kept from the original at their original
coordinates. Only the body is re-laid.
"""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import fitz
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt

SRC = r"C:\Users\varad\Downloads\Order_of_One_ORION1.0.pdf"
BASE = r"C:\Users\varad\AppData\Local\Temp\claude\D--Sathyabama-Orion-Claude\262dadaf-978b-40de-b73d-aad2bb1e74bb\scratchpad"
PLATES = os.path.join(BASE, "plates")
OUT = r"D:\Sathyabama ORION Build\Order_of_One_ORION1.0_v2.pptx"
PREVIEW = os.path.join(BASE, "preview2")
DIAGRAMS = os.path.join(BASE, "diagrams")

DECK_W, DECK_H = 1440.0, 810.0
SLIDE_W, SLIDE_H = 13.3333, 7.5
K = SLIDE_W / DECK_W
FS = (SLIDE_W * 72.0) / DECK_W
FONT = "Segoe UI"

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
DIAGRAM_AT = {
    2: (628, 212, 792, 446),
    3: (752, 246, 652, 367),
    4: (812, 292, 592, 333),
    6: (726, 196, 676, 451),
    5: (232, 198, 976, 549),
    7: (592, 214, 784, 523),
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

# ---------------------------------------------------------------- 1 -------
BODY[1] = [
    L(256.8, 570.1, 48.5, WH, False, "Team ID:  [ FILL THIS IN ]"),
    L(256.8, 712.0, 34.0, CY, False, "Live demo:  [ PASTE YOUR URL ]"),
]

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

# slide 8 keeps its reference list
SPAN_EDITS = {
    (5, "CCDC + SAR"): "Harmonic + Bayesian",
    (5, "Backtested trend"): "Persistence test",
    (8, "Primary references \u2022 Accessed 18 September 2026 \u2022 Proposed methods and synthetic 3D illustrations; no measured performance claimed"):
        "Primary references \u2022 Accessed 20 September 2026 \u2022 Synthetic 3D illustrations \u2022 First results measured on 6 sites",
}
FOOTERS = {
    2: "Four outputs from one request \u2022 Crown-scale aerial imagery + regional satellite monitoring \u2022 Live system, first results on 6 sites",
    3: "Mg/ha \u00d7 ha = Mg \u2022 CF starts at 0.47; refine by forest type [10] \u2022 Crown / biomass / change methods: [2\u20138]",
    4: "Measured on 6 sites, 2024\u20132026 \u2022 60 automated tests \u2022 Rond\u00f4nia, Brazil",
    6: "Prescribed stack, with task queues and COG tile serving added for practical inference [1,7,8]",
    7: "Stock change is not credited sequestration [10] \u2022 Field verification remains essential",
}


def emit(slide, d):
    mid = d["y"] + d["size"] * 0.62
    h = d["size"] * 2.0
    box = slide.shapes.add_textbox(
        Inches(d["x"] * K - 0.06), Inches((mid - h / 2) * K),
        Inches(min(DECK_W - d["x"], 1400) * K), Inches(h * K))
    tf = box.text_frame
    tf.word_wrap = False
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    r = p.add_run()
    r.text = d["text"]
    r.font.name = FONT
    r.font.size = Pt(round(d["size"] * FS, 1))
    r.font.bold = d["bold"]
    r.font.color.rgb = RGBColor.from_string(d["colour"].upper())


doc = fitz.open(SRC)
prs = Presentation()
prs.slide_width, prs.slide_height = Inches(SLIDE_W), Inches(SLIDE_H)
blank = prs.slide_layouts[6]
laid = kept = 0

for pno, page in enumerate(doc, 1):
    slide = prs.slides.add_slide(blank)
    bare = os.path.join(PLATES, f"bare{pno}.png")
    plate = bare if (pno in DIAGRAM_AT and os.path.exists(bare)) else os.path.join(
        PLATES, f"plate{pno}.png")
    slide.shapes.add_picture(plate, 0, 0, Inches(SLIDE_W), Inches(SLIDE_H))

    diag = os.path.join(DIAGRAMS, f"slide{pno}.png")
    if pno in DIAGRAM_AT and os.path.exists(diag):
        x, y, w, h = DIAGRAM_AT[pno]
        pic = slide.shapes.add_picture(
            diag, Inches(x * K), Inches(y * K), Inches(w * K), Inches(h * K))
        pic.line.color.rgb = RGBColor.from_string("B6FAFF")
        pic.line.width = Pt(0.75)
        pic.line.fill.solid()
        pic.line.fill.fore_color.rgb = RGBColor.from_string("B6FAFF")

    for blk in page.get_text("dict")["blocks"]:
        if blk.get("type") != 0:
            continue
        for line in blk["lines"]:
            for s in line["spans"]:
                t = s["text"]
                x0, y0, x1, y1 = s["bbox"]
                is_footer = y0 > 750
                is_page_no = x0 > 1300 and y0 > 750
                # keep the slide title, the footer strip and the page number;
                # every other original span is replaced by the new layout
                if pno in BODY and not (t in KEEP.get(pno, []) or is_footer):
                    continue
                if is_footer and not is_page_no and pno in FOOTERS:
                    t = FOOTERS[pno]
                t = SPAN_EDITS.get((pno, t), t)
                emit(slide, dict(x=x0, y=y0, size=s["size"],
                                 colour=f"{s['color']:06x}",
                                 bold="Bold" in s["font"] or "Medium" in s["font"],
                                 text=t))
                kept += 1

    for d in BODY.get(pno, []):
        emit(slide, d)
        laid += 1

prs.save(OUT)
print(f"kept {kept} original spans (titles/footers), laid out {laid} new body lines")
print("wrote", OUT)


# ------------------------------------------------------- visual check ------
# PowerPoint is not available here, so draw the same layout with the same
# font to see what the slide will actually look like.
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

os.makedirs(PREVIEW, exist_ok=True)
S = 2
_F = {}


def face(sz, bold):
    key = (round(sz, 1), bold)
    if key not in _F:
        path = r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf"
        _F[key] = ImageFont.truetype(path, max(6, int(round(sz * S))))
    return _F[key]


pages = []
for pno, page in enumerate(doc, 1):
    bare = os.path.join(PLATES, f"bare{pno}.png")
    use = bare if (pno in DIAGRAM_AT and os.path.exists(bare)) else os.path.join(
        PLATES, f"plate{pno}.png")
    im = Image.open(use).convert("RGB")
    diag = os.path.join(DIAGRAMS, f"slide{pno}.png")
    if pno in DIAGRAM_AT and os.path.exists(diag):
        x, y, w, h = DIAGRAM_AT[pno]
        d_im = Image.open(diag).convert("RGB").resize(
            (int(w * S), int(h * S)), Image.LANCZOS)
        im.paste(d_im, (int(x * S), int(y * S)))
        ImageDraw.Draw(im).rectangle(
            [int(x * S), int(y * S), int((x + w) * S), int((y + h) * S)],
            outline="#b6faff", width=2)
    dr = ImageDraw.Draw(im)

    def put(d):
        f = face(d["size"], d["bold"])
        dr.text((d["x"] * S, (d["y"] + d["size"] * 0.62) * S),
                d["text"], font=f, fill=f"#{d['colour']}", anchor="lm")

    for blk in page.get_text("dict")["blocks"]:
        if blk.get("type") != 0:
            continue
        for line in blk["lines"]:
            for s in line["spans"]:
                t = s["text"]
                x0, y0, x1, y1 = s["bbox"]
                is_footer = y0 > 750
                is_page_no = x0 > 1300 and y0 > 750
                if pno in BODY and not (t in KEEP.get(pno, []) or is_footer):
                    continue
                if is_footer and not is_page_no and pno in FOOTERS:
                    t = FOOTERS[pno]
                t = SPAN_EDITS.get((pno, t), t)
                put(dict(x=x0, y=y0, size=s["size"], colour=f"{s['color']:06x}",
                         bold="Bold" in s["font"] or "Medium" in s["font"], text=t))

    for d in BODY.get(pno, []):
        put(d)

    # flag anything that runs into the hero render
    for d in BODY.get(pno, []):
        w = dr.textlength(d["text"], font=face(d["size"], d["bold"])) / S
        if d["x"] + w > HERO_X[pno]:
            print(f"  !! p{pno} overruns hero by {d['x']+w-HERO_X[pno]:.0f}pt: {d['text'][:44]}")

    im.save(os.path.join(PREVIEW, f"p{pno}.png"), quality=92)
    pages.append(im)

pdf = r"D:\Sathyabama ORION Build\Order_of_One_ORION1.0_v2.pdf"
pages[0].save(pdf, save_all=True, append_images=pages[1:], resolution=150)
print("preview ->", PREVIEW)
print("wrote", pdf)
