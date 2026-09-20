'use client'

import { useEffect, useRef } from 'react'
import { createEnumScene, EnumScene } from './scene'
import { useNarrative, setText } from '../lib/narrative'
import { Beat, ConceptChrome, ScrollTrack } from '../lib/ui'
import { seg, smoothstep } from '../lib/math'
import { METRICS, SITE } from '../lib/data'
import './enumeration.css'

const CHAPTERS = [
  { at: 0, label: '01 / One' },
  { at: 0.1, label: '02 / Multiplication' },
  { at: 0.34, label: '03 / Area' },
  { at: 0.45, label: '04 / Subtraction' },
  { at: 0.63, label: '05 / Orbital' },
  { at: 0.75, label: '06 / Descent' },
  { at: 0.91, label: '07 / Index' },
]

const TOTAL = METRICS.treesDetected
const LOST = 904_118

/** Population at a given scroll position: exponential growth, then a cut. */
function population(p: number) {
  if (p < 0.34) return Math.max(1, Math.pow(seg(p, 0.015, 0.34), 3.2) * TOTAL)
  if (p < 0.45) return TOTAL
  if (p < 0.62) return TOTAL - smoothstep(seg(p, 0.45, 0.62)) * LOST
  return TOTAL - LOST
}

const nf = new Intl.NumberFormat('en-US')

export default function Enumeration() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<EnumScene | null>(null)
  const countRef = useRef<HTMLDivElement>(null)
  const countWrapRef = useRef<HTMLDivElement>(null)
  const countLabelRef = useRef<HTMLDivElement>(null)
  const co2Ref = useRef<HTMLDivElement>(null)
  const co2WrapRef = useRef<HTMLDivElement>(null)
  const altRef = useRef<HTMLSpanElement>(null)
  const gsdRef = useRef<HTMLSpanElement>(null)
  const zoomRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)

  const { rootRef } = useNarrative({
    pages: 14,
    onFrame: (p, dt, t) => {
      sceneRef.current?.update(p, dt, t)

      /* the counter is the hero typography of this concept */
      const n = population(p)
      if (countRef.current) {
        const txt = nf.format(Math.round(n))
        if (countRef.current.textContent !== txt) setText(countRef.current, txt)
      }
      if (countWrapRef.current) {
        const vis = smoothstep(seg(p, -0.02, 0.03)) * (1 - smoothstep(seg(p, 0.62, 0.68)))
        countWrapRef.current.style.opacity = vis.toFixed(3)
        countWrapRef.current.style.visibility = vis < 0.005 ? 'hidden' : 'visible'
        // shrinks from a single monumental digit to a running tally
        const s = 1 - smoothstep(seg(p, 0.04, 0.2)) * 0.52
        countWrapRef.current.style.transform = `translate(-50%,-50%) scale(${s.toFixed(3)})`
        countWrapRef.current.style.color = p > 0.46 ? '#ffb069' : '#eaf6ea'
      }
      if (countLabelRef.current) {
        const label =
          p < 0.06
            ? 'Bertholletia excelsa · 24.1 m · 412 kg C'
            : p < 0.45
              ? 'stems detected · instance segmentation'
              : 'stems remaining'
        if (countLabelRef.current.textContent !== label) setText(countLabelRef.current, label)
      }

      /* released carbon rises as the population falls */
      if (co2WrapRef.current && co2Ref.current) {
        const vis = smoothstep(seg(p, 0.46, 0.52)) * (1 - smoothstep(seg(p, 0.66, 0.72)))
        co2WrapRef.current.style.opacity = vis.toFixed(3)
        co2WrapRef.current.style.visibility = vis < 0.005 ? 'hidden' : 'visible'
        const v = smoothstep(seg(p, 0.45, 0.62)) * 41.9
        setText(co2Ref.current, v.toFixed(1))
      }

      /* scale HUD */
      const st = sceneRef.current?.readState()
      if (st && hudRef.current) {
        const vis = smoothstep(seg(p, 0.06, 0.12))
        hudRef.current.style.opacity = vis.toFixed(3)
        if (altRef.current)
          setText(altRef.current, st.dist < 1000 ? `${Math.round(st.dist)} m` : `${(st.dist / 1000).toFixed(2)} km`)
        if (gsdRef.current)
          setText(gsdRef.current, st.gsd < 1 ? `${(st.gsd * 100).toFixed(0)} cm` : `${st.gsd.toFixed(1)} m`)
        if (zoomRef.current) setText(zoomRef.current, `z${st.zoom}`)
        if (barRef.current) {
          const metres = st.gsd * 40
          setText(barRef.current, metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`)
        }
      }
    },
  })

  useEffect(() => {
    if (!canvasRef.current) return
    const s = createEnumScene(canvasRef.current)
    sceneRef.current = s
    const onResize = () => s.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      s.dispose()
      sceneRef.current = null
    }
  }, [])

  return (
    <div ref={rootRef} className="en-root">
      <div className="stage">
        <canvas ref={canvasRef} className="full-canvas" />
        <div className="vignette" />

        {/* the running population */}
        <div ref={countWrapRef} className="en-count-wrap">
          <div ref={countRef} className="mono en-count">
            1
          </div>
          <div ref={countLabelRef} className="micro en-count-label">
            Bertholletia excelsa · 24.1 m · 412 kg C
          </div>
        </div>

        <div ref={co2WrapRef} className="en-co2">
          <div className="micro en-co2-k">Released to atmosphere</div>
          <div className="mono en-co2-v">
            <span ref={co2Ref}>0.0</span> <span className="en-co2-u">Mt CO₂e</span>
          </div>
        </div>

        {/* ---------- typography ---------- */}

        <Beat a={-0.04} b={0.055} className="en-top" hold={0.3}>
          <div className="micro en-eyebrow">SylvaSense · ORION-PS-03 · {SITE.id}</div>
        </Beat>

        <Beat a={0.13} b={0.29} className="en-bottom-left">
          <h2 className="en-h2">
            A forest is not a thing.
            <br />
            It is a number of things.
          </h2>
        </Beat>

        <Beat a={0.345} b={0.44} className="en-bottom-centre">
          <h2 className="en-h2 en-h2-centre">
            At this altitude it stops being trees
            <br />
            and starts being area.
          </h2>
          <p className="en-lede">
            {nf.format(SITE.areaHa)} hectares · {nf.format(TOTAL)} stems · {METRICS.canopyCoverPct1990}% canopy in
            1990
          </p>
        </Beat>

        <Beat a={0.46} b={0.62} className="en-bottom-left">
          <div className="micro en-tag en-warn">Subtraction · 2024–2026</div>
          <h2 className="en-h2">
            {nf.format(METRICS.lossHa2024)} hectares.
            <br />
            {nf.format(LOST)} stems.
            <br />
            One financial year.
          </h2>
        </Beat>

        <Beat a={0.635} b={0.74} className="en-bottom-centre">
          <h2 className="en-h2 en-h2-centre">From up here, a felled forest is a change in pixel value.</h2>
          <p className="en-lede">
            {SITE.tile} · {SITE.epsg} · Sentinel-2 L2A · 10 m ground sample distance · revisit{' '}
            {METRICS.revisitDays} days
          </p>
        </Beat>

        <Beat a={0.755} b={0.86} className="en-bottom-centre">
          <h2 className="en-h2 en-h2-centre">Every pixel resolves back into individuals.</h2>
        </Beat>

        {/* ---------- the index record ---------- */}
        <Beat a={0.9} b={1} className="en-record" mode="left" hold={0.2}>
          <div className="micro en-tag">SylvaSense · crown record</div>
          <div className="mono en-record-id">TREE 000001 / {nf.format(TOTAL)}</div>
          <div className="en-record-grid">
            <Rec k="Species (predicted)" v="Bertholletia excelsa" />
            <Rec k="Canopy height" v="24.1 m" />
            <Rec k="Crown area" v="118.4 m²" />
            <Rec k="Above-ground biomass" v="4.82 t" />
            <Rec k="Stored carbon" v="2.27 t C" />
            <Rec k="Detection confidence" v="0.961" />
            <Rec k="Last observed" v="2026-09-14" />
            <Rec k="Status" v="Standing" good />
          </div>
        </Beat>

        <Beat a={0.955} b={1} className="en-bottom-centre" hold={0.3}>
          <p className="en-lede en-lede-bright">
            Counted from orbit, verified on the ground, and re-counted every five days.
          </p>
        </Beat>

        {/* scale HUD — continuous */}
        <div ref={hudRef} className="en-hud">
          <div className="en-hud-row">
            <span className="micro">Altitude</span>
            <span ref={altRef} className="mono en-hud-v">
              9 m
            </span>
          </div>
          <div className="en-hud-row">
            <span className="micro">Ground sample</span>
            <span ref={gsdRef} className="mono en-hud-v">
              40 cm
            </span>
          </div>
          <div className="en-hud-row">
            <span className="micro">Pyramid level</span>
            <span ref={zoomRef} className="mono en-hud-v">
              z20
            </span>
          </div>
          <div className="en-scalebar">
            <span className="en-scalebar-line" />
            <span ref={barRef} className="micro en-scalebar-label">
              16 m
            </span>
          </div>
        </div>
      </div>

      <ConceptChrome index="Concept 05" title="Enumeration" chapters={CHAPTERS} accent="#7af0b4" />
      <ScrollTrack pages={14} />
    </div>
  )
}

function Rec({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div className="en-rec">
      <span className="micro en-rec-k">{k}</span>
      <span className="mono en-rec-v" style={good ? { color: '#7af0b4' } : undefined}>
        {v}
      </span>
    </div>
  )
}
