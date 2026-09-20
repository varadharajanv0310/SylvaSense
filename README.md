# SylvaSense — The Last Green

One continuous, scroll-controlled flagship experience: living forest → loss → fire and ash → observation → fusion → individual crowns → biomass and carbon → temporal change → intervention. `/`, `/concepts`, and the selected prototype's original `/concept-06` address open the flagship. Older prototype routes are retained for reference but are not the primary experience.

## Run

```sh
npm install
node scripts/run-framework.mjs dev
node node_modules/typescript/bin/tsc --noEmit
node scripts/run-framework.mjs build
node scripts/preview.mjs
```

Development: `http://localhost:5173/`. Static production preview: `http://127.0.0.1:4173/`. Build output: `dist/client`. React 19, TypeScript, Vinext/Vite, Three.js and custom GLSL. No backend, sign-in flow, live satellite feed, or ML inference.

## Implementation map

- `app/ui/flagship/TheLastGreen.tsx`: narrative, actual asset-loading progress, reversible native-scroll timeline, damped motion, typography, controls, accessibility, chapter navigation and optional sound.
- `app/ui/flagship/world.ts`: shared WebGL renderer, forest degradation/fire/cloud shaders, aerial transition, four terrain layers, persistent particle-to-canopy transformation, camera choreography, instanced crown boundaries, picking, temporal ghost geometry and spatial annotations.
- `app/ui/flagship/model.ts`: chapter landmarks, deterministic demonstration trees, terrain, asset paths and shared state.
- `app/ui/flagship/styles.css`: editorial typography, foliage framing, loader reveal, overlays, interaction states and responsive compositions.
- `app/ui/flagship/ambient.ts`: quiet synthesized atmosphere. It starts only after the sound control is activated, changes with the narrative, and fades when the tab is hidden.

## Controls and accessibility

Scroll normally in either direction. Index buttons jump to chapters; the skip link moves directly to observation. Optical/SAR/LiDAR, cloud cover, crown selection, biomass/carbon, and the 2020–2025 timeline update the actual visualization. The crown-inspection button is the keyboard alternative to picking the canvas. Marking A–17 is a reversible browser-only demonstration state.

Reduced-motion preferences disable ambient motion and inertial interpolation. The study notes provide an explicit full-motion opt-in. Navigation transfers focus to the destination heading; Escape dismisses notes/index and restores their trigger. Inactive content is inert and hidden from assistive technology. Native range inputs retain arrow-key support. A photographic fallback preserves the narrative and controls when WebGL initialization or context fails.

## Performance

Three.js and audio load dynamically. A single rendering loop drives the world and updates only changing React UI state. The 144 modeled crowns share a 38,160-point GPU geometry on desktop, reduced to 18,000 points for a mobile initial load. Crown outlines use one instanced mesh. No video or model download is needed for the flagship.

Renderer pixel ratio is capped at 1.6 on desktop and 1.25 on mobile, with an adaptive drop to 1 after sustained slow frames. Geometry, materials and textures are reused and disposed on unmount. Rendering pauses in hidden tabs. Image/font loading has bounded deadlines. ResizeObserver keeps the native-scroll extent aligned with viewport-dependent scene height. Pinned content uses `overflow: clip` so keyboard focus cannot scroll an internal hidden container out of view.

## Replace assets and data

The `ASSETS` object in `app/ui/flagship/model.ts` points to:

| File                            | Role                                  | Replacement requirements                                                                         |
| ------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `public/media/deep-forest.jpg`  | Opening, degradation and final return | Forest photograph, approximately 16:9; retain a calm center for typography                       |
| `public/media/river-canopy.jpg` | Aerial transition and terrain raster  | Approximately 16:9 canopy imagery; registration to real terrain would need a geospatial pipeline |
| `public/media/leaf.webp`        | Foreground vegetation                 | Transparent alpha cutout, tight natural silhouette                                               |

If filenames change, also update the CSS photographic fallback. The shader's cover helper currently assumes 16:9 photography. Asset provenance is recorded in `public/media/SOURCES.md`.

To connect real products later, replace the deterministic `trees`/`terrain` in `model.ts`, point generation and raster registration in `world.ts`, and demonstration metrics in `TheLastGreen.tsx`. Crown positions, heights, confidence, canopy cover and carbon values currently illustrate interaction design; they are not measurements from the depicted imagery. Keep calibration, uncertainty, geographic registration and acquisition dates explicit when replacing them.

The sensor colors are artistic representations, not actual Sentinel bands or calibrated SAR. Landscape-scale Sentinel imagery alone does not resolve individual tree crowns. Individual-tree enumeration requires finer-resolution imagery and/or dense airborne LiDAR. The carbon view is an aboveground stock estimate with an assumed 0.47 fraction, not annual sequestration.

Science references: [ESA Sentinel-1](https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-1) and [GEDI products](https://gedi.umd.edu/dataproducts/products/).

## Visual verification

The original prototype was run and inspected before replacement. Two post-implementation polish passes refined desktop world scale, camera-space placement, foliage/title occlusion, sensor labels, mobile compositions, final forest return, short-screen control spacing and focus behavior. Browser checks covered desktop 1440×900, phone 390×844, landscape 844×390, reduced/full motion, chapter jumps, reverse scrolling, sensor switching, crown picking and keyboard inspection, carbon switching, timeline buttons/arrow keys, review state, replay, optional sound and console errors. TypeScript and scoped ESLint validate the flagship source; the static production build is checked before publication.

---

## Scroll studies — `/studies`, `/study/01` … `/study/19`

This working copy adds a second section alongside the flagship: nineteen scroll-driven concept
studies, ported in from a separate Vite prototype and rehoused in this application. Ten are
independent directions; nine are merges that fuse two or three of the ten into a single arc. The
flagship is unchanged apart from one entry added to its field index.

Reach them from the flagship's **Index → Scroll studies**, or go straight to `/studies`.

| Route | | |
| --- | --- | --- |
| `/studies` | Index, in the host selector's own vocabulary | live animated previews |
| `/study/01` … `/study/10` | Ember · Growth Rings · Night Watch · Herbarium · Enumeration · Roots · The Stack · Vitals · Rain · Seed | one scroll mechanic each |
| `/study/11` … `/study/19` | The Cube · Ash and Root · The Return · The Record · The Silent Alarm · Both Directions · Tinderbox · Type Specimen · Below the Record | two axes each |

### How it is wired in

- `app/studies/page.tsx` and `app/study/[id]/page.tsx` are the only new routes. `[id]` prerenders
  all nineteen via `generateStaticParams` and sets per-study metadata from `app/ui/studies/titles.ts`.
- `app/ui/studies/StudyRouter.tsx` maps an id to a `dynamic(..., { ssr: false })` import, so a study
  is only downloaded when it is opened, and adds `study-mode` to `<body>` while one is mounted.
- `app/ui/studies/StudyIndex.tsx` is written entirely in the host's `.selector` / `.concept-grid` /
  `.concept-card` classes, so the section inherits this application's type and layout rather than
  importing a second design system.
- `app/ui/studies/studies.css` scopes the studies' element-level rules to `body.study-mode` and
  undoes three host globals inside a study: `img, video { width:100%; height:100% }`,
  `em { font-family: var(--serif) }` and `html { scroll-behavior: smooth }` — the last of which
  fights the studies' scroll engine.
- The studies keep their own scroll engine (Lenis plus one rAF loop writing `--p` to the document
  root). It is the only dependency the port added.

### Adaptations made during the port

- Every study component carries `"use client"`; the scene modules they import are client-only.
- `react-router-dom` links became `next/link`.
- Callback refs that returned a value (`ref={(el) => (arr.current[i] = el)}`) were wrapped in a
  block — React 19 treats a returned function as a cleanup.
- Study media was copied into `public/media/` alongside the flagship's; no filenames collide.
  Provenance for it is in `public/media/CREDITS-studies.md` (public domain: NASA SVS, NASA GSFC,
  US Forest Service, via Wikimedia Commons). The flagship's own assets are unchanged.

Figures in the studies are plausible illustrative data for a ~1.18 Mha monitoring cell, not
measurements — the same standard the flagship holds itself to.
