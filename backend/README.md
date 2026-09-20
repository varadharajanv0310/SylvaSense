# SylvaSense backend

Forest intelligence from Earth observation. Convergence of evidence across
independent sensors, with provenance and uncertainty on every number.

```bash
cd backend
python -m venv .venv --system-site-packages
.venv/Scripts/python -m pip install -r requirements.txt

PYTHONPATH=. .venv/Scripts/python -m pytest tests/ -q          # 40 tests, no network
PYTHONPATH=. .venv/Scripts/python -m uvicorn sylvasense.api:app --port 8099
PYTHONPATH=. .venv/Scripts/python scripts/run_fixture.py       # live, all fixtures
```

`SYLVA_OFFLINE=1` replays from cache and never touches the network. Every test
passes in that mode by design — an estimator that can only be tested online is
an estimator that will be tested rarely.

## Design in one paragraph

Accuracy here is a property of the architecture, not of a model. Several
independent sources run without seeing each other, a fusion layer reports where
they agree and where they do not, and a missing source widens the answer rather
than breaking it. The sources are deliberately uncorrelated in sensor,
algorithm and producer: Sentinel-1 is C-band, ALOS is L-band, WorldCover and
Impact Observatory are different teams classifying different inputs. Three
layers that all derived from Sentinel-2 agreeing would tell us almost nothing.

## Layout

| module | what it is |
| --- | --- |
| `provenance.py` | `Observation`, `Uncertainty`, `SourceStatus`. Nothing may return a bare float. |
| `aoi.py` | AOIs and the five golden fixtures, with hypothesis and verification state |
| `sources/base.py` | the source contract: a broken source returns a status, never raises |
| `sources/stac.py` | STAC search and windowed COG reads; caches *unsigned* metadata |
| `sources/imagery.py` | Sentinel-1 RTC and Sentinel-2 L2A |
| `sources/layers.py` | WorldCover, ALOS FNF, io-lulc, NASADEM |
| `sources/gedi.py` | GEDI L4A v3 footprint biomass (needs Earthdata token) |
| `detect/seasonal.py` | per-pixel harmonic models, so seasons are not deforestation |
| `preprocess/cloud.py` | SCL baseline and OmniCloudMask behind one protocol |
| `forest.py` | FAO / EUDR / national / monitoring definitions as a parameter |
| `evidence.py` | the convergence assembler and the confidence account |
| `detect/bayes.py` | RADD-style Bayesian disturbance detection |
| `detect/service.py` | stream wiring and multi-sensor integration |
| `area.py` | **the only module allowed to emit hectares** |
| `conformal.py` | calibrated intervals with spatially-blocked splits |
| `api.py` | FastAPI surface |

## Endpoints

| route | returns |
| --- | --- |
| `GET /health` `/sources` `/definitions` `/fixtures` | metadata, no network |
| `POST /plot` | full evidence table for a polygon, with provenance |
| `POST /disturbance` | Bayesian detection, pixel fractions and confirmation dates |
| `POST /area` | bias-adjusted area with a confidence interval |
| `GET /biomass/{fixture}` | wall-to-wall AGBD over the fixture, with conformal bounds and the coverage that justifies them |
| `GET /report/{fixture}` | evidence + disturbance + biomass in one round trip, each block allowed to fail on its own |

`/report` is what the front end reads. Its blocks degrade independently: a
report missing biomass because Earthdata was down is worth more than a 500,
and the absence is stated in the payload rather than left as a gap.

## Running it

```
cd backend
PYTHONPATH=. .venv/Scripts/python scripts/serve.py
```

That serves on 8000 and warms every fixture in the background. Warming is not
optional in spirit: a report is assembled from a Bayesian detector run over
~130 scenes and a biomass model fit against GEDI footprints, and the first call
for a site takes about **3 minutes** even with every input already cached on
disk. The whole response is cached, so the second call takes **0.09 s**.

That 2,000x is the difference between an API that is correct and one that is
usable, and it was only visible once a page actually tried to call it.

## Feeding the front end

The `/record` page in the Next app prefers the live API and falls back to a
frozen capture, saying on the page which one it is showing. Serve the API:

```
cd backend
PYTHONPATH=. .venv/Scripts/python -m uvicorn sylvasense.api:app --port 8000
```

or refresh the capture, which writes `public/sylvasense-report.json`:

```
PYTHONPATH=. .venv/Scripts/python scripts/build_snapshot.py
```

The fallback is not a convenience. The fit needs an Earthdata token and
minutes of HDF5 reads, and the deployed app runs on Workers where no Python
process exists; a page that silently showed nothing would be worse than one
showing real numbers with the date they were measured.

## Three invariants worth knowing

**1. Map-counted area is never published.** `/disturbance` returns a pixel
*fraction* and says so in a caveat; only `/area`, fed a probability sample,
returns hectares. In the worked example a map claiming 2,000 ha of change
corresponds to a bias-adjusted 6,500 ± 4,210 ha — the map understated the loss
by a factor of three. This is why pixel counting is not measurement.

**2. Caveats and degradations are different things.** A caveat is a permanent
qualification ("WorldCover's tree definition is not the EUDR definition"); a
degradation is a problem with *this run* ("only 3 SAR scenes"). Conflating them
made every healthy run look sick and destroyed the confidence signal. Only
degradations change a source's status.

**3. A missing source widens the answer.** Every failure mode — network down,
upstream 500, timeout, corrupt asset, offline gap, OOM — is a test in
`test_robustness.py`. Total outage returns confidence 0.0 and an explicit "the
call cannot be made", never a 500 and never a misleading green light.

## What the fixtures actually showed

Fixtures carry a *hypothesis*, not a label, and `scripts/confirm_fixtures.py`
tests it against live data. Running it rejected two of my own five:

| fixture | verdict | what the data said |
| --- | --- | --- |
| `clearcut` | partially confirmed | 32–37% cover, ALOS non-forest — consistent with cleared land, but annual layers cannot date the clearing |
| `intact` | **rejected** | cover spans 40–85%, modal class *grassland*. Not undisturbed forest; my coordinates are not inside the reserve |
| `cloudy` | **rejected** | 55% clear-observation rate over a year is unremarkable; needs a wet-season-only window to exercise the SAR-only path |
| `degradation` | untestable yet | sub-canopy extraction is invisible to annual land cover by definition |
| `burn` | untestable yet | a burn scar is a temporal signature; needs detection plus a dry-season window |

Two coordinate sets need replacing before those fixtures can serve as gates.
That is a Batch 1 outcome, not a failure — the alternative was believing the
labels.

## Detection: measured, not claimed

### False positives — measured, and the number was appalling

The `intact` fixture was replaced by *search* rather than by guessing again
(`scripts/find_intact.py`): 12 candidate cells across four regions, scored on
three independent layers, accepted only at >=90% cover with <=10% spread. Two
sites now qualify at **100% on all three layers** — Pacaas Novos interior, and
a deep-interior Amazonas control far from any road.

That made the first real specificity measurement possible. Any pixel confirmed
over verified closed primary forest is a false positive:

| fixture | stream | scenes | before persistence | after persistence |
| --- | --- | --- | --- | --- |
| intact | Sentinel-1 VH | 52 | **51.90%** | **3.09%** |
| intact | Sentinel-2 NDVI | 88 | **55.81%** | **0.01%** |
| intact-deep | Sentinel-1 VH | 111 | 42.38% | 0.32% |
| intact-deep | Sentinel-2 NDVI | 62 | 43.54% | 0.00% |

The detector was confirming **half of all primary forest** as disturbed. Nothing
in the synthetic tests caught it — they pass at <2% — because synthetic noise is
Gaussian and SAR speckle is not, and because a synthetic scene has 72
observations where these have 50-111, giving a pixel many more independent
chances to cross the posterior bar on noise alone.

**The fix is a persistence requirement.** A posterior crossing is a hypothesis;
staying down is the evidence for it. After a crossing, the median residual over
the following observations must remain at least 40% of the expected drop below
expectation. Deforestation is permanent, speckle is not. Crossings too close to
the end of the window to verify are reported as `provisional` rather than
promoted — which is how real alert systems treat recent detections.

Worst false-positive rate fell from **55.81% to 3.09%**, an 18x improvement.

### The persistence requirement was not enough on its own

3.09% was measured over a 545-day window and quietly treated as *the* number.
It is not: it is the number at one window length. Re-measured across window
lengths on both confirmed-intact fixtures, the false-positive rate is governed
almost entirely by how much **time** the monitoring period spans, and not at
all by how many scenes fall inside it.

| monitoring span | intact | intact-deep | (scenes at intact-deep) |
| --- | --- | --- | --- |
| 182 days | **41.64%** | **42.75%** | 29 |
| 227 days | 19.79% | 4.03% | 36 |
| 272 days | 3.03% | 0.18% | 42 |
| 365 days | 0.01% | 0.02% | 54 |

29 observations over 182 days confirmed 42.75% of deep-interior Amazon
rainforest as cleared; 26 observations over 272 days confirmed 3.03%. More
scenes did not help, because Sentinel-1 covers some places from several
overlapping orbits and delivers them in clusters a day or two apart — and
twenty observations inside six months are not twenty independent chances to
watch a clearing hold.

This mattered because the API's default window was **365 days**, so the
default request was sitting squarely in the 42% row. It was invisible until
the front end put the number on a page next to the words "confirmed fixture".

Two changes:

- `detect()` now refuses to confirm anything when the monitoring period spans
  less than `MIN_MONITOR_DAYS` (270). Every crossing is returned as
  `provisional` with an `underpowered` explanation attached, which surfaces as
  a source *degradation*. Declining is the correct output of an underpowered
  test.
- The per-pixel persistence check additionally requires the post-crossing
  observations to span `MIN_PERSISTENCE_DAYS` (90), not merely to number four.
- The default analysis window moved from 365 to **730 days**, where both
  fixtures sit at 0.01–0.02%.

### Sentinel-1 does not fly one polarisation everywhere

Loading a stack for `intact-deep` failed with `No such band/alias: vh`. The
cause: 18 of 107 scenes returned by the RTC search are **HH/HV**, not VV/VH.
The crash was the lucky outcome. A more forgiving loader would have spliced
two incomparable polarisations into one series and handed the detector a level
shift indistinguishable from clearing. `run_sar` now filters to items that
actually carry the requested band, and says so when it drops any.

### Sensitivity — still not established

| fixture | stream | confirmed | provisional |
| --- | --- | --- | --- |
| clearcut | Sentinel-1 VH | 0.021 | 0.028 |
| clearcut | Sentinel-2 NDVI | 0.017 | 0.019 |
| degradation | Sentinel-1 VH | 0.036 | 0.014 |
| intact | Sentinel-1 VH | 0.031 | 0.024 |

The clear-cut is not separable from intact forest. **This does not establish
that the detector is blind**, because the `clearcut` fixture cannot test recall:
it was already 32-37% tree cover at the 2020 baseline, so it is *previously*
cleared ground, and a detector watching 2025-2026 should find little there. Its
own confirmation script said so.

`scripts/find_recent_clearing.py` searched 16 cells across four strips of the
arc of deforestation for ground that was forest in 2020 and is not now.
**It found none.** Every cell was either already cleared by 2020 (20-70% cover,
a few points of further loss) or still fully intact (100%). At a 6.6 km cell
size, clearing rarely removes more than a third of cover within four years.

So recall remains unmeasured, and the honest reading of the table above is "no
conclusion", not "it works" and not "it is broken". What would settle it:

- re-run the search at 1-2 km cells, where a single clearing dominates the cell
- or take RADD alert polygons as the reference, which needs `SYLVA_GFW_API_KEY`

### Seasonality: three defects, in order of severity

1. **Polarity.** The optical stream negated NDVI on a comment claiming it "runs
   the other way from backscatter". It does not — forest is high in both and
   clearing lowers both. Negating inverted which tail the non-forest estimator
   selected, so it characterised *forest* as the cleared class.
2. **Seasonality.** A flat per-pixel median put the dry-season trough several
   sigma from expectation. Replaced with a two-harmonic model fitted by batched
   weighted least squares, one robust pass so a rain event cannot drag the curve.
3. **Residual space.** Even with a seasonal model, placing the non-forest mean
   near the *level* failed: observations swing several dB around it and the
   trough landed on the non-forest distribution. The comparison now runs on
   residuals, so a pixel tracking its own curve scores zero however deep the
   trough goes.

Measured seasonal amplitude on real data is 0.35-3.27 dB, so this was a real
signal, not a hypothetical one.

## GEDI: "no data" usually meant "not enough granules"

Two fixtures — `intact-deep` and `burn` — reported the GEDI source as
unavailable and produced no biomass estimate at all. The obvious reading is
the one the module docstring warns about: beams 600 m apart, a 6.6 km cell,
the track simply missed. That reading was wrong, and the counts say so.

| fixture | 3 granules | 8 granules |
| --- | --- | --- |
| intact-deep | 20,036 scanned, **0 pass QA** | 63,691 scanned, **177 pass QA** |
| burn | 16,894 scanned, **0 pass QA** | 38,446 scanned, **1,565 pass QA** |

Twenty thousand footprints were scanned. The beams crossed the region fine.
Every shot failed `(l4a_quality_flag_rel3 == 1) & (degrade_flag == 0) &
(sensitivity > 0.95)` — an unlucky draw of degraded or low-sensitivity passes,
which three granules is a small enough sample to produce. `MAX_GRANULES` is
now 8.

The lesson is the same one the fixtures taught: `n_scanned` and `n_quality`
are different numbers and conflating them invents an explanation. The source
already recorded both in its `extra` block; nothing needed to be measured
again, only read.

## GEDI: live, and what it can and cannot say

With `SYLVA_EARTHDATA_TOKEN` set, `sources/gedi.py` reads L4A v3 footprints
directly from ORNL DAAC — lazily over HTTP range requests, so a multi-GB HDF5
granule costs ~40 s rather than a download.

| fixture | AGBD | 95% CI | quality footprints | carbon |
| --- | --- | --- | --- | --- |
| intact (Pacaas Novos) | 227.1 Mg/ha | [218.2, 236.1] | 1,823 of 26,756 | 106.8 MgC/ha |
| clearcut (Machadinho) | 160.9 Mg/ha | [153.8, 167.9] | 3,671 of 20,732 | 75.6 MgC/ha |

The intervals do not overlap: the two regions are distinguishable, and a sensor
that knows nothing about our WorldCover or ALOS layers independently agrees with
how the fixtures were classified. 227 Mg/ha is squarely in the published range
for intact Amazonian forest.

Three things this module is careful about:

**It is a sample, not a map.** GEDI beams are ~600 m apart with 25 m footprints.
The 6.6 km fixture cells often contain *no shots at all* — CMR reports granules
as intersecting because granule polygons are generous while the track misses. A
plot request is therefore widened to a ~78 km region and the answer is labelled
regional. Returning a regional mean as a plot value would be precisely the quiet
lie the provenance envelope exists to prevent.

**The quality filter is strict and costly.** `l4a_quality_flag_rel3 == 1`,
`degrade_flag == 0`, `sensitivity > 0.95` passes only about 7-18% of shots. That
is correct for L4A and the counts are reported so the thinning is visible.

**The uncertainty is on the mean, not on a footprint.** GEDI v3 ships per-shot
prediction intervals, and averaging them is the wrong statistic — they describe
a single 25 m shot and stay ~1,150-3,350 Mg/ha wide. The interval reported is
the standard error of the regional mean with a design-effect factor of 2.5,
because shots along a beam are 60 m apart and anything but independent. The
single-footprint width is kept in `extra` so both are visible.

## Wall-to-wall biomass: calibrated, and honest about what it cannot do

`biomass.py` fits Sentinel-1 RTC (VV, VH, cross-pol excess, temporal spread),
Sentinel-2 (NDVI, NDMI, NIR, SWIR) and NASADEM (elevation, slope) against the
GEDI footprints, on a 100 m grid over the fit region, and applies the model
everywhere. Three decisions carry the module:

**Footprints are aggregated to cells before fitting.** A single L4A footprint
carries a prediction interval well over 100 Mg/ha. Regressing one noisy 25 m
shot onto one 100 m pixel asks the predictors to explain variance that is
mostly measurement error. The map claims to predict a cell value anyway, so
the cell mean is both the less noisy target and the honest one.

**Intervals are conformal, and calibrated across spatial folds.** The model's
own spread is not used — a gradient-boosted ensemble's variance across trees
means nothing off the training distribution. A single blocked split was tried
first and under-covered (0.865 against a nominal 0.90) because the model is
not spatially stationary: it calibrates on one patch and is asked to cover
another. Rotating the fold so every block is out-of-fold exactly once makes
the pooled residuals carry the between-block variation. Coverage is then
measured on blocks used for neither training nor calibration.

| fixture | footprints | R2 (held out) | coverage | nominal | width |
| --- | --- | --- | --- | --- | --- |
| intact | 1,821 | **-0.34** | 0.854 | 0.90 | 351 Mg/ha |
| clearcut | 2,559 | 0.245 | 0.900 | 0.90 | 312 Mg/ha |
| degradation | 331 | 0.300 | 0.966 | 0.90 | 136 Mg/ha |

**A negative R2 on intact forest is the correct answer, not a bug.** Interior
primary forest really does hold the same stock hectare to hectare, so almost
all of GEDI's cell-to-cell scatter there is its own measurement error, and no
predictor can or should reproduce it. The interval still covers; it is the
*ranking* that fails. `BiomassFit.ranks_cells` reports which of the two the
caller is looking at, and where it is false the caveat tells them to read the
map as a level with an interval rather than as a pattern.

C-band saturation is the standing limit: Sentinel-1 stops responding to
biomass somewhere around 100-150 Mg/ha, below most of this landscape, and
above it the fit leans on spectral and terrain cues. Feature importance bears
this out — SWIR and NDVI dominate on the high-stock fixtures, and the SAR
terms only carry real weight where stocks are lower.

## Known limits, stated rather than hidden

- **GEDI is live** but regional, slow (~40 s/granule), and limited to ±51.6°
  latitude. It is a calibration source, not an interactive one.
- **The biomass map carries an interval, not a ranking, in intact forest.**
  See below: coverage holds everywhere, but R2 goes negative where the forest
  is uniform, and the envelope says so via `ranks_cells`.
- **OmniCloudMask is not installed**, so cloud masking falls back to the L2A
  scene classification, which under-detects thin cirrus. The fallback is
  logged, not silent.
- **`clear_fraction` is a clear-*observation rate*** across the stack, not the
  clarity of any single date. It does not discriminate a cloudy AOI at annual
  scale.
- **Individual tree crowns are out of scope at Sentinel resolution.** 10 m
  pixels do not resolve crowns; that needs sub-metre imagery.

## Configuration

All settings are `SYLVA_`-prefixed (see `config.py`). The ones that matter:

| variable | effect |
| --- | --- |
| `SYLVA_OFFLINE=1` | replay from cache, never hit the network |
| `SYLVA_EARTHDATA_TOKEN` | enables GEDI |
| `SYLVA_GFW_API_KEY` | enables RADD / GLAD integration |
| `SYLVA_CDSE_CLIENT_ID/SECRET` | adds Copernicus as a second catalogue |
| `SYLVA_MIN_SAR_SCENES` | below this, the SAR answer is marked degraded |

## References

- Olofsson et al. (2014), *Good practices for estimating area and assessing
  accuracy of land change*, RSE 148:42-57 — the area estimator
- Reiche et al. (2021), *Forest disturbance alerts for the Congo Basin using
  Sentinel-1* — the detection method
- Angelopoulos & Bates, *A Gentle Introduction to Conformal Prediction* —
  the interval machinery
