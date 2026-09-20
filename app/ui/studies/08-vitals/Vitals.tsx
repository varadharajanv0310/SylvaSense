'use client'

import { useEffect, useRef } from 'react'
import { createVitalsScene, VitalsScene } from './scene'
import { drawTraces } from './traces'
import { CELLS, fmtYear, statusOf, yearForScroll } from './cells'
import { useNarrative, setText } from '../lib/narrative'
import { Beat, ConceptChrome, ScrollTrack } from '../lib/ui'
import { seg, smoothstep } from '../lib/math'
import { METRICS, SITE } from '../lib/data'
import './vitals.css'

const CHAPTERS = [
  { at: 0, label: '01 / Pulse' },
  { at: 0.08, label: '02 / One year, one breath' },
  { at: 0.24, label: '03 / Twelve rhythms' },
  { at: 0.44, label: '04 / Arrhythmia' },
  { at: 0.6, label: '05 / Cells that stopped' },
  { at: 0.72, label: '06 / Four channels' },
  { at: 0.86, label: '07 / SylvaSense' },
]

export default function Vitals() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const traceRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<VitalsScene | null>(null)

  const yearRef = useRef<HTMLDivElement>(null)
  const nomRef = useRef<HTMLSpanElement>(null)
  const strRef = useRef<HTMLSpanElement>(null)
  const lostRef = useRef<HTMLSpanElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)

  const { rootRef } = useNarrative({
    pages: 14,
    onFrame: (p, dt, t) => {
      sceneRef.current?.update(p, dt, t)
      drawTraces(traceRef.current, p)

      const year = yearForScroll(p)
      if (yearRef.current) {
        const txt = fmtYear(year)
        if (yearRef.current.textContent !== txt) setText(yearRef.current, txt)
      }

      let nom = 0
      let str = 0
      let lost = 0
      for (const c of CELLS) {
        const s = statusOf(c, year)
        if (s === 'lost') lost++
        else if (s === 'stressed') str++
        else nom++
      }
      if (nomRef.current) setText(nomRef.current, String(nom))
      if (strRef.current) setText(strRef.current, String(str))
      if (lostRef.current) setText(lostRef.current, String(lost))

      if (readoutRef.current) {
        const vis = smoothstep(seg(p, 0.16, 0.24)) * (1 - smoothstep(seg(p, 0.94, 1)))
        readoutRef.current.style.opacity = vis.toFixed(3)
      }

      if (alertRef.current) {
        const vis = smoothstep(seg(p, 0.755, 0.8)) * (1 - smoothstep(seg(p, 0.86, 0.91)))
        alertRef.current.style.opacity = (vis * (0.62 + 0.38 * Math.sin(t * 4.4))).toFixed(3)
        alertRef.current.style.visibility = vis < 0.01 ? 'hidden' : 'visible'
      }
    },
  })

  useEffect(() => {
    if (!canvasRef.current) return
    const s = createVitalsScene(canvasRef.current)
    sceneRef.current = s
    const onResize = () => {
      s.resize()
      const cv = traceRef.current
      if (cv) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
        cv.width = Math.max(2, Math.round(window.innerWidth * dpr))
        cv.height = Math.max(2, Math.round(window.innerHeight * dpr))
        cv.style.width = window.innerWidth + 'px'
        cv.style.height = window.innerHeight + 'px'
        cv.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      s.dispose()
      sceneRef.current = null
    }
  }, [])

  return (
    <div ref={rootRef} className="vt-root">
      <div className="stage">
        <canvas ref={canvasRef} className="full-canvas" />
        <canvas ref={traceRef} className="vt-traces" />
        <div className="vignette" />

        {/* live patient readout */}
        <div ref={readoutRef} className="vt-readout">
          <div ref={yearRef} className="mono vt-year">
            1984-01
          </div>
          <div className="vt-counts">
            <Count k="Nominal" v={<span ref={nomRef}>12</span>} tone="ok" />
            <Count k="Unstable" v={<span ref={strRef}>0</span>} tone="warn" />
            <Count k="Stopped" v={<span ref={lostRef}>0</span>} tone="bad" />
          </div>
        </div>

        <div ref={alertRef} className="vt-alert">
          <span className="micro">Threshold breach</span>
          <span className="mono vt-alert-v">C-08 · NDVI 0.594 &lt; 0.620 · 41 days</span>
        </div>

        {/* ---------- typography ---------- */}

        <Beat a={-0.04} b={0.06} className="vt-left" hold={0.3}>
          <div className="micro vt-eyebrow">SylvaSense · ORION-PS-03 · {SITE.id}</div>
          <h1 className="vt-h1">
            A forest
            <br />
            has a pulse.
          </h1>
          <p className="vt-body">
            {METRICS.annualSequestrationMtCO2} megatonnes of CO₂, drawn in and released on a twelve-month
            cycle. It is regular enough to set a watch by, and it is visible from 786 kilometres up.
          </p>
        </Beat>

        <Beat a={0.09} b={0.2} className="vt-left">
          <div className="micro vt-tag">One year · one breath</div>
          <h2 className="vt-h2">Wet season, dry season, repeat.</h2>
          <p className="vt-body">
            A healthy closed canopy swings about six hundredths of an NDVI unit between its wettest and
            driest month, and it does it at the same time every year.
          </p>
        </Beat>

        <Beat a={0.25} b={0.4} className="vt-left">
          <div className="micro vt-tag">1985 → 2026 · twelve cells</div>
          <h2 className="vt-h2">
            Twelve rhythms.
            <br />
            One climate.
          </h2>
          <p className="vt-body">
            Each trace is a monitoring cell of roughly one hundred thousand hectares. For twenty years
            they beat together.
          </p>
        </Beat>

        <Beat a={0.44} b={0.58} className="vt-left">
          <div className="micro vt-tag vt-warn">Arrhythmia</div>
          <h2 className="vt-h2 vt-warn">This is not a season.</h2>
          <p className="vt-body">
            The swing widens, the peak arrives late, and the recovery never quite completes. A stand under
            selective logging is audibly wrong on this chart years before its canopy cover changes enough
            to trip a threshold.
          </p>
        </Beat>

        <Beat a={0.6} b={0.7} className="vt-left">
          <div className="micro vt-tag vt-bad">Flatlined</div>
          <h2 className="vt-h2">Six cells stopped.</h2>
          <div className="vt-lost">
            {CELLS.filter((c) => c.death !== null).map((c) => (
              <div key={c.id} className="vt-lost-row">
                <span className="mono vt-lost-id">{c.id}</span>
                <span className="vt-lost-name">{c.name}</span>
                <span className="mono vt-lost-date">{fmtYear(c.death as number)}</span>
                <span className="micro vt-lost-ha">{c.areaHa.toLocaleString('en-US')} ha</span>
              </div>
            ))}
          </div>
        </Beat>

        <Beat a={0.72} b={0.85} className="vt-left">
          <div className="micro vt-tag">Cell C-08 · Interfluve · 141,300 ha</div>
          <h2 className="vt-h2">Four channels. One patient.</h2>
          <p className="vt-body">
            Greenness, moisture, radar backscatter and canopy height, read continuously for the same
            ground. No single channel is conclusive. Together they are a diagnosis.
          </p>
        </Beat>

        <Beat a={0.87} b={1} className="vt-left">
          <div className="micro vt-eyebrow">SylvaSense</div>
          <h2 className="vt-h1">
            Continuous,
            <br />
            not a snapshot.
          </h2>
          <p className="vt-body">
            Monitoring is not an annual report. It is a signal with a threshold and a duty cycle, and the
            useful question is never how much forest there is — it is whether the rhythm changed last
            month.
          </p>
        </Beat>

        <Beat a={0.9} b={1} className="vt-metrics">
          <M k="Cells monitored" v="12" />
          <M k="Still nominal" v="3" tone="ok" />
          <M k="Unstable" v="3" tone="warn" />
          <M k="Stopped" v="6" tone="bad" />
          <M k="Sequestration" v={`${METRICS.annualSequestrationMtCO2} Mt CO₂/yr`} />
          <M k="Alert latency" v="6 days" />
        </Beat>
      </div>

      <ConceptChrome index="Concept 08" title="Vitals" chapters={CHAPTERS} accent="#7af0b4" />
      <ScrollTrack pages={14} />
    </div>
  )
}

function Count({ k, v, tone }: { k: string; v: React.ReactNode; tone: string }) {
  return (
    <div className={`vt-count vt-${tone}`}>
      <span className="mono vt-count-v">{v}</span>
      <span className="micro vt-count-k">{k}</span>
    </div>
  )
}

function M({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="vt-m">
      <div className="micro vt-m-k">{k}</div>
      <div className={`mono vt-m-v ${tone ? 'vt-' + tone : ''}`}>{v}</div>
    </div>
  )
}
