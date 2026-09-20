'use client'

import { useEffect, useRef } from 'react'
import { createNightScene, NightScene } from './scene'
import { useNarrative, setText } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { lerp, seg, smoothstep } from '../lib/math'
import { ALERTS, METRICS, SENSORS, SITE } from '../lib/data'
import './nightwatch.css'

const CHAPTERS = [
  { at: 0, label: '01 / 18:42 civil twilight' },
  { at: 0.14, label: '02 / Last light' },
  { at: 0.3, label: '03 / Zero observable hectares' },
  { at: 0.44, label: '04 / Descending pass' },
  { at: 0.63, label: '05 / One ground, four physics' },
  { at: 0.79, label: '06 / Structure' },
  { at: 0.91, label: '07 / SylvaSense' },
]

export default function NightWatch() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<NightScene | null>(null)
  const telRef = useRef<HTMLDivElement>(null)
  const sweepRef = useRef<HTMLSpanElement>(null)
  const haRef = useRef<HTMLSpanElement>(null)
  const sigmaRef = useRef<HTMLSpanElement>(null)
  const clockRef = useRef<HTMLDivElement>(null)

  const { rootRef } = useNarrative({
    pages: 13,
    onFrame: (p, _dt, t) => {
      sceneRef.current?.update(p, _dt, t)

      // the clock runs from dusk into night as you scroll
      if (clockRef.current) {
        const vis = 1 - smoothstep(seg(p, 0.42, 0.5))
        clockRef.current.style.opacity = (vis * 0.85).toFixed(3)
        const mins = lerp(18 * 60 + 42, 23 * 60 + 10, smoothstep(seg(p, 0, 0.4)))
        const hh = String(Math.floor(mins / 60)).padStart(2, '0')
        const mm = String(Math.floor(mins % 60)).padStart(2, '0')
        const txt = `${hh}:${mm} local`
        if (clockRef.current.textContent !== txt) setText(clockRef.current, txt)
      }

      // radar telemetry tracks the wavefront continuously
      const tel = telRef.current
      if (tel) {
        const vis = smoothstep(seg(p, 0.43, 0.48)) * (1 - smoothstep(seg(p, 0.64, 0.7)))
        tel.style.opacity = vis.toFixed(3)
        tel.style.visibility = vis < 0.005 ? 'hidden' : 'visible'
        if (vis > 0.005) {
          const s = seg(p, 0.44, 0.62)
          if (sweepRef.current) setText(sweepRef.current, `${(s * 100).toFixed(1)} %`)
          if (haRef.current) setText(haRef.current, `${Math.round(s * 1841).toLocaleString('en-US')} ha`)
          if (sigmaRef.current) setText(sigmaRef.current, `${(-6.4 - Math.sin(t * 2.2) * 1.8 - s * 4.1).toFixed(1)} dB`)
        }
      }
    },
  })

  useEffect(() => {
    if (!canvasRef.current) return
    const s = createNightScene(canvasRef.current)
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
    <div ref={rootRef} className="nw-root">
      <div className="stage">
        <canvas ref={canvasRef} className="full-canvas" />
        <div className="nw-scan" />
        <div className="vignette" />

        <div ref={clockRef} className="micro nw-clock">
          18:42 local
        </div>

        {/* ---------- 01 twilight ---------- */}
        <Beat a={-0.04} b={0.08} className="nw-center" hold={0.3}>
          <div className="micro nw-eyebrow">SylvaSense · ORION-PS-03 · {SITE.id}</div>
          <h1 className="nw-h1">
            The forest is loudest
            <br />
            when you cannot see it.
          </h1>
        </Beat>

        <Beat a={0.07} b={0.19} className="nw-center">
          <p className="nw-lede">
            {SITE.name}. {SITE.areaHa.toLocaleString('en-US')} hectares of closed canopy, eleven ranger
            posts, one access road.
          </p>
        </Beat>

        {/* ---------- 02 last light ---------- */}
        <Beat a={0.18} b={0.3} className="nw-left">
          <div className="micro nw-tag">Last light · 19:06</div>
          <h2 className="nw-h2">Ground truth keeps office hours.</h2>
          <p className="nw-body">
            Patrols stand down at dusk. Optical satellites need sunlight and a clear sky. Both conditions
            fail for roughly two-thirds of every tropical year.
          </p>
        </Beat>

        {/* ---------- 03 blind ---------- */}
        <Beat a={0.3} b={0.42} className="nw-center" hold={0.2}>
          <div className="nw-zero mono">0.00 ha</div>
          <div className="micro nw-zero-note">observable, all sensors, 23:10 local</div>
        </Beat>

        <Beat a={0.345} b={0.435} className="nw-whisper">
          <p className="nw-body">
            Something is happening out there right now. You are looking directly at it.
          </p>
        </Beat>

        {/* ---------- 04 the pass ---------- */}
        <Beat a={0.44} b={0.545} className="nw-center-top" mode="scale">
          <h2 className="nw-h1 nw-cool">
            C-band does not
            <br />
            need the sun.
          </h2>
        </Beat>

        <Beat a={0.55} b={0.645} className="nw-center-top">
          <p className="nw-lede">
            Sentinel-1 illuminates the canopy itself. Rough forest scatters the pulse back. Bare ground
            reflects it away and returns almost nothing — so a clearing arrives as a hole in the signal.
          </p>
        </Beat>

        <Beat a={0.555} b={0.64} className="nw-alerts">
          <div className="micro nw-tag">Detections this pass</div>
          {ALERTS.slice(0, 4).map((a) => (
            <div key={a.id} className="nw-alert">
              <span className="mono nw-alert-id">{a.id}</span>
              <span className="nw-alert-type">{a.type}</span>
              <span className="mono nw-alert-ha">{a.ha.toFixed(1)} ha</span>
              <span className="micro nw-alert-conf">conf {(a.conf * 100).toFixed(0)}%</span>
            </div>
          ))}
        </Beat>

        {/* ---------- 05 four physics ---------- */}
        <Beat a={0.645} b={0.78} className="nw-left">
          <div className="micro nw-tag">Fusion stack</div>
          <h2 className="nw-h2 nw-cool">
            One ground.
            <br />
            Four physics.
          </h2>
          <div className="nw-stack">
            {SENSORS.map((s) => (
              <div key={s.key} className="nw-stack-row">
                <span className="nw-dot" style={{ background: s.color }} />
                <span className="mono nw-stack-name">{s.name}</span>
                <span className="micro nw-stack-meta">
                  {s.band} · {s.res}
                </span>
              </div>
            ))}
          </div>
        </Beat>

        {/* ---------- 06 structure ---------- */}
        <Beat a={0.79} b={0.9} className="nw-center-top" mode="scale">
          <h2 className="nw-h1 nw-cool">Structure, not colour.</h2>
          <p className="nw-lede">
            Height is the variable that carries biomass. Fused returns give a canopy height model at
            sub-metre vertical resolution, and biomass follows from height and crown area.
          </p>
        </Beat>

        <Beat a={0.815} b={0.91} className="nw-readout-right">
          <Row k="Mean canopy height" v={`${METRICS.meanCanopyHeightM} m`} />
          <Row k="P95 height" v="41.2 m" />
          <Row k="Above-ground biomass" v={`${METRICS.agbTHa} t/ha`} />
          <Row k="Carbon stock" v={`${METRICS.carbonStockMtC} Mt C`} />
        </Beat>

        {/* ---------- 07 sylvasense ---------- */}
        <Beat a={0.915} b={1} className="nw-center-top" mode="scale">
          <div className="micro nw-eyebrow">SylvaSense</div>
          <h2 className="nw-h1">
            <span className="mono nw-big-num">
              <Counter from={0} to={METRICS.treesDetected} a={0.92} b={0.985} />
            </span>
            <br />
            crowns, individually indexed.
          </h2>
        </Beat>

        <Beat a={0.945} b={1} className="nw-footer" hold={0.3}>
          <div className="micro">
            Revisit {METRICS.revisitDays} days · mean confidence {(METRICS.meanConfidence * 100).toFixed(1)}% ·{' '}
            {METRICS.alertsLast30d} alerts in the last 30 days · {SITE.epsg}
          </div>
        </Beat>

        {/* continuous radar telemetry */}
        <div ref={telRef} className="nw-telemetry">
          <div className="micro nw-tag">Sentinel-1A · IW · VV+VH · descending</div>
          <div className="nw-tel-row">
            <span className="micro">Swath progress</span>
            <span ref={sweepRef} className="mono nw-tel-v">
              0.0 %
            </span>
          </div>
          <div className="nw-tel-row">
            <span className="micro">Low-backscatter area</span>
            <span ref={haRef} className="mono nw-tel-v nw-warn">
              0 ha
            </span>
          </div>
          <div className="nw-tel-row">
            <span className="micro">σ⁰ VH</span>
            <span ref={sigmaRef} className="mono nw-tel-v">
              −6.4 dB
            </span>
          </div>
          <div className="nw-tel-row">
            <span className="micro">Incidence</span>
            <span className="mono nw-tel-v">38.7°</span>
          </div>
        </div>
      </div>

      <ConceptChrome index="Concept 03" title="Night Watch" chapters={CHAPTERS} accent="#8fb3ff" />
      <ScrollTrack pages={13} />
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="nw-tel-row">
      <span className="micro">{k}</span>
      <span className="mono nw-tel-v">{v}</span>
    </div>
  )
}
