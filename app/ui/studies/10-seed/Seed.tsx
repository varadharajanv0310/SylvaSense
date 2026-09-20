'use client'

import { useEffect, useRef } from 'react'
import { createSeedScene, SeedScene } from './scene'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, ScrollTrack } from '../lib/ui'
import { seg, smoothstep } from '../lib/math'
import { METRICS, SITE } from '../lib/data'
import './seed.css'

const CHAPTERS = [
  { at: 0, label: '01 / Year zero' },
  { at: 0.14, label: '02 / The first three years' },
  { at: 0.3, label: '03 / Pioneers' },
  { at: 0.46, label: '04 / The long middle' },
  { at: 0.68, label: '05 / Year eighty' },
  { at: 0.8, label: '06 / Who pays for patience' },
  { at: 0.9, label: '07 / SylvaSense' },
]

const nf = new Intl.NumberFormat('en-US')

export default function Seed() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<SeedScene | null>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const yearRef = useRef<HTMLDivElement>(null)
  const carbonRef = useRef<HTMLSpanElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const stemRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)

  const { rootRef } = useNarrative({
    pages: 14,
    onFrame: (p, dt, t) => {
      sceneRef.current?.update(p, dt, t)
      const st = sceneRef.current?.readState()
      if (readoutRef.current && st) {
        const vis = smoothstep(seg(p, 0.06, 0.13)) * (1 - smoothstep(seg(p, 0.93, 0.99)))
        readoutRef.current.style.opacity = vis.toFixed(3)
        if (vis > 0.01) {
          setText(yearRef.current, `Year ${Math.floor(st.year)}`)
          setText(carbonRef.current, `${st.carbon.toFixed(1)} t/ha`)
          const pct = (st.carbon / METRICS.agbTHa) * 100
          setText(pctRef.current, `${pct.toFixed(0)} %`)
          if (pctRef.current) pctRef.current.style.color = pct > 60 ? '#a8d86a' : pct > 25 ? '#e0c765' : '#e08a65'
          setText(stemRef.current, nf.format(st.stems))
          if (barRef.current) barRef.current.style.width = `${Math.min(100, pct)}%`
        }
      }
    },
  })

  useEffect(() => {
    if (!canvasRef.current) return
    const s = createSeedScene(canvasRef.current)
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
    <div ref={rootRef} className="sd-root">
      <div className="stage">
        <canvas ref={canvasRef} className="full-canvas" />
        <div className="vignette" />

        {/* ---------- 01 year zero ---------- */}
        <Beat a={-0.04} b={0.09} className="sd-centre" hold={0.3}>
          <div className="micro sd-eyebrow">ORION-PS-03 · SylvaSense · {SITE.id} · block 7, cleared 2019</div>
          <h1 className="sd-h1">
            Everything else here
            <br />
            was about losing it.
          </h1>
          <p className="sd-lede">This one is about the eighty years afterwards.</p>
        </Beat>

        {/* ---------- 02 the first years ---------- */}
        <Beat a={0.13} b={0.26} className="sd-left">
          <div className="micro sd-tag">Year 0 to 3</div>
          <h2 className="sd-h2">Nothing happens for a long time.</h2>
          <p className="sd-body">
            Seed arrives on wind and in the gut of birds that no longer have anywhere to perch. On
            compacted ground in full sun, the first three years produce about a metre.
          </p>
        </Beat>

        {/* ---------- 03 pioneers ---------- */}
        <Beat a={0.3} b={0.44} className="sd-left">
          <div className="micro sd-tag sd-lime">Year 5 to 20 · pioneers</div>
          <h2 className="sd-h2 sd-lime">Then it goes green very fast, and that is the trap.</h2>
          <p className="sd-body">
            Fast species close the ground inside a decade. From above, at ten metres per pixel, this
            already reads as forest — the NDVI recovers years before the carbon does.
          </p>
        </Beat>

        {/* ---------- 04 the long middle ---------- */}
        <Beat a={0.47} b={0.63} className="sd-left">
          <div className="micro sd-tag">Year 20 to 60 · succession</div>
          <h2 className="sd-h2">The slow species are the ones that matter.</h2>
          <p className="sd-body">
            Pioneers are shaded out by the trees they sheltered. Hardwoods put on height at a fifth of
            the rate and hold four times the carbon, and they are only getting started at year forty.
          </p>
        </Beat>

        {/* ---------- 05 year eighty ---------- */}
        <Beat a={0.67} b={0.79} className="sd-centre" mode="scale">
          <h2 className="sd-h1">
            A forest that looks finished
            <br />
            and a forest that <em>is</em> finished
            <br />
            are <span className="sd-lime">eighty years</span> apart.
          </h2>
          <p className="sd-lede">
            Canopy cover is back to ninety-four per cent. Above-ground carbon is at seventy-one. The
            remaining twenty-nine will take longer than the career of anyone who authorised the
            planting.
          </p>
        </Beat>

        {/* ---------- 06 who pays ---------- */}
        <Beat a={0.81} b={0.89} className="sd-left">
          <div className="micro sd-tag sd-warn">The financing problem</div>
          <h2 className="sd-h2 sd-warn">Nobody funds eighty years of trust.</h2>
          <p className="sd-body">
            Restoration finance pays on verified outcomes. If the only way to check is a field visit
            every few years, the instrument is unsellable and the planting does not happen.
          </p>
        </Beat>

        {/* ---------- 07 sylvasense ---------- */}
        <Beat a={0.9} b={1} className="sd-centre" mode="scale">
          <div className="micro sd-eyebrow sd-green">SylvaSense</div>
          <h2 className="sd-h1">
            Eighty years is
            <br />
            <span className="sd-green">5,840 observations.</span>
          </h2>
          <p className="sd-lede">
            Every five days, for as long as it takes, at ten metres, with canopy height separating real
            recovery from a green-looking thicket. Patience becomes fundable the moment it becomes
            checkable.
          </p>
        </Beat>

        <Beat a={0.93} b={1} className="sd-metrics">
          <M k="Elapsed" v="80 years" note="one scroll" />
          <M k="Canopy cover" v="94 %" note="looks recovered" />
          <M k="Above-ground carbon" v="71 %" note="of pre-clearing" alarm />
          <M k="Observations" v="5,840" note={`every ${METRICS.revisitDays} days`} good />
          <M k="Verification cost" v="≈ £0" note="marginal, per pass" good />
        </Beat>

        {/* live readout */}
        <div ref={readoutRef} className="sd-readout">
          <div ref={yearRef} className="mono sd-year">
            Year 0
          </div>
          <div className="sd-bar">
            <span ref={barRef} className="sd-bar-fill" />
          </div>
          <div className="sd-row">
            <span className="micro">Above-ground carbon</span>
            <span ref={carbonRef} className="mono sd-row-v">
              0.0 t/ha
            </span>
          </div>
          <div className="sd-row">
            <span className="micro">Of pre-clearing stock</span>
            <span ref={pctRef} className="mono sd-row-v">
              0 %
            </span>
          </div>
          <div className="sd-row">
            <span className="micro">Living stems</span>
            <span ref={stemRef} className="mono sd-row-v">
              0
            </span>
          </div>
        </div>

        <div className="noise-layer" />
      </div>

      <ConceptChrome index="Concept 10" title="Seed" chapters={CHAPTERS} accent="#a8d86a" />
      <ScrollTrack pages={14} />
    </div>
  )
}

function M({ k, v, note, alarm, good }: { k: string; v: string; note: string; alarm?: boolean; good?: boolean }) {
  return (
    <div className="sd-m">
      <div className="micro sd-m-k">{k}</div>
      <div className="mono sd-m-v" style={alarm ? { color: '#e0c765' } : good ? { color: '#a8d86a' } : undefined}>
        {v}
      </div>
      <div className="micro sd-m-n">{note}</div>
    </div>
  )
}
