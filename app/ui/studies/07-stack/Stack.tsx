'use client'

import { useEffect, useRef } from 'react'
import { createStackScene, EVENT, FIRST, formatDate, StackScene, TOTAL_OBS } from './scene'
import { useNarrative, setText } from '../lib/narrative'
import { Beat, ConceptChrome, ScrollTrack } from '../lib/ui'
import { clamp01, lerp, seg, smoothstep } from '../lib/math'
import { CANOPY_SERIES, METRICS, SITE } from '../lib/data'
import './stack.css'

const CHAPTERS = [
  { at: 0, label: '01 / Surface · 2026' },
  { at: 0.1, label: '02 / One of 2,118' },
  { at: 0.21, label: '03 / Descent' },
  { at: 0.3, label: '04 / The last green observation' },
  { at: 0.56, label: '05 / Floor · 1984' },
  { at: 0.65, label: '06 / Edge-on' },
  { at: 0.8, label: '07 / Query' },
  { at: 0.9, label: '08 / SylvaSense' },
]

export default function Stack() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const seriesRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<StackScene | null>(null)

  const dateRef = useRef<HTMLDivElement>(null)
  const idxRef = useRef<HTMLSpanElement>(null)
  const statusRef = useRef<HTMLSpanElement>(null)
  const sensorRef = useRef<HTMLSpanElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const seriesWrapRef = useRef<HTMLDivElement>(null)

  const { rootRef } = useNarrative({
    pages: 14,
    onFrame: (p, dt, t) => {
      sceneRef.current?.update(p, dt, t)
      const st = sceneRef.current?.readState()

      if (readoutRef.current) {
        const vis = smoothstep(seg(p, 0.1, 0.16)) * (1 - smoothstep(seg(p, 0.86, 0.93)))
        readoutRef.current.style.opacity = vis.toFixed(3)
      }

      if (st) {
        const txt = formatDate(st.date)
        if (dateRef.current && dateRef.current.textContent !== txt) setText(dateRef.current, txt)
        if (idxRef.current) {
          // the index counts through the full archive, not just the slices drawn
          const n = Math.round(lerp(1, TOTAL_OBS, clamp01(st.index / 259)))
          const s = `${n.toLocaleString('en-US')} / ${TOTAL_OBS.toLocaleString('en-US')}`
          if (idxRef.current.textContent !== s) setText(idxRef.current, s)
        }
        if (statusRef.current) {
          const label = st.sar ? 'Usable · all weather' : st.cloud ? 'Discarded · cloud' : 'Usable'
          if (statusRef.current.textContent !== label) setText(statusRef.current, label)
          statusRef.current.style.color = st.cloud ? '#ff7a4d' : '#7af0b4'
        }
        if (sensorRef.current) {
          const s = st.sar ? 'Sentinel-1 C-SAR' : st.date > 2015.5 ? 'Sentinel-2 MSI' : 'Landsat TM / OLI'
          if (sensorRef.current.textContent !== s) setText(sensorRef.current, s)
        }
      }

      if (seriesWrapRef.current) {
        const vis = smoothstep(seg(p, 0.81, 0.87)) * (1 - smoothstep(seg(p, 0.97, 1)))
        seriesWrapRef.current.style.opacity = vis.toFixed(3)
        seriesWrapRef.current.style.visibility = vis < 0.01 ? 'hidden' : 'visible'
        if (vis > 0.01) drawSeries(seriesRef.current, smoothstep(seg(p, 0.82, 0.93)))
      }
    },
  })

  useEffect(() => {
    if (!canvasRef.current) return
    const s = createStackScene(canvasRef.current)
    sceneRef.current = s
    const onResize = () => {
      s.resize()
      const cv = seriesRef.current
      if (cv) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
        const r = cv.getBoundingClientRect()
        cv.width = Math.max(2, Math.round(r.width * dpr))
        cv.height = Math.max(2, Math.round(r.height * dpr))
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
    <div ref={rootRef} className="sk-root">
      <div className="stage">
        <canvas ref={canvasRef} className="full-canvas" />

        {/* continuous observation readout */}
        <div ref={readoutRef} className="sk-readout">
          <div ref={dateRef} className="mono sk-date">
            2026-09-16
          </div>
          <div className="sk-rows">
            <Row k="Observation" v={<span ref={idxRef}>1 / 2,118</span>} />
            <Row k="Sensor" v={<span ref={sensorRef}>Sentinel-2 MSI</span>} />
            <Row k="Status" v={<span ref={statusRef}>Usable</span>} />
          </div>
        </div>

        {/* ---------- typography ---------- */}

        <Beat a={-0.04} b={0.075} className="sk-centre" hold={0.3}>
          <div className="micro sk-eyebrow">SylvaSense · ORION-PS-03 · {SITE.tile} · {SITE.epsg}</div>
          <h1 className="sk-h1">
            This is the forest
            <br />
            as of Wednesday.
          </h1>
          <p className="sk-lede">
            One Sentinel-2 acquisition. Ten metres per pixel. Entirely accurate, and almost entirely
            useless on its own.
          </p>
        </Beat>

        <Beat a={0.1} b={0.2} className="sk-left">
          <h2 className="sk-h2">One image is a rumour.</h2>
          <p className="sk-body">
            Every meaningful claim about a forest is a claim about change, and change needs at least two
            observations. This cell has <span className="mono sk-accent">{TOTAL_OBS.toLocaleString('en-US')}</span>,
            stacked underneath the one you are looking at.
          </p>
        </Beat>

        <Beat a={0.22} b={0.3} className="sk-left">
          <div className="micro sk-tag">Descending · optical</div>
          <h2 className="sk-h2">Most of the archive is cloud.</h2>
          <p className="sk-body">
            Roughly two in three optical passes over wet tropics return nothing usable. The observation
            exists, is catalogued, and carries no information whatsoever.
          </p>
        </Beat>

        {/* the event: findable, and worth scrolling back over */}
        <Beat a={0.305} b={0.4} className="sk-event" mode="scale">
          <div className="micro sk-event-k">Last green observation</div>
          <div className="mono sk-event-date">{formatDate(EVENT)}</div>
          <div className="sk-event-note">
            Below this slice the canopy is intact in every frame. Above it, in every frame, it is not.
          </div>
        </Beat>

        <Beat a={0.42} b={0.53} className="sk-left">
          <div className="micro sk-tag">Descending · pre-2014</div>
          <h2 className="sk-h2">Below here there is no radar.</h2>
          <p className="sk-body">
            The blue slices are Sentinel-1, and they only start in 2014 — continuous, all-weather, immune
            to cloud. For the thirty years underneath them, optical luck was the entire record.
          </p>
        </Beat>

        <Beat a={0.56} b={0.645} className="sk-centre" mode="scale">
          <div className="micro sk-tag">Floor of the cube</div>
          <h2 className="sk-h1">{formatDate(FIRST)}</h2>
          <p className="sk-lede">
            The first observation anyone made of this ground. Canopy cover{' '}
            <span className="mono sk-accent">96.2 %</span>. Everything above it is what happened next.
          </p>
        </Beat>

        <Beat a={0.665} b={0.79} className="sk-centre-top" mode="scale">
          <h2 className="sk-h1">
            Forty-two years,
            <br />
            seen edge-on.
          </h2>
          <p className="sk-lede">
            Cloud is masked out and each usable slice collapses to its own cross-section. Space runs left to
            right, time runs bottom to top, and the loss stops being an event — it becomes a shape.
          </p>
        </Beat>

        <Beat a={0.8} b={0.9} className="sk-left">
          <h2 className="sk-h2 sk-accent">Any pixel. Any date.</h2>
          <p className="sk-body">
            SylvaSense queries the cube rather than the image: one column is one hundred square metres of
            ground with a continuous forty-two year history attached to it.
          </p>
        </Beat>

        <Beat a={0.91} b={1} className="sk-metrics">
          <M k="Observations" v={TOTAL_OBS.toLocaleString('en-US')} />
          <M k="Usable optical" v="34 %" />
          <M k="Radar continuity" v="100 %" />
          <M k="Change breakpoint" v="2019-08" alarm />
          <M k="Canopy then / now" v={`${METRICS.canopyCoverPct1990} → ${METRICS.canopyCoverPct} %`} />
          <M k="Revisit" v={`${METRICS.revisitDays} days`} />
        </Beat>

        {/* the queried column's time series */}
        <div ref={seriesWrapRef} className="sk-series">
          <div className="micro sk-series-k">Column x = −34 m · NDVI, {FIRST.toFixed(0)}–2026</div>
          <canvas ref={seriesRef} className="sk-series-canvas" />
        </div>
      </div>

      <ConceptChrome index="Concept 07" title="The Stack" chapters={CHAPTERS} accent="#6fd8e8" />
      <ScrollTrack pages={14} />
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="sk-row">
      <span className="micro">{k}</span>
      <span className="mono sk-row-v">{v}</span>
    </div>
  )
}

function M({ k, v, alarm }: { k: string; v: string; alarm?: boolean }) {
  return (
    <div className="sk-m">
      <div className="micro sk-m-k">{k}</div>
      <div className="mono sk-m-v" style={alarm ? { color: '#ff7a4d' } : undefined}>
        {v}
      </div>
    </div>
  )
}

/** NDVI history for the queried column, drawn in as the query resolves. */
function drawSeries(cv: HTMLCanvasElement | null, reveal: number) {
  if (!cv) return
  const g = cv.getContext('2d')
  if (!g) return
  const W = cv.clientWidth
  const H = cv.clientHeight
  if (W < 4 || H < 4) return
  g.clearRect(0, 0, W, H)

  const pad = 10
  const x = (year: number) => pad + ((year - 1985) / (2026 - 1985)) * (W - pad * 2)
  const y = (cover: number) => H - pad - ((cover - 55) / 45) * (H - pad * 2)

  g.strokeStyle = 'rgba(255,255,255,0.1)'
  g.lineWidth = 1
  for (let c = 60; c <= 95; c += 10) {
    g.beginPath()
    g.moveTo(pad, y(c))
    g.lineTo(W - pad, y(c))
    g.stroke()
  }

  const cut = 1985 + reveal * (2026 - 1985)
  g.beginPath()
  CANOPY_SERIES.forEach((s, i) => {
    if (s.year > cut) return
    const px = x(s.year)
    const py = y(s.cover)
    if (i === 0) g.moveTo(px, py)
    else g.lineTo(px, py)
  })
  g.strokeStyle = '#7af0b4'
  g.lineWidth = 1.6
  g.stroke()

  // the detected breakpoint
  if (cut > 2019) {
    const bx = x(2019.6)
    g.setLineDash([3, 3])
    g.strokeStyle = '#ff7a4d'
    g.beginPath()
    g.moveTo(bx, pad)
    g.lineTo(bx, H - pad)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = '#ff7a4d'
    g.font = '400 8px "JetBrains Mono", monospace'
    g.fillText('BREAKPOINT', bx + 5, pad + 9)
  }

  g.fillStyle = 'rgba(255,255,255,0.32)'
  g.font = '400 8px "JetBrains Mono", monospace'
  g.fillText('1985', pad, H - 1)
  g.fillText('2026', W - pad - 22, H - 1)
}
