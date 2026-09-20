'use client'

import { useEffect, useRef } from 'react'
import { createRingsRenderer, RingsRenderer, yearAt } from './renderer'
import { useNarrative, setText } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { clamp01, seg, smoothstep } from '../lib/math'
import { CANOPY_SERIES, METRICS, RING_SERIES, SENSORS, SITE } from '../lib/data'
import './rings.css'

const CHAPTERS = [
  { at: 0, label: '01 / Crown' },
  { at: 0.1, label: '02 / Descent' },
  { at: 0.2, label: '03 / The cut' },
  { at: 0.28, label: '04 / 224 rings' },
  { at: 0.56, label: '05 / End of record' },
  { at: 0.67, label: '06 / The same ledger' },
  { at: 0.8, label: '07 / Sensor stack' },
  { at: 0.92, label: '08 / SylvaSense' },
]

export default function Rings() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendRef = useRef<RingsRenderer | null>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const yearRef = useRef<HTMLDivElement>(null)
  const widthRef = useRef<HTMLSpanElement>(null)
  const eventRef = useRef<HTMLSpanElement>(null)
  const coverRef = useRef<HTMLSpanElement>(null)

  const { rootRef } = useNarrative({
    pages: 12,
    onFrame: (p, _dt, t) => {
      rendRef.current?.draw(p, t)

      // live dendro readout — not a beat, it tracks the scroll continuously
      const ro = readoutRef.current
      if (ro) {
        const vis = smoothstep(seg(p, 0.26, 0.31)) * (1 - smoothstep(seg(p, 0.86, 0.94)))
        ro.style.opacity = vis.toFixed(3)
        ro.style.visibility = vis < 0.005 ? 'hidden' : 'visible'
        if (vis > 0.005) {
          const y = yearAt(p)
          const rec = RING_SERIES[Math.min(RING_SERIES.length - 1, y - RING_SERIES[0].year)]
          if (yearRef.current && yearRef.current.textContent !== String(y)) setText(yearRef.current, String(y))
          if (widthRef.current) setText(widthRef.current, `${rec.width.toFixed(2)} mm`)
          if (eventRef.current) {
            const label = rec.scar === 2 ? 'Fire scar' : rec.scar === 1 ? 'Drought' : 'Nominal growth'
            if (eventRef.current.textContent !== label) setText(eventRef.current, label)
            eventRef.current.style.color = rec.scar === 2 ? '#ff7a4d' : rec.scar === 1 ? '#f2b134' : 'rgba(224,232,226,0.62)'
          }
          if (coverRef.current) {
            const c = CANOPY_SERIES.find((s) => s.year === y)
            setText(coverRef.current, c ? `${c.cover.toFixed(1)} %` : '— no orbital record')
          }
        }
      }
    },
  })

  useEffect(() => {
    if (!canvasRef.current) return
    const r = createRingsRenderer(canvasRef.current)
    rendRef.current = r
    const onResize = () => r.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      r.dispose()
      rendRef.current = null
    }
  }, [])

  return (
    <div ref={rootRef} className="rings-root">
      <div className="stage">
        <canvas ref={canvasRef} className="full-canvas" />

        {/* ---------- 01 crown ---------- */}
        <Beat a={-0.04} b={0.075} className="rg-center" hold={0.3}>
          <div className="micro rg-eyebrow">ORION-PS-03 · SylvaSense · Dendro-orbital record</div>
          <h1 className="editorial rg-h1">
            The oldest dataset in the forest
            <br />
            <em>is the forest.</em>
          </h1>
        </Beat>

        <Beat a={0.06} b={0.17} className="rg-center">
          <p className="rg-lede">
            A tree writes one line a year. Width is rainfall. Char is fire. The sequence is unbroken and
            entirely honest — and to read it we have always had to end it.
          </p>
        </Beat>

        {/* ---------- 02 descent ---------- */}
        <Beat a={0.12} b={0.21} className="rg-left">
          <div className="micro rg-tag">Descent · bark surface</div>
          <h2 className="editorial rg-h2">224 years of record, stored in a column of cellulose.</h2>
        </Beat>

        {/* ---------- 03 the cut ---------- */}
        <Beat a={0.215} b={0.3} className="rg-center" mode="scale">
          <h2 className="editorial rg-h2 rg-wide">One cut buys you one point.</h2>
        </Beat>

        {/* ---------- 04 reading the rings ---------- */}
        <Beat a={0.3} b={0.39} className="rg-note rg-note-a">
          <div className="micro rg-note-k">Wide ring</div>
          <div className="rg-note-v">Wet season. Full canopy. Maximum photosynthetic gain.</div>
        </Beat>

        <Beat a={0.39} b={0.48} className="rg-note rg-note-b">
          <div className="micro rg-note-k">Compressed ring</div>
          <div className="rg-note-v">
            Drought. Growth falls by more than half — the stand is stressed long before it is visibly
            thinner.
          </div>
        </Beat>

        <Beat a={0.47} b={0.57} className="rg-note rg-note-c">
          <div className="micro rg-note-k">Charred wedge</div>
          <div className="rg-note-v">
            Fire. 1847, 1889, 1926, 1963, 1998, 2010, 2016, 2024 — the interval is shortening.
          </div>
        </Beat>

        {/* ---------- 05 end of record ---------- */}
        <Beat a={0.575} b={0.665} className="rg-center rg-upper" mode="scale">
          <h2 className="editorial rg-h1">
            The record ends
            <br />
            <em>where the tree does.</em>
          </h2>
          <p className="rg-lede rg-narrow">
            One stem, felled, dated, catalogued. Behind it stand{' '}
            <span className="mono rg-inline">{METRICS.treesDetected.toLocaleString('en-US')}</span> others in
            this cell alone, none of which can be read this way.
          </p>
        </Beat>

        {/* ---------- 06 the same ledger ---------- */}
        <Beat a={0.67} b={0.79} className="rg-center rg-upper" mode="scale">
          <h2 className="editorial rg-h1 rg-cool">Orbit keeps the same ledger.</h2>
          <p className="rg-lede rg-narrow">
            Since 1984 this ground has been re-photographed{' '}
            <span className="mono rg-inline">
              <Counter from={0} to={2118} a={0.69} b={0.78} />
            </span>{' '}
            times. Every pass writes a ring of its own — and none of them require the tree to die.
          </p>
        </Beat>

        {/* ---------- 07 sensor stack ---------- */}
        <Beat a={0.795} b={0.925} className="rg-sensors">
          <div className="micro rg-tag">Concentric bands · outer disc</div>
          {SENSORS.map((s) => (
            <div key={s.key} className="rg-sensor">
              <span className="rg-swatch" style={{ background: s.color }} />
              <span className="mono rg-sensor-name">{s.name}</span>
              <span className="micro rg-sensor-meta">
                {s.mode} · {s.res} · {s.revisit}
              </span>
              <span className="rg-sensor-reads">{s.reads}</span>
            </div>
          ))}
        </Beat>

        {/* ---------- 08 sylvasense ---------- */}
        <Beat a={0.905} b={1} className="rg-left" mode="left">
          <div className="micro rg-tag">SylvaSense · fused record</div>
          <h2 className="editorial rg-h2 rg-cool">
            A ring for every year,
            <br />
            written from above.
          </h2>
        </Beat>

        <Beat a={0.925} b={1} className="rg-metrics">
          <Row k="Canopy cover 1990" v={`${METRICS.canopyCoverPct1990} %`} />
          <Row k="Canopy cover 2026" v={`${METRICS.canopyCoverPct} %`} alarm />
          <Row k="Above-ground biomass" v={`${METRICS.agbTHa} t/ha`} />
          <Row k="Carbon released" v={`${METRICS.carbonLostMtC} Mt C`} alarm />
          <Row k="Degradation zones" v={`${METRICS.degradationZones}`} />
          <Row k="Revisit interval" v={`${METRICS.revisitDays} days`} />
        </Beat>

        <Beat a={0.96} b={1} className="rg-closer" hold={0.34}>
          <div className="display rg-mark">SYLVASENSE</div>
          <div className="micro rg-closer-meta">
            {SITE.id} · {SITE.bbox} · {SITE.epsg}
          </div>
        </Beat>

        {/* live readout — continuous, not a beat */}
        <div ref={readoutRef} className="rg-readout">
          <div className="micro rg-readout-k">Ring year</div>
          <div ref={yearRef} className="mono rg-year">
            1802
          </div>
          <div className="rg-readout-row">
            <span className="micro">Ring width</span>
            <span ref={widthRef} className="mono rg-readout-v">
              —
            </span>
          </div>
          <div className="rg-readout-row">
            <span className="micro">Signal</span>
            <span ref={eventRef} className="mono rg-readout-v">
              —
            </span>
          </div>
          <div className="rg-readout-row">
            <span className="micro">Orbital canopy cover</span>
            <span ref={coverRef} className="mono rg-readout-v">
              —
            </span>
          </div>
        </div>

        <div className="noise-layer" />
      </div>

      <ConceptChrome index="Concept 02" title="Growth Rings" chapters={CHAPTERS} accent="#e8b96a" />
      <ScrollTrack pages={12} />
    </div>
  )
}

function Row({ k, v, alarm }: { k: string; v: string; alarm?: boolean }) {
  return (
    <div className="rg-mrow">
      <span className="micro">{k}</span>
      <span className="mono rg-mval" style={alarm ? { color: '#ff7a4d' } : undefined}>
        {v}
      </span>
    </div>
  )
}

void clamp01
