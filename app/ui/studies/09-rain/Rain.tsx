'use client'

import { useEffect, useRef } from 'react'
import { createRainScene, RainScene } from './scene'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { seg, smoothstep } from '../lib/math'
import { METRICS, SITE } from '../lib/data'
import './rain.css'

const CHAPTERS = [
  { at: 0, label: '01 / Wet canopy · 06:10' },
  { at: 0.14, label: '02 / The column' },
  { at: 0.34, label: '03 / The flying river' },
  { at: 0.5, label: '04 / Return' },
  { at: 0.62, label: '05 / The loop opens' },
  { at: 0.78, label: '06 / Feedback' },
  { at: 0.88, label: '07 / SylvaSense' },
]

export default function Rain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<RainScene | null>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const altRef = useRef<HTMLDivElement>(null)
  const fluxRef = useRef<HTMLSpanElement>(null)
  const phaseRef = useRef<HTMLSpanElement>(null)

  const { rootRef } = useNarrative({
    pages: 13,
    onFrame: (p, dt, t) => {
      sceneRef.current?.update(p, dt, t)
      const st = sceneRef.current?.readState()
      if (readoutRef.current && st) {
        const vis = smoothstep(seg(p, 0.1, 0.17)) * (1 - smoothstep(seg(p, 0.9, 0.96)))
        readoutRef.current.style.opacity = vis.toFixed(3)
        if (vis > 0.01) {
          setText(altRef.current, st.altitude < 1000 ? `${Math.round(st.altitude)} m` : `${(st.altitude / 1000).toFixed(1)} km`)
          setText(fluxRef.current, `${st.flux.toFixed(1)} Gt/day`)
          if (fluxRef.current) fluxRef.current.style.color = p > 0.66 ? '#e0a765' : '#8fe8de'
          const phase =
            p < 0.32 ? 'Evapotranspiration' : p < 0.5 ? 'Advection' : p < 0.62 ? 'Precipitation' : p < 0.8 ? 'Loop failing' : 'Monitored'
          setText(phaseRef.current, phase)
        }
      }
    },
  })

  useEffect(() => {
    if (!canvasRef.current) return
    const s = createRainScene(canvasRef.current)
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
    <div ref={rootRef} className="rn-root">
      <div className="stage">
        <canvas ref={canvasRef} className="full-canvas" />
        <div className="vignette" />

        {/* ---------- 01 the wet canopy ---------- */}
        <Beat a={-0.04} b={0.08} className="rn-centre" hold={0.3}>
          <div className="micro rn-eyebrow">ORION-PS-03 · SylvaSense · {SITE.name}, 06:10</div>
          <h1 className="rn-h1">
            A forest does not
            <br />
            wait for rain.
          </h1>
          <p className="rn-lede">It makes it.</p>
        </Beat>

        <Beat a={0.09} b={0.2} className="rn-left">
          <div className="micro rn-tag">Evapotranspiration</div>
          <h2 className="rn-h2">
            One tree.
            <br />
            <span className="mono rn-cyan">1,000 litres</span> a day.
          </h2>
          <p className="rn-body">
            Drawn up through nine metres of trunk against gravity and released as vapour through the
            leaves, every daylight hour, without a pump.
          </p>
        </Beat>

        {/* ---------- 02 the column ---------- */}
        <Beat a={0.22} b={0.33} className="rn-left">
          <div className="micro rn-tag">Rising · 26 to 120 m</div>
          <h2 className="rn-h2">Multiply it by two and a half million.</h2>
          <p className="rn-body">
            The canopy exhales a column you could see from the road if the light were right. This is the
            largest biological transfer of water on Earth, and it runs on sunlight alone.
          </p>
        </Beat>

        {/* ---------- 03 the flying river ---------- */}
        <Beat a={0.35} b={0.48} className="rn-centre" mode="scale">
          <h2 className="rn-h1">
            <span className="mono rn-cyan">
              <Counter from={0} to={20.1} a={0.35} b={0.46} decimals={1} />
            </span>{' '}
            billion tonnes a day.
          </h2>
          <p className="rn-lede">
            More water moves across this basin through the air than down the river beneath it. Hydrologists
            call them flying rivers, and they water a continent.
          </p>
        </Beat>

        {/* ---------- 04 return ---------- */}
        <Beat a={0.5} b={0.6} className="rn-left">
          <div className="micro rn-tag">Precipitation</div>
          <h2 className="rn-h2 rn-cyan">And then it comes back.</h2>
          <p className="rn-body">
            Between a quarter and a half of the rain that falls here was transpired by the forest it falls
            on. The forest is not living in this climate. It is running it.
          </p>
        </Beat>

        {/* ---------- 05 the loop opens ---------- */}
        <Beat a={0.63} b={0.76} className="rn-centre" mode="scale">
          <h2 className="rn-h1 rn-dry">Take the trees out and the loop opens.</h2>
          <p className="rn-lede">
            Cleared ground transpires almost nothing. The column thins, the cloud deck fails to form, and
            the rain that should have fallen here falls somewhere else, or not at all.
          </p>
        </Beat>

        <Beat a={0.66} b={0.78} className="rn-alarm">
          <div className="micro rn-tag rn-warn">Atmospheric flux</div>
          <div className="mono rn-huge rn-warn">
            −<Counter from={0} to={68} a={0.67} b={0.77} />%
          </div>
          <div className="micro rn-dim">over cleared cells, dry season</div>
        </Beat>

        {/* ---------- 06 feedback ---------- */}
        <Beat a={0.79} b={0.87} className="rn-left">
          <div className="micro rn-tag rn-warn">Feedback</div>
          <h2 className="rn-h2 rn-warn">Each hectare lost makes the next one drier.</h2>
          <p className="rn-body">
            A drier forest burns more easily, and a burnt forest transpires less. This is the only
            mechanism in the whole system that accelerates itself, which is why the threshold matters more
            than the total.
          </p>
        </Beat>

        {/* ---------- 07 sylvasense ---------- */}
        <Beat a={0.89} b={1} className="rn-centre" mode="scale">
          <div className="micro rn-eyebrow rn-green">SylvaSense</div>
          <h2 className="rn-h1">
            Water you cannot see
            <br />
            <span className="rn-green">is still a measurement.</span>
          </h2>
          <p className="rn-lede">
            Evapotranspiration is derived from land surface temperature and vegetation index on the same
            pass that counts the trees. When a cell stops breathing water, it shows up before it shows up
            as cover loss.
          </p>
        </Beat>

        <Beat a={0.93} b={1} className="rn-metrics">
          <M k="Basin flux" v="20.1 Gt/day" note="modelled, wet season" />
          <M k="Recycled rainfall" v="34 %" note="of local precipitation" />
          <M k="Flux over cleared cells" v="−68 %" note="dry season" alarm />
          <M k="ET product" v="500 m · 8-day" note="LST + NDVI" />
          <M k="Revisit" v={`${METRICS.revisitDays} days`} note="optical + thermal" />
        </Beat>

        {/* live readout */}
        <div ref={readoutRef} className="rn-readout">
          <div ref={altRef} className="mono rn-alt">
            16 m
          </div>
          <div className="rn-row">
            <span className="micro">Phase</span>
            <span ref={phaseRef} className="mono rn-row-v">
              Evapotranspiration
            </span>
          </div>
          <div className="rn-row">
            <span className="micro">Atmospheric flux</span>
            <span ref={fluxRef} className="mono rn-row-v">
              20.1 Gt/day
            </span>
          </div>
        </div>

        <div className="noise-layer" />
      </div>

      <ConceptChrome index="Concept 09" title="Rain" chapters={CHAPTERS} accent="#8fe8de" />
      <ScrollTrack pages={13} />
    </div>
  )
}

function M({ k, v, note, alarm }: { k: string; v: string; note: string; alarm?: boolean }) {
  return (
    <div className="rn-m">
      <div className="micro rn-m-k">{k}</div>
      <div className="mono rn-m-v" style={alarm ? { color: '#e0a765' } : undefined}>
        {v}
      </div>
      <div className="micro rn-m-n">{note}</div>
    </div>
  )
}
