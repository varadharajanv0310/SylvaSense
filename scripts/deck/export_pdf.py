"""
Export the built deck to PDF with PowerPoint itself.

The previous preview.py did not do this. It pasted text onto background
plates lifted from an old PDF export and rasterised the result - which meant
the PDF could disagree with the PPTX and nobody would know. It did: slide 1
carried a hardcoded "Team ID: [ FILL THIS IN ]" long after the real file
stopped saying that, and the plates had lost the SIST badge entirely.

So the preview is gone. This drives the real PowerPoint through COM, which
renders the real file: the organisers' vector gradients, the badge, the
template's own type, and live hyperlink annotations. The PDF can no longer
say anything the PPTX does not.
"""
import os
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import win32com.client
from win32com.client import constants  # noqa: F401

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(REPO, "Order_of_One_ORION1.0_v2.pptx")
OUT = os.path.join(REPO, "Order_of_One_ORION1.0_v2.pdf")

MSO_TRUE, MSO_FALSE = -1, 0
PDF, SCREEN, SLIDES, PRINT_ALL, VERTICAL = 2, 2, 1, 1, 1

if not os.path.exists(SRC):
    sys.exit(f"build the deck first: {SRC} is missing")
if os.path.exists(OUT):
    os.remove(OUT)                     # SaveAs will not overwrite silently

app = win32com.client.Dispatch("PowerPoint.Application")
pres = None
try:
    # WithWindow=False is refused by some builds; the window is transient
    # either way and PowerPoint quits at the end of this block.
    pres = app.Presentations.Open(SRC, ReadOnly=MSO_TRUE,
                                  Untitled=MSO_FALSE, WithWindow=MSO_TRUE)
    # ExportAsFixedFormat, not SaveAs(ppSaveAsPDF): SaveAs drops every
    # hyperlink, so the references and the demo link come out as plain text.
    # DocStructureTags is what carries them across as link annotations.
    pres.ExportAsFixedFormat(
        OUT, PDF, SCREEN,
        MSO_FALSE,          # FrameSlides
        VERTICAL, SLIDES,
        MSO_FALSE,          # PrintHiddenSlides
        None, PRINT_ALL, "",
        MSO_TRUE,           # IncludeDocProperties
        MSO_TRUE,           # KeepIRMSettings
        MSO_TRUE,           # DocStructureTags  <- the hyperlinks
        MSO_TRUE,           # BitmapMissingFonts
        MSO_FALSE)          # UseISO19005_1
finally:
    if pres is not None:
        pres.Close()
    app.Quit()

for _ in range(40):                    # the write lands a moment after Quit
    if os.path.exists(OUT) and os.path.getsize(OUT) > 0:
        break
    time.sleep(0.25)

print(f"wrote {OUT}  ({os.path.getsize(OUT)/1e6:.2f} MB)")
