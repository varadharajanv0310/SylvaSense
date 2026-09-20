'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useNarrative, setText } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { clamp01, easeInOutCubic, easeOutCubic, lerp, mulberry32, seg, smoothstep } from '../lib/math'
import { METRICS, SITE, SPECIMENS } from '../lib/data'
import { drawPressedLeaf, drawTile, drawVectorLeaf, toURL } from './art'
import './herbarium.css'

const CHAPTERS = [
  { at: 0, label: '01 / Sheet SVS.0001' },
  { at: 0.13, label: '02 / Drawer 14' },
  { at: 0.3, label: '03 / The run' },
  { at: 0.5, label: '04 / Past tense' },
  { at: 0.6, label: '05 / Digitisation' },
  { at: 0.75, label: '06 / From sheet to scene' },
  { at: 0.87, label: '07 / A herbarium that updates itself' },
]

const COLS = 6
const ROWS = 3
const N = COLS * ROWS

/** Grid cell positions in viewport-percent, index 0 placed at the centre. */
function gridLayout() {
  const cells: { x: number; y: number; r: number }[] = []
  const rnd = mulberry32(19)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // vw / vh, because transform percentages resolve against the sheet, not the page
      cells.push({
        x: (c - (COLS - 1) / 2) * 14.5,
        y: (r - (ROWS - 1) / 2) * 27,
        r: (rnd() - 0.5) * 2.4,
      })
    }
  }
  const centre = Math.floor(N / 2)
  const tmp = cells[0]
  cells[0] = cells[centre]
  cells[centre] = tmp
  return cells
}

const mixRGB = (a: number[], b: number[], t: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`

const CREAM = [239, 233, 220]
const AGED = [223, 214, 195]
const DUSK = [46, 42, 30]
const INK = [13, 16, 14]

export default function Herbarium() {
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([])
  const heroRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const tileRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef<HTMLSpanElement>(null)

  const cells = useMemo(gridLayout, [])

  const art = useMemo(() => {
    const leaves = [0, 1, 2].map((i) => toURL(drawPressedLeaf(360, 620, 3 + i * 7)))
    const vectors = [0, 1, 2].map((i) => toURL(drawVectorLeaf(360, 620, 3 + i * 7)))
    const tile = toURL(drawTile(900, 620, { polygons: true, alerts: true }))
    const tilePlain = toURL(drawTile(420, 300, { polygons: false, alerts: false }))
    return { leaves, vectors, tile, tilePlain }
  }, [])

  const { rootRef } = useNarrative({
    pages: 13,
    onFrame: (p) => {
      /* ---- paper turns to ink ---- */
      if (paperRef.current) {
        const aged = smoothstep(seg(p, 0.26, 0.5))
        const inked = smoothstep(seg(p, 0.6, 0.69))
        const base = mixRGB(CREAM, AGED, aged)
        paperRef.current.style.background =
          inked > 0.001 ? (inked < 0.5 ? mixRGB(AGED, DUSK, inked / 0.5) : mixRGB(DUSK, INK, (inked - 0.5) / 0.5)) : base
      }
      const inked = smoothstep(seg(p, 0.6, 0.69))
      if (rootRef.current) rootRef.current.style.setProperty('--ink', String(inked))

      /* ---- the archive ---- */
      const pullBack = easeInOutCubic(seg(p, 0.02, 0.26)) // hero fills frame -> whole drawer
      const depth = easeInOutCubic(seg(p, 0.29, 0.36)) // grid opens into a corridor
      const travel = Math.pow(seg(p, 0.33, 0.52), 1.7) * 5600 // the run
      const streamOut = smoothstep(seg(p, 0.47, 0.54))

      const scale = lerp(6.4, 1, pullBack)
      if (worldRef.current) {
        worldRef.current.style.transform = `scale(${scale.toFixed(4)})`
        worldRef.current.style.opacity = String(1 - streamOut)
      }

      const SPACING = 210
      for (let i = 0; i < N; i++) {
        const el = sheetRefs.current[i]
        if (!el) continue
        const cell = cells[i]
        let z = -depth * i * SPACING + travel
        const span = N * SPACING
        while (z > 430) z -= span
        while (z < 430 - span) z += span
        const near = clamp01((z + 200) / 640)
        const spread = lerp(1, 1.5, depth)
        const solo = i === 0 ? 1 : smoothstep(seg(p, 0.03, 0.13))
        const zFade = depth > 0.01 ? clamp01((z + span - 220) / 420) * (1 - smoothstep((z - 230) / 200)) : 1
        const op = solo * (depth > 0.01 ? clamp01(0.15 + zFade) : 1)
        el.style.transform =
          `translate3d(${(cell.x * spread).toFixed(2)}vw, ${(cell.y * spread).toFixed(2)}vh, ${z.toFixed(1)}px)` +
          ` rotateZ(${cell.r.toFixed(2)}deg) rotateY(${(depth * (cell.x > 0 ? -6 : 6)).toFixed(2)}deg)`
        el.style.opacity = op.toFixed(3)
        el.style.filter = near > 0.72 ? `blur(${((near - 0.72) * 22).toFixed(1)}px)` : ''
        el.style.visibility = op < 0.01 ? 'hidden' : 'visible'
      }

      if (counterRef.current) {
        const seen = Math.round(lerp(1, 41904, Math.pow(seg(p, 0.3, 0.52), 1.7)))
        const txt = seen.toLocaleString('en-US')
        if (counterRef.current.textContent !== txt) setText(counterRef.current, txt)
      }

      /* ---- the hero sheet: pause, digitise, become a scene ---- */
      const hero = heroRef.current
      if (hero) {
        const inT = smoothstep(seg(p, 0.5, 0.56))
        const grow = easeInOutCubic(seg(p, 0.75, 0.87))
        const out = smoothstep(seg(p, 0.86, 0.92))
        const s = lerp(1, 2.5, grow)
        hero.style.opacity = (inT * (1 - out)).toFixed(3)
        hero.style.visibility = inT * (1 - out) < 0.01 ? 'hidden' : 'visible'
        hero.style.transform = `translate3d(-50%,-50%,0) scale(${s.toFixed(3)}) rotateY(${(grow * -14).toFixed(2)}deg)`
        const vec = hero.querySelector<HTMLElement>('.hb-leaf-vec')
        const vT = smoothstep(seg(p, 0.585, 0.665))
        if (vec) vec.style.opacity = vT.toFixed(3)
        const plate = hero.querySelector<HTMLElement>('.hb-leaf:not(.hb-leaf-vec)')
        if (plate) plate.style.opacity = (1 - vT * 0.62).toFixed(3)
        const raster = hero.querySelector<HTMLElement>('.hb-raster')
        if (raster) raster.style.opacity = (smoothstep(seg(p, 0.6, 0.685)) * (1 - smoothstep(seg(p, 0.86, 0.9)))).toFixed(3)
        const paperFields = hero.querySelector<HTMLElement>('.hb-fields-paper')
        if (paperFields) paperFields.style.opacity = String(1 - smoothstep(seg(p, 0.585, 0.655)))
        const jsonFields = hero.querySelector<HTMLElement>('.hb-fields-json')
        if (jsonFields) jsonFields.style.opacity = smoothstep(seg(p, 0.625, 0.705)).toFixed(3)
      }

      /* ---- the tile behind the sheet ---- */
      if (tileRef.current) {
        const t = smoothstep(seg(p, 0.76, 0.88))
        const fade = 1 - smoothstep(seg(p, 0.9, 0.95))
        tileRef.current.style.opacity = (t * 0.95 * fade).toFixed(3)
        tileRef.current.style.transform = `translate(-50%,-50%) scale(${lerp(0.42, 1.25, easeOutCubic(t)).toFixed(3)})`
      }

      /* ---- the living herbarium ---- */
      if (gridRef.current) {
        const t = smoothstep(seg(p, 0.89, 0.96))
        gridRef.current.style.opacity = t.toFixed(3)
        gridRef.current.style.visibility = t < 0.01 ? 'hidden' : 'visible'
        const kids = gridRef.current.children
        for (let i = 0; i < kids.length; i++) {
          const k = kids[i] as HTMLElement
          const d = smoothstep(seg(p, 0.89 + (i % 8) * 0.004, 0.95 + (i % 8) * 0.004))
          k.style.transform = `translateY(${((1 - d) * 26).toFixed(1)}px)`
          k.style.opacity = d.toFixed(3)
        }
      }
    },
  })

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div ref={rootRef} className="hb-root">
      <div className="stage hb-stage">
        <div ref={paperRef} className="hb-paper" />
        <div className="hb-fibre" />

        {/* the drawer of sheets */}
        <div ref={worldRef} className="hb-world">
          {Array.from({ length: N }).map((_, i) => {
            const rec = SPECIMENS[i % SPECIMENS.length]
            return (
              <div
                key={i}
                ref={(el) => { sheetRefs.current[i] = el }}
                className="hb-sheet"
              >
                <div className="hb-sheet-rule" />
                <img className="hb-leaf" src={art.leaves[i % 3]} alt="" />
                <div className="hb-fields">
                  <div className="hb-taxon editorial">{rec.taxon}</div>
                  <div className="micro hb-common">{rec.common}</div>
                  <div className="hb-meta mono">
                    <span>{rec.id}</span>
                    <span>{rec.coords}</span>
                  </div>
                  <div className="hb-last mono">
                    <span className="micro">Last observed</span>
                    <span>{rec.last}</span>
                  </div>
                </div>
                <div className={`hb-stamp ${rec.status === 'Cleared' ? 'hb-stamp-red' : ''}`}>{rec.status}</div>
              </div>
            )
          })}
        </div>

        {/* satellite tile that grows behind the final sheet */}
        <div ref={tileRef} className="hb-tile" style={{ backgroundImage: `url(${art.tile})` }} />

        {/* the hero sheet: paused, then digitised */}
        <div ref={heroRef} className="hb-hero hb-sheet">
          <div className="hb-sheet-rule" />
          <img className="hb-leaf" src={art.leaves[0]} alt="" />
          <img className="hb-leaf hb-leaf-vec" src={art.vectors[0]} alt="" />
          <div className="hb-raster" />
          <div className="hb-fields hb-fields-paper">
            <div className="hb-taxon editorial">{SPECIMENS[0].taxon}</div>
            <div className="micro hb-common">{SPECIMENS[0].common}</div>
            <div className="hb-meta mono">
              <span>{SPECIMENS[0].id}</span>
              <span>{SPECIMENS[0].coords}</span>
            </div>
            <div className="hb-last mono">
              <span className="micro">Last observed</span>
              <span>{SPECIMENS[0].last}</span>
            </div>
          </div>
          <div className="hb-fields hb-fields-json mono">
            <div>{'{'}</div>
            <div className="hb-json-l">"type": "Feature",</div>
            <div className="hb-json-l">"crown_id": 1,</div>
            <div className="hb-json-l">"area_m2": 118.4,</div>
            <div className="hb-json-l">"height_m": 31.7,</div>
            <div className="hb-json-l">"agb_t": 4.82,</div>
            <div className="hb-json-l">"carbon_t": 2.27,</div>
            <div className="hb-json-l">"confidence": 0.961,</div>
            <div className="hb-json-l">"observed": "2026-09-14"</div>
            <div>{'}'}</div>
          </div>
        </div>

        {/* the living herbarium */}
        <div ref={gridRef} className="hb-grid">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="hb-cell">
              <div
                className="hb-cell-img"
                style={{
                  backgroundImage: `url(${art.tilePlain})`,
                  backgroundPosition: `${(i % 6) * 22}% ${Math.floor(i / 6) * 30}%`,
                }}
              />
              <div className="micro hb-cell-meta">
                <span>{SITE.tile}-{String(i + 1).padStart(2, '0')}</span>
                <span className="hb-cell-eta">+{(i % 5) + 1} d</span>
              </div>
            </div>
          ))}
        </div>

        {/* ---------- typography ---------- */}

        <Beat a={-0.04} b={0.06} className="hb-top-left" hold={0.3}>
          <div className="micro hb-eyebrow">SylvaSense · ORION-PS-03 · Herbarium of the {SITE.region} corridor</div>
        </Beat>

        <Beat a={0.045} b={0.13} className="hb-bottom-left">
          <h1 className="editorial hb-h1">
            A herbarium is an archive
            <br />
            of the <em>past tense.</em>
          </h1>
        </Beat>

        <Beat a={0.14} b={0.28} className="hb-top-centre">
          <div className="micro hb-eyebrow">Drawer 14 · SVS.0001 – SVS.3764</div>
          <h2 className="editorial hb-h2">
            Sheet <span className="mono">1</span> of <span className="mono">41,904</span>.
          </h2>
        </Beat>

        <Beat a={0.32} b={0.5} className="hb-top-centre" hold={0.18}>
          <h2 className="editorial hb-h2 hb-h2-wide">
            Every sheet is a place
            <br />
            that no longer looks like this.
          </h2>
        </Beat>

        <div className="hb-run-counter">
          <span className="micro">Sheets passed</span>
          <span ref={counterRef} className="mono hb-run-num">
            1
          </span>
        </div>

        <Beat a={0.52} b={0.62} className="hb-bottom-centre">
          <p className="hb-lede">
            Each one is accurate, beautiful, and forty years old. Between the collection date and today
            there is no record at all — only the assumption that nothing changed.
          </p>
        </Beat>

        <Beat a={0.63} b={0.75} className="hb-top-left-dark">
          <div className="micro hb-eyebrow">Digitisation · vein graph → crown polygon</div>
          <h2 className="editorial hb-h2 hb-light">
            The same outline,
            <br />
            read as geometry.
          </h2>
        </Beat>

        <Beat a={0.76} b={0.88} className="hb-bottom-centre">
          <h2 className="editorial hb-h2 hb-light">
            One specimen becomes
            <br />
            <span className="mono hb-count">
              <Counter from={1} to={METRICS.treesDetected} a={0.78} b={0.87} />
            </span>{' '}
            crowns.
          </h2>
        </Beat>

        <Beat a={0.89} b={1} className="hb-top-centre" hold={0.24}>
          <div className="micro hb-eyebrow hb-light-dim">SylvaSense</div>
          <h2 className="editorial hb-h2 hb-light">A herbarium that updates itself every five days.</h2>
        </Beat>

        <Beat a={0.93} b={1} className="hb-metrics">
          <M k="Crowns indexed" v={METRICS.treesDetected.toLocaleString('en-US')} />
          <M k="Canopy cover" v={`${METRICS.canopyCoverPct} %`} />
          <M k="Biomass" v={`${METRICS.agbTHa} t/ha`} />
          <M k="Carbon stock" v={`${METRICS.carbonStockMtC} Mt C`} />
          <M k="Alerts / 30 d" v={String(METRICS.alertsLast30d)} />
          <M k="Revisit" v={`${METRICS.revisitDays} days`} />
        </Beat>
      </div>

      <ConceptChrome index="Concept 04" title="Herbarium" chapters={CHAPTERS} accent="#8c6a3f" />
      <ScrollTrack pages={13} />
    </div>
  )
}

function M({ k, v }: { k: string; v: string }) {
  return (
    <div className="hb-m">
      <div className="micro hb-m-k">{k}</div>
      <div className="mono hb-m-v">{v}</div>
    </div>
  )
}
