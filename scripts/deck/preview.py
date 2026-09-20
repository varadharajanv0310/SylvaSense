"""
Render an approximate preview of the deck.

PowerPoint is not available here and the template's backgrounds are vector,
so the real file cannot be rasterised. This pastes the same content onto the
background plates lifted from the team's own PDF export, which are visually
the same artwork. It shares deck_content with the builder, so the two cannot
drift; treat it as a proof, not as the deliverable.
"""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import fitz
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deck_content import BODY, DIAGRAM_AT, FOOTERS, LINKS, FT  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
DIAGRAMS = os.path.join(HERE, "diagrams")
# background plates are large and regenerable, so they stay out of the repo
PLATES = os.environ.get("ORION_PLATES", os.path.join(HERE, "plates"))
OUT = os.path.join(HERE, "preview")
PDF_OUT = os.path.join(REPO, "Order_of_One_ORION1.0_v2.pdf")
os.makedirs(OUT, exist_ok=True)

S = 2
_F = {}


def face(sz, bold):
    key = (round(sz, 1), bold)
    if key not in _F:
        # Inter is not installed here; Segoe UI is the closest neo-grotesque
        # with comparable widths, so line breaks stay representative
        path = r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf"
        _F[key] = ImageFont.truetype(path, max(6, int(round(sz * S))))
    return _F[key]


doc = fitz.open(os.environ.get(
    "ORION_SOURCE_PDF",
    os.path.join(os.path.expanduser("~"), "Downloads", "Order_of_One_ORION1.0.pdf")))
pages = []

for pno in range(1, 9):
    bare = os.path.join(PLATES, f"bare{pno}.png")
    plate = bare if (pno in DIAGRAM_AT and os.path.exists(bare)) else os.path.join(
        PLATES, f"plate{pno}.png")
    im = Image.open(plate).convert("RGB")

    for (name, x, y, w, h) in DIAGRAM_AT.get(pno, []):
        path = os.path.join(DIAGRAMS, f"{name}.png")
        if not os.path.exists(path):
            continue
        d_im = Image.open(path).convert("RGB").resize(
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

    # the section title comes from the template, so take it from the export
    for blk in doc[pno - 1].get_text("dict")["blocks"]:
        if blk.get("type") != 0:
            continue
        for line in blk["lines"]:
            for sp in line["spans"]:
                if sp["bbox"][1] > 150:
                    continue
                put(dict(x=sp["bbox"][0], y=sp["bbox"][1], size=sp["size"],
                         colour=f"{sp['color']:06x}",
                         bold="Bold" in sp["font"] or "Medium" in sp["font"],
                         text=sp["text"]))

    if pno == 1:
        for i, t in enumerate([
            "Problem Statement ID: ORION-PS-03",
            "Problem Statement Title: SylvaSense",
            "Team ID: [ FILL THIS IN ]",
            "Team Name: Order of One",
        ]):
            put(dict(x=256.8, y=435.1 + i * 67.5, size=48.5, colour="ffffff",
                     bold=False, text=t))

    for d in BODY.get(pno, []):
        put(d)
    if pno in FOOTERS:
        put(dict(x=76, y=763.7, size=18.0, colour=FT, bold=False,
                 text=FOOTERS[pno]))
    if pno > 1:
        put(dict(x=1369.5, y=763.7, size=18.0, colour=FT, bold=False,
                 text=f"{pno:02d}"))

    im.save(os.path.join(OUT, f"p{pno:02d}.png"), quality=92)
    pages.append(im)

pages[0].save(PDF_OUT, save_all=True, append_images=pages[1:], resolution=150)

# The preview is rasterised, so the references carry no text to hyperlink.
# Add link rectangles over where those lines were drawn, measured with the
# same font the render used so the hotspot matches what the reader sees.
out = fitz.open(PDF_OUT)
scale = out[0].rect.width / 1440.0
linked = 0
for pno in range(1, 9):
    page = out[pno - 1]
    # the footer is drawn from FOOTERS, not BODY, so it needs including here
    # or the demo link is the one reference on the page that does not work
    candidates = list(BODY.get(pno, []))
    if pno in FOOTERS:
        candidates.append(dict(x=76, y=763.7, size=18.0, bold=False,
                               text=FOOTERS[pno]))
    for d in candidates:
        url = LINKS.get(d["text"])
        if not url:
            continue
        f = face(d["size"], d["bold"])
        w = f.getlength(d["text"]) / S
        rect = fitz.Rect(d["x"] * scale, (d["y"] - 4) * scale,
                         (d["x"] + w) * scale, (d["y"] + d["size"] + 4) * scale)
        page.insert_link({"kind": fitz.LINK_URI, "from": rect, "uri": url})
        linked += 1
out.saveIncr()
print(f"preview -> {OUT}")
print(f"wrote {PDF_OUT}  ({linked} reference links clickable)")
