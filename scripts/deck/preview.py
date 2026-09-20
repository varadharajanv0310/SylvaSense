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
from deck_content import BODY, DIAGRAM_AT, FOOTERS, FT  # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
PLATES, DIAGRAMS = os.path.join(BASE, "plates"), os.path.join(BASE, "diagrams")
OUT = os.path.join(BASE, "preview3")
PDF_OUT = r"D:\Sathyabama ORION Build\Order_of_One_ORION1.0_v2.pdf"
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


doc = fitz.open(r"C:\Users\varad\Downloads\Order_of_One_ORION1.0.pdf")
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
        put(dict(x=256.8, y=714.0, size=34.0, colour="b6faff", bold=False,
                 text="Live demo:  [ PASTE YOUR URL ]"))

    for d in BODY.get(pno, []):
        put(d)
    if pno in FOOTERS:
        put(dict(x=76, y=763.7, size=18.0, colour=FT, bold=False,
                 text=FOOTERS[pno]))
    put(dict(x=1369.5, y=763.7, size=18.0, colour=FT, bold=False,
             text=f"{pno:02d}"))

    im.save(os.path.join(OUT, f"p{pno:02d}.png"), quality=92)
    pages.append(im)

pages[0].save(PDF_OUT, save_all=True, append_images=pages[1:], resolution=150)
print(f"preview -> {OUT}")
print(f"wrote {PDF_OUT}")
