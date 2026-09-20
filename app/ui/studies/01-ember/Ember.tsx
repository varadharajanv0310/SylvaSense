'use client'

import { useEffect, useRef } from 'react'
import { createEmberScene, EmberScene } from './scene'
import { useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { clamp01, mulberry32, seg, smoothstep } from '../lib/math'
import { METRICS, SITE } from '../lib/data'
import './ember.css'

const CHAPTERS = [
  { at: 0, label: '01 / Canopy' },
  { at: 0.12, label: '02 / Interior' },
  { at: 0.3, label: '03 / The cut' },
  { at: 0.48, label: '04 / Combustion' },
  { at: 0.64, label: '05 / Fallout' },
  { at: 0.8, label: '06 / Re-observation' },
  { at: 0.91, label: '07 / SylvaSense' },
]

const ASH_A = 0.645
const ASH_B = 0.775

export default function Ember() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ashRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<EmberScene | null>(null)
  const ash = useRef({ drawn: 0, rnd: mulberry32(404) })

  /** Ash accumulates on a separate 2D layer that sits over the typography. */
  const stamp = (from: number, to: number) => {
    const cv = ashRef.current
    if (!cv) return
    const g = cv.getContext('2d')!
    const W = cv.width
    const H = cv.height
    const TOTAL = Math.round((W * H) / 420)
    const n = Math.max(0, Math.round((to - from) * TOTAL))
    const rnd = ash.current.rnd
    for (let i = 0; i < n; i++) {
      // bias toward the centre band where the headline sits
      const x = (0.5 + (rnd() - 0.5) * (0.55 + rnd() * 0.85)) * W
      const y = (0.34 + Math.pow(rnd(), 0.75) * 0.62) * H
      // mostly fine grit, occasionally a larger flake
      const r = (0.8 + Math.pow(rnd(), 2.7) * 17) * (W / 1600)
      const v = 26 + rnd() * 62
      const warm = rnd() < 0.05
      g.fillStyle = warm
        ? `rgba(${120 + rnd() * 90},${52 + rnd() * 26},${18},${0.22 + rnd() * 0.3})`
        : `rgba(${v},${v - 1},${v - 3},${0.3 + rnd() * 0.62})`
      g.beginPath()
      g.ellipse(x, y, r, r * (0.55 + rnd() * 0.7), rnd() * 3.14, 0, 6.283)
      g.fill()
    }
  }

  const { rootRef } = useNarrative({
    pages: 11,
    onFrame: (p, dt, t) => {
      sceneRef.current?.update(p, dt, t)

      const cv = ashRef.current
      if (cv) {
        const want = Math.pow(clamp01(seg(p, ASH_A, ASH_B)), 1.35)
        const st = ash.current
        if (want < st.drawn - 0.004) {
          cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height)
          st.rnd = mulberry32(404)
          st.drawn = 0
          stamp(0, want)
          st.drawn = want
        } else if (want > st.drawn) {
          stamp(st.drawn, want)
          st.drawn = want
        }
        cv.style.opacity = String(1 - smoothstep(seg(p, 0.79, 0.87)))
      }

      const glow = rootRef.current?.querySelector<HTMLElement>('.ember-glow')
      if (glow) glow.style.opacity = String(Math.sin(seg(p, 0.42, 0.78) * Math.PI) * 0.95)
    },
  })

  useEffect(() => {
    if (!canvasRef.current) return
    const scene = createEmberScene(canvasRef.current)
    sceneRef.current = scene
    const onResize = () => {
      scene.resize()
      const cv = ashRef.current
      if (cv) {
        cv.width = Math.min(1920, window.innerWidth * 1.2)
        cv.height = Math.min(1200, window.innerHeight * 1.2)
        ash.current.drawn = 0
        ash.current.rnd = mulberry32(404)
      }
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  return (
    <div ref={rootRef} className="ember-root">
      <div className="stage">
        <canvas ref={canvasRef} className="full-canvas" />
        <div className="ember-glow" />
        <div className="vignette" />

        {/* ---------- 01 canopy ---------- */}
        <Beat a={-0.04} b={0.075} className="center-col" style={{ textAlign: 'center' }} hold={0.3}>
          <div className="micro" style={{ opacity: 0.7, marginBottom: 18 }}>
            ORION-PS-03 · Earth observation · Forest intelligence
          </div>
          <div className="display t-hero em-title">SYLVASENSE</div>
        </Beat>

        <Beat a={0.055} b={0.2} className="center-col" style={{ textAlign: 'center' }} mode="scale">
          <div className="display t-big em-title">
            EVERY LEAF IS A<br />
            MEASUREMENT<br />
            NOBODY TOOK
          </div>
          <div className="em-sub t-body">
            {SITE.name} · {SITE.region}. A single monitoring cell holds more living structure than any
            survey team has ever walked.
          </div>
        </Beat>

        {/* ---------- 02 interior ---------- */}
        <Beat a={0.17} b={0.3} className="em-left">
          <div className="micro em-tag">Interior · 11:04 local</div>
          <div className="display t-mid em-title">
            1,184,600 HECTARES.
            <br />
            ONE ROAD IN.
          </div>
          <p className="em-body t-body">
            Field inventory covers a fraction of one percent of this canopy each year. Everything else is
            inferred, estimated, or simply assumed to still be standing.
          </p>
        </Beat>

        {/* ---------- 03 the cut ---------- */}
        <Beat a={0.31} b={0.47} className="center-col" style={{ textAlign: 'center' }} mode="scale">
          <div className="display t-big em-title em-warm">THE CUT DOES NOT<br />ANNOUNCE ITSELF</div>
        </Beat>

        <Beat a={0.34} b={0.5} className="em-readout">
          <div className="em-ro-row">
            <span className="micro">Canopy removed</span>
            <span className="mono em-ro-val">
              <Counter from={0} to={38412} a={0.34} b={0.5} suffix=" ha" />
            </span>
          </div>
          <div className="rule" />
          <div className="em-ro-row">
            <span className="micro">Stems lost</span>
            <span className="mono em-ro-val">
              <Counter from={0} to={904_118} a={0.34} b={0.5} />
            </span>
          </div>
          <div className="rule" />
          <div className="em-ro-row">
            <span className="micro">Days before anyone noticed</span>
            <span className="mono em-ro-val">
              <Counter from={0} to={214} a={0.36} b={0.5} />
            </span>
          </div>
        </Beat>

        {/* ---------- 04 combustion ---------- */}
        <Beat a={0.48} b={0.63} className="center-col" style={{ textAlign: 'center' }} mode="scale">
          <div className="display t-hero em-title em-hot">THEN IT BURNS</div>
          <div className="em-sub t-body">
            Above-ground biomass does not disappear. It changes address — from trunk to atmosphere, in
            about forty minutes.
          </div>
        </Beat>

        <Beat a={0.53} b={0.65} className="em-right">
          <div className="micro em-tag">Released</div>
          <div className="display em-huge em-hot">
            <Counter from={0} to={41.9} a={0.53} b={0.64} decimals={1} />
          </div>
          <div className="micro" style={{ opacity: 0.66 }}>
            Mt CO₂e · cumulative, this cell
          </div>
        </Beat>

        {/* ---------- 05 fallout: this headline gets buried ---------- */}
        <Beat a={0.615} b={0.8} className="center-col" style={{ textAlign: 'center' }} hold={0.16}>
          <div className="display t-big em-title em-bone">
            WE ONLY PROTECT
            <br />
            WHAT WE MEASURE
          </div>
        </Beat>

        {/* ---------- 06 re-observation ---------- */}
        <Beat a={0.795} b={0.9} className="center-col" style={{ textAlign: 'center' }} mode="scale">
          <div className="display t-big em-title em-cool">ASH IS ALSO DATA</div>
          <div className="em-sub t-body">
            Every five days a Sentinel-2 pass re-photographs this ground at ten metres. The same particles
            that buried the sentence become the pixels that prove it.
          </div>
        </Beat>

        {/* ---------- 07 sylvasense ---------- */}
        <Beat a={0.885} b={0.952} className="em-left" mode="left">
          <div className="micro em-tag">Instance segmentation · live</div>
          <div className="display t-mid em-title em-cool">
            EVERY CROWN,
            <br />
            COUNTED
          </div>
          <p className="em-body t-body">
            Canopy polygons are extracted per crown, matched to LiDAR height, and converted to
            above-ground biomass. What the fire took is now a quantity with a confidence interval.
          </p>
        </Beat>

        <Beat a={0.905} b={1} className="em-metrics">
          <Metric label="Trees detected" value={METRICS.treesDetected.toLocaleString('en-US')} note="instance segmentation" />
          <Metric label="Mean canopy height" value={`${METRICS.meanCanopyHeightM} m`} note="LiDAR-calibrated CHM" />
          <Metric label="Above-ground biomass" value={`${METRICS.agbTHa} t/ha`} note="allometric, RMSE 12.4" />
          <Metric label="Carbon stock" value={`${METRICS.carbonStockMtC} Mt C`} note="remaining, this cell" />
          <Metric label="Active degradation" value={`${METRICS.degradationZones} zones`} note="last 30 days" />
          <Metric label="Detection confidence" value={`${(METRICS.meanConfidence * 100).toFixed(1)}%`} note="mean, validated subset" />
        </Beat>

        <Beat a={0.962} b={1} className="em-closer" mode="up" hold={0.34}>
          <div className="display t-mid em-title">SYLVASENSE</div>
          <div className="micro" style={{ opacity: 0.7, marginTop: 10 }}>
            {SITE.id} · {SITE.tile} · {SITE.epsg} · revisit {METRICS.revisitDays} d
          </div>
        </Beat>

        <canvas ref={ashRef} className="ash-cover" />
        <div className="noise-layer" />
      </div>

      <ConceptChrome index="Concept 01" title="Ember" chapters={CHAPTERS} accent="#ff7a3c" />
      <ScrollTrack pages={11} />
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="em-metric">
      <div className="micro em-metric-label">{label}</div>
      <div className="mono em-metric-value">{value}</div>
      <div className="micro em-metric-note">{note}</div>
    </div>
  )
}
