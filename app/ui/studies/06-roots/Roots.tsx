'use client'

import { useEffect, useRef } from 'react'
import { createRootsScene, MAX_DEPTH, RootsScene } from './scene'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { lerp, seg, smoothstep } from '../lib/math'
import { METRICS, SITE } from '../lib/data'
import './roots.css'

const CHAPTERS = [
  { at: 0, label: '01 / The floor' },
  { at: 0.14, label: '02 / Descent' },
  { at: 0.28, label: '03 / The root plate' },
  { at: 0.46, label: '04 / The network' },
  { at: 0.62, label: '05 / Soil carbon' },
  { at: 0.78, label: '06 / Overhead, unseen' },
  { at: 0.9, label: '07 / SylvaSense' },
]

export default function Roots() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<RootsScene | null>(null)
  const depthRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLSpanElement>(null)
  const carbonRef = useRef<HTMLSpanElement>(null)

  const { rootRef } = useNarrative({
    pages: 13,
    onFrame: (p, dt, t) => {
      sceneRef.current?.update(p, dt, t)
      const d = sceneRef.current?.readDepth() ?? 0

      if (readoutRef.current) {
        const vis = smoothstep(seg(p, 0.1, 0.17)) * (1 - smoothstep(seg(p, 0.92, 0.98)))
        readoutRef.current.style.opacity = vis.toFixed(3)
        if (vis > 0.01) {
          setText(depthRef.current, `−${d.toFixed(1)} m`)
          const layer =
            d < 0.3 ? 'Litter' : d < 1.1 ? 'Humus' : d < 3.4 ? 'Root plate' : d < 6.6 ? 'Mycorrhizal zone' : 'Mineral soil'
          setText(layerRef.current, layer)
          // soil organic carbon accumulates with depth, then leaves
          const held = lerp(0, 96.2, Math.min(1, d / MAX_DEPTH)) * (1 - smoothstep(seg(p, 0.8, 0.95)) * 0.62)
          setText(carbonRef.current, `${held.toFixed(1)} t/ha`)
          if (carbonRef.current) carbonRef.current.style.color = p > 0.82 ? '#ff7a4d' : '#e0a765'
        }
      }
    },
  })

  useEffect(() => {
    if (!canvasRef.current) return
    const s = createRootsScene(canvasRef.current)
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
    <div ref={rootRef} className="rt-root">
      <div className="stage">
        <canvas ref={canvasRef} className="full-canvas" />
        <div className="rt-grade" />
        <div className="vignette" />

        {/* ---------- 01 the floor ---------- */}
        <Beat a={-0.04} b={0.075} className="rt-centre" hold={0.3}>
          <div className="micro rt-eyebrow">ORION-PS-03 · SylvaSense · below the canopy floor</div>
          <h1 className="rt-h1">
            Half of this forest
            <br />
            has never been photographed.
          </h1>
        </Beat>

        <Beat a={0.07} b={0.18} className="rt-centre">
          <p className="rt-lede">
            Every satellite, every drone, every survey plot measures the part that is standing up. The
            other half is directly beneath it, and it is where the carbon actually lives.
          </p>
        </Beat>

        {/* ---------- 02 descent ---------- */}
        <Beat a={0.2} b={0.3} className="rt-left">
          <div className="micro rt-tag">Descending · humus</div>
          <h2 className="rt-h2">Down is a direction nobody surveys.</h2>
          <p className="rt-body">
            Root architecture is expensive to excavate and destroys the thing it measures, so almost
            every below-ground figure in climate accounting is a ratio applied to an above-ground number.
          </p>
        </Beat>

        {/* ---------- 03 the root plate ---------- */}
        <Beat a={0.31} b={0.43} className="rt-left">
          <div className="micro rt-tag">Root plate · −1.1 to −3.4 m</div>
          <h2 className="rt-h2 rt-amber">
            Wider than the crown.
            <br />
            Deeper than the building.
          </h2>
          <p className="rt-body">
            A mature Bertholletia plate spreads past twenty metres and reaches eight down. The tree you
            can see is the smaller half of the organism.
          </p>
        </Beat>

        {/* ---------- 04 the network ---------- */}
        <Beat a={0.47} b={0.6} className="rt-left">
          <div className="micro rt-tag rt-cyan">Mycorrhizal zone · −3.4 to −6.6 m</div>
          <h2 className="rt-h2 rt-cyan">Carbon does not move through wood.</h2>
          <p className="rt-body">
            It moves through fungus. A hectare of this soil holds several hundred kilometres of hyphae
            trading sugar for phosphorus, and it is the single largest transfer of carbon from air to
            ground anywhere on the planet.
          </p>
        </Beat>

        {/* ---------- 05 the carbon ---------- */}
        <Beat a={0.63} b={0.75} className="rt-centre" mode="scale">
          <h2 className="rt-h1">
            <span className="mono rt-amber">
              <Counter from={0} to={96.2} a={0.63} b={0.73} decimals={1} />
            </span>{' '}
            tonnes per hectare,
            <br />
            and not one of them in a tree.
          </h2>
          <p className="rt-lede">
            Soil organic carbon in this cell outweighs everything growing on top of it. It took nine
            thousand years to put there.
          </p>
        </Beat>

        {/* ---------- 06 the cut, from below ---------- */}
        <Beat a={0.79} b={0.89} className="rt-left">
          <div className="micro rt-tag rt-bad">Overhead · 09:40 local</div>
          <h2 className="rt-h2 rt-bad">You will not see this happen.</h2>
          <p className="rt-body">
            The clearing is forty metres above your head. Down here it registers as fine roots letting go,
            the network going quiet, and nine thousand years of stored carbon starting to oxidise and
            leave.
          </p>
        </Beat>

        <Beat a={0.82} b={0.92} className="rt-alarm">
          <div className="micro rt-tag rt-bad">Released from soil</div>
          <div className="mono rt-huge rt-bad">
            <Counter from={0} to={59.6} a={0.83} b={0.92} decimals={1} />
          </div>
          <div className="micro rt-dim">t/ha · within four years of clearing</div>
        </Beat>

        {/* ---------- 07 sylvasense ---------- */}
        <Beat a={0.91} b={1} className="rt-centre" mode="scale">
          <div className="micro rt-eyebrow rt-green">SylvaSense</div>
          <h2 className="rt-h1">
            We cannot see down here.
            <br />
            <span className="rt-green">We can infer it.</span>
          </h2>
          <p className="rt-lede">
            Canopy height and crown area predict root mass, and root mass predicts soil carbon. Measure
            the half you can see at ten metres, every five days, and the invisible half comes with it —
            with an error bar, stated honestly.
          </p>
        </Beat>

        <Beat a={0.94} b={1} className="rt-metrics">
          <M k="Above-ground biomass" v={`${METRICS.agbTHa} t/ha`} note="measured" />
          <M k="Root : shoot ratio" v="0.24" note="allometric, biome-specific" />
          <M k="Below-ground biomass" v="52.5 t/ha" note="inferred · ±14%" />
          <M k="Soil organic carbon" v="96.2 t/ha" note="inferred · ±22%" />
          <M k="Total, this cell" v={`${METRICS.carbonStockMtC} Mt C`} note="above + below" />
        </Beat>

        {/* live depth readout */}
        <div ref={readoutRef} className="rt-readout">
          <div ref={depthRef} className="mono rt-depth">
            −0.0 m
          </div>
          <div className="rt-row">
            <span className="micro">Horizon</span>
            <span ref={layerRef} className="mono rt-row-v">
              Litter
            </span>
          </div>
          <div className="rt-row">
            <span className="micro">Carbon above this depth</span>
            <span ref={carbonRef} className="mono rt-row-v">
              0.0 t/ha
            </span>
          </div>
          <div className="rt-row">
            <span className="micro">Observable from orbit</span>
            <span className="mono rt-row-v rt-bad">No</span>
          </div>
        </div>

        <div className="micro rt-site">
          {SITE.id} · {SITE.bbox}
        </div>
        <div className="noise-layer" />
      </div>

      <ConceptChrome index="Concept 06" title="Roots" chapters={CHAPTERS} accent="#e0a765" />
      <ScrollTrack pages={13} />
    </div>
  )
}

function M({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="rt-m">
      <div className="micro rt-m-k">{k}</div>
      <div className="mono rt-m-v">{v}</div>
      <div className="micro rt-m-n">{note}</div>
    </div>
  )
}
