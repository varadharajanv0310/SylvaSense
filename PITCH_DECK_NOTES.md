# ORION 1.0 — deck review and image prompts

Reviewed 20 September 2026. Deck: `Order_of_One_ORION1.0.pdf`, 8 slides.

**The deck presents SylvaSense — the whole system. That framing is correct and
stays.** Crown segmentation, biome mapping, the full pipeline: all of it is the
pitch. Nothing below cuts scope.

What changes is that the ambitious claims can now stand on early results. The
biomass and change paths are running against live satellite data, and the
numbers they return are evidence that the method works — which is exactly what
makes the rest of the vision credible. A judge who sees a working core believes
the roadmap. That is the only thing the deck is currently missing.

Everything else here is a factual fix: a blank field, a citation that may not
resolve, a method that should be named more precisely because the stronger name
is also the true one.

---

## Part 1 — What to add: evidence behind the ambition

Every footer currently reads *"Concept illustration"* and slide 8 closes with
*"no measured performance claimed."* Both were right when written. They now
undersell the work, and slide 4 is where that costs the most.

The strongest thing the project has is a story of measured self-correction:

> **The detector was wrong, and measurement caught it.**
> At a 365-day window it confirmed **41.6%** of a national park as cleared.
> The cause was not the algorithm but the *window*: persistence is a question
> about time, not scene count. 29 observations over 182 days confirmed 42.8%;
> 26 over 272 days confirmed 3.0%. The gate is now a time span, and the
> detector refuses to confirm below it. False positives on verified primary
> forest are now **0.01–0.02%**.

That paragraph does more for credibility than any architecture diagram. It says
the team measures its own work, finds its own defects, and fixes them — which
is the thing that actually predicts whether the rest gets built.

---

## Part 2 — Slide-by-slide

### Slide 1 — Title

| | |
|---|---|
| **Bug** | `Team ID:` is blank. |
| **Fix** | Fill it before submitting. |

Add one line beneath the title. A live link on slide 1 changes how every
slide after it is read:

> `Live demo: <your URL>  ·  7 satellite sources  ·  6 sites, Rondônia, Brazil`

---

### Slide 2 — Proposed Solution

**Keep all four outputs.** Crown GeoJSON, spectral-toggle map, biomass +
validation report, live polygon inference — that is the product, and the
product is what you pitch.

**Headline copy.** "Count visible crowns. Map biomes. Estimate biomass. Track
change." is a clean four-beat list of capabilities. Keep it, and add a second
line that names the differentiator:

> Count visible crowns. Map biomes.
> Estimate biomass. Track change.
> **Every number carries its uncertainty.**

That last line is the thing nobody else in the room will say, and it is
already true of the running system.

**Footer.** `• Concept illustration` → `• Live system, first results on 6 sites`

---

### Slide 3 — Technical Approach

All three rows stay. Two precision fixes, both of which make the claim stronger.

**Row 2 — name the better method.**

| Current | Change to | Why |
|---|---|---|
| `XGBoost + calibrated intervals` | `Gradient boosting + split conformal` | "Calibrated intervals" is vague. Split conformal gives *finite-sample coverage under exchangeability, for any model* — a guarantee XGBoost's quantile objective does not provide. It is both the more impressive claim and the one the system implements. |

Keep `GEDI footprint targets · independent field validation` — field validation
is part of the plan and belongs in the pitch.

**Row 3 — name the mechanism.**

| Current | Change to | Why |
|---|---|---|
| `CCDC breaks + SAR confirmation` | `Harmonic baseline + Bayesian confirmation` | CCDC is one specific implementation; the harmonic-baseline family is the method. The Bayesian confirmation step is what the detector actually does, and it is more distinctive. |

**Consider adding a fourth micro-line** under row 3, because it is unusual
enough to be memorable:

> `Confirmed vs provisional — the detector declines when underpowered`

**Formula line.** `AGB = Σ density × area | Aboveground carbon = AGB × CF` is
correct and matches IPCC 2006 Table 4.3. Keep as is.

---

### Slide 4 — Feasibility & Viability

This is the slide that changes most, and it becomes the best one in the deck.

The three gates are the right structure. The difference is that two of them
have already started returning numbers, so they stop being a promise and start
being a demonstration.

**Headline:** `One pilot. Three proof gates.` → **`Three gates. Already passing.`**

**Gate 01**

> **01 VERIFY THE DATA**
> 6 sites audited across 3 independent layers.
> 2 of 5 candidates failed the audit and were rejected.

Sites carry a hypothesis, not a label. Two were rejected *by measurement*. That
is a process a judge can trust.

**Gate 02**

> **02 EARN THE MODEL CHOICE**
> Spatially-blocked folds, never a random split.
> Neighbouring footprints are the same observation.

**Gate 03**

> **03 MEASURE THE TRADE-OFFS**
> False positives on verified primary forest: **0.01–0.02%**.
> Interval coverage holds on unseen blocks — and one site fails, visibly.

**Add the callout box** from Part 1 — the 41.6% story. It is the single highest-
value block of text available to this deck.

**Footer.** `Illustration; no results claimed` →
`First results, 6 sites, 2024–2026 · 60 automated tests`

---

### Slide 5 — Architecture Diagram

The architecture is the design, and the design is the pitch. Keep every box —
TiTiler, the job queue, the loss heatmap all stay.

**One addition worth making**, because it is the architectural idea that
distinguishes this from a model with an API in front of it:

> **PROVENANCE ENVELOPE**
> Every value carries its sensor, window, method, version and interval.
> Sources degrade independently; a missing one is stated, never hidden.

**One number worth adding** beneath the diagram — concrete performance figures
are rare in pitch decks and land well:

> Cold report 151–222 s · cached 3–23 ms · 7 sources, each allowed to fail alone

---

### Slide 6 — Tech stack

The stack is a design decision and it stays as specified. One row is worth
revising because the alternative is genuinely better and already proven:

| Row | Current | Consider |
|---|---|---|
| MODEL | `PyTorch · Mask2Former · XGBoost` | `PyTorch · Mask2Former · split conformal` |

Conformal is model-agnostic — it wraps whatever regressor you choose, so this
loses nothing and gains the coverage guarantee.

**Optional addition to DATA.** `Earth Engine · NEON · GEDI` → adding
`Planetary Computer` shows a second, independent archive path. Judges read
redundancy in data sourcing as de-risking rather than indecision.

**Strapline.** `Tiled GPU jobs. Cached results. Band-level map requests.` — keep.
Consider adding `No GPU required for the regional path.` Not needing a GPU for
the layer that runs continuously is a feasibility argument, not an apology.

---

### Slide 7 — Impact & Benefits

Closest to correct already. One addition.

**Add a fourth audience.** It is the one with a statutory deadline, which makes
the project timely rather than merely worthy:

> **COMPLIANCE TEAMS**
> EUDR enforcement 30 Dec 2026; cut-off 31 Dec 2020.
> ESA WorldCover 2020 is the baseline layer.

**Keep** `Stock change is not credited sequestration` and `Field verification
remains essential`. Both are honest, both stay true, and both signal that the
team knows where the limits are — which reads as competence, not hedging.

---

### Slide 8 — References

Four changes.

1. **`Accessed 18 September 2026`** → your submission date.
2. **`no measured performance claimed`** → `First results measured on 6 sites`.
3. **`Nakada et al., 2026 preprint`** — I could not verify this resolves.
   Check it, or drop it. An unverifiable citation on the references slide is a
   cheap way to lose credibility with a technical judge.
4. **Add three references** for methods the deck already describes:

   - **Olofsson et al. (2014)**, *Good practices for estimating area and
     assessing accuracy of land change*, RSE 148:42–57 — bias-adjusted area.
     Map-counted area is biased; this is the correction.
   - **Reiche et al. (2021)**, RADD — the Bayesian confirmation scheme.
   - **Lei, G'Sell, Rinaldo, Tibshirani & Wasserman (2018)**, *Distribution-free
     predictive inference for regression*, JASA — split conformal.

**Renumber** to keep the grid balanced: 10 entries becomes 13, which sets as a
clean 6+7 or three columns.

---

## Part 3 — Image prompts

### House style — prepend to every prompt

```
Dark editorial 3D render. Background near-black desaturated green #111510.
Primary accent sage green #b9d698, secondary muted olive #7d9a66, warning
amber #d8b169 used sparingly. Matte surfaces, no gloss, no chrome, no lens
flare. Single soft key light from upper left, long soft shadows, subtle
volumetric haze. Shallow depth of field. Muted, scientific, restrained —
closer to a museum exhibit or an instrument panel than to sci-fi.
Generous negative space for text overlay. No text, no labels, no watermarks,
no UI chrome in the image. 16:9, cinematic, high detail.
```

### Negative prompt — append to every prompt

```
text, letters, words, numbers, watermark, signature, logo, UI elements,
buttons, glossy plastic, chrome, neon glow, lens flare, HDR, oversaturated,
rainbow colours, blue tech grid, holographic, cyberpunk, stock-photo
businesspeople, cliché globe, cartoon, low detail, blurry
```

---

### Slide 1 — Title

> A single emergent rainforest tree seen from high above at a steep angle, its
> crown catching a narrow band of dawn light while the canopy around it stays
> in deep shadow. Mist pooling between the crowns below. The tree sits in the
> lower right third, leaving the upper left two thirds as open dark canopy and
> haze for a title block. Photographic realism at aerial survey altitude,
> strong atmospheric perspective. Colour held almost entirely to deep
> green-black with one warm sage highlight on the lit crown.

*Alternate, more abstract:* a topographic contour field of a forested ridge
drawn as thin sage lines on near-black, contour spacing tightening over a
ravine, one contour band lit brighter than the rest.

---

### Slide 2 — Proposed Solution

This slide promises crowns, biomes, biomass and change. The image should show
the *resolution ladder* those four outputs live on.

> A vertical slice through a rainforest canopy rendered as a cross-section
> diorama, cut cleanly like a geological core sample, floating against
> near-black. The top layer is dense photographic canopy in which perhaps
> fifteen individual tree crowns are clearly separable, each a distinct rounded
> mass with visible gaps between them. Below it the same volume resolves into a
> sparse point cloud of pale sage dots showing vertical structure. Below that a
> thin cross-hatched soil layer. The three layers separated by narrow dark gaps
> so each reads distinctly. Isometric view, slightly above eye level. Matte,
> scientific-model feel, like a museum cutaway. Left half of the frame empty
> dark space for text.

The separable crowns in the top layer are the point — they carry the "count
visible crowns" claim visually without needing a label.

---

### Slide 3 — Technical Approach

Three rows, three sensing modalities. Show them registered to one another.

> Three translucent rectangular plates floating in dark space, stacked with
> parallax and slight rotation, each showing the same patch of forest rendered
> differently: the top plate as a high-resolution true-colour aerial photograph
> in which individual tree crowns are clearly distinguishable; the middle as a
> grainy monochrome radar backscatter texture with visible speckle; the bottom
> as a sparse scatter of glowing sage points on black, arranged in the vertical
> profile of a canopy. Thin light beams connect the same coordinate on all
> three plates, showing registration. Isometric, low camera. Plates matte and
> slightly frosted, not glassy. The same patch of forest recognisably identical
> across all three despite the different rendering.

The registration beams carry the whole idea: the same ground, seen three
uncorrelated ways, agreeing.

---

### Slide 3 alternate — crown segmentation, if you want a second visual

> An overhead aerial view of dense tropical canopy at very high resolution,
> where roughly forty individual tree crowns are each traced by a thin,
> precise sage-green outline following the true irregular boundary of the
> foliage — not circles, but organic lobed shapes that interlock and
> occasionally overlap. The underlying photograph remains fully visible through
> the outlines. A small cluster of crowns in the lower left is left untraced,
> suggesting work in progress across the tile. Flat orthographic top-down view,
> even diffuse light, no shadows. Precise, cartographic, restrained.

---

### Slide 4 — Feasibility & Viability

Slide 4 now carries measured results, so the image should suggest *testing*
rather than *building*.

> Three vertical glass gates in a row receding into dark fog, like sluice gates
> or laboratory airlocks. The first two stand open with soft sage light passing
> cleanly through; the third is partly closed, its edge catching a thin amber
> line. A narrow path of light runs through all three and continues into the
> dark beyond. Low camera, strong perspective, heavy atmospheric haze.
> Architectural and restrained, no ornament.

**Also worth doing:** put a small real screenshot from the live record page in
a corner of this slide, cropped tight on the site that fails its calibration
check in amber. An illustration says you thought about testing; a screenshot of
your own system flagging its own failure proves it. The two together are
stronger than either alone.

---

### Slide 5 — Architecture Diagram

**Do not generate a picture of the diagram.** Build it as vector shapes in the
slide tool so the boxes stay crisp and the text stays editable — a generated
image of a flowchart produces unreadable pseudo-text every time.

For a *background* behind vector boxes:

> Extremely subtle dark texture: a faint orthogonal grid of thin sage lines on
> near-black, fading to pure black at all four edges, with soft noise and a
> barely visible topographic contour pattern beneath the grid. Almost entirely
> empty, very low contrast, suitable as a background behind white diagram
> boxes and connector lines.

---

### Slide 6 — Tech stack

> A neat exploded-view arrangement of five thin matte plates suspended one
> above another in dark space, evenly spaced, seen from a low three-quarter
> angle. Each plate carries a different subtle surface: one a satellite-image
> texture, one a wireframe mesh, one a neural-network node graph rendered as
> faint connected dots, one a smooth machined instrument panel, one a faint map
> contour. Thin sage connector lines run vertically through all five where they
> align. Technical, calm, precisely arranged, like an exploded diagram of a
> scientific instrument. Strong negative space to the right for the stack list.

---

### Slide 7 — Impact & Benefits

> An aerial view at dusk of the boundary between intact rainforest and cleared
> land — the fishbone pattern of a deforestation frontier, straight access
> roads with perpendicular side branches cut into dense canopy. High altitude,
> slightly oblique. The intact forest side deep green-black and richly
> textured; the cleared side flat, pale and bare. The boundary runs diagonally
> through the frame. Low warm light raking from the left, long shadows off the
> canopy edge emphasising its height against the flat cleared ground.
> Documentary and unsentimental. No people, no machinery, no smoke.

This is Machadinho d'Oeste, the actual site in the demo. Grounding the impact
slide in the real place the system measures is worth more than an abstraction.

---

### Slide 8 — References

> A near-empty composition: a single shaft of pale light falling through deep
> forest canopy onto the forest floor, dust and moisture visible in the beam,
> everything else in deep shadow. Vertical emphasis. Quiet and still, almost
> monochrome green-black, with one warm highlight where the light lands. The
> lower two thirds of the frame dark and uncluttered for a dense reference list.

---

## Part 4 — Pre-submission checklist

- [ ] Team ID filled on slide 1
- [ ] Demo URL on slide 1, and the link resolves from a machine that is not yours
- [ ] Slide 4 rewritten with the three gate results and the 41.6% callout
- [ ] `no measured performance claimed` replaced on slide 8
- [ ] `XGBoost` → `split conformal` on slides 3 and 6
- [ ] `CCDC breaks` → `Harmonic baseline` on slide 3
- [ ] Nakada et al. 2026 verified or dropped
- [ ] Olofsson, RADD and conformal references added
- [ ] Access date updated
- [ ] Every number on slide 4 matches what the demo shows when clicked

### Numbers as of 20 September 2026

| site | AGBD Mg/ha | 90% interval | coverage | gate | confirmed loss |
|---|---|---|---|---|---|
| Machadinho d'Oeste (clearcut) | 79.3 | 71.7–87.0 | 0.898 | pass | 1.64% |
| Pacaás Novos (intact) | 182.5 | 169.3–195.7 | 0.939 | pass | 0.02% |
| Interior Amazonas (intact-deep) | 238.4 | 228.8–247.9 | 0.958 | pass | 0.03% |
| Upper Ji-Paraná (cloudy) | 91.3 | 86.0–96.7 | **0.738** | **fail** | 0.40% |
| BR-364 corridor (degradation) | 125.4 | 117.9–132.9 | 0.903 | pass | 0.43% |
| Candeias do Jamari (burn) | 217.6 | 202.0–233.3 | 0.923 | pass | 0.21% |

These drift as the analysis window rolls forward. Re-check against the live API
the morning you submit.
