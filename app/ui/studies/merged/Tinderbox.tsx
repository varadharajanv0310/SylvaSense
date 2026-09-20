'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createRainScene, RainScene } from '../09-rain/scene'
import { createEmberScene } from '../01-ember/scene'
import { Act, ActRunner } from '../lib/merge'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { clamp01, lerp, seg, smoothstep } from '../lib/math'
import { SITE } from '../lib/data'
import './merge.css'

/**
 * MERGE — Rain (09) + Ember (01)
 *
 * Fire is normally told as an event. It is a consequence: a forest that is
 * still making its own rain is too humid to carry a crown fire, and the thing
 * that made this one flammable was the clearing that happened years earlier.
 *
 * So act one rides the water cycle and then breaks it, and act two lights the
 * result. The two acts share one instrument — fuel moisture — which starts at
 * 128 % in the first frame and is at 6 % by the time anything is burning.
 */

const CHAPTERS = [
  { at: 0, label: '01 / Wet canopy · 06:10' },
  { at: 0.13, label: '02 / The flying river' },
  { at: 0.25, label: '03 / Return' },
  { at: 0.33, label: '04 / The loop opens' },
  { at: 0.42, label: '05 / A wet forest does not burn' },
  { at: 0.515, label: '06 / Fuel' },
  { at: 0.61, label: '07 / Combustion' },
  { at: 0.82, label: '08 / Re-observation' },
  { at: 0.91, label: '09 / SylvaSense' },
]

/** the drying curve both acts share — it starts before the fire does */
const dryAt = (p: number) => Math.pow(smoothstep(seg(p, 0.3, 0.62)), 0.9)
const fuelMoisture = (p: number) => lerp(128, 6, dryAt(p))
const vpdAt = (p: number) => lerp(0.4, 3.9, dryAt(p))
const dangerOf = (fm: number) => (fm > 90 ? 'Nil' : fm > 45 ? 'Low' : fm > 18 ? 'High' : 'Extreme')

export default function Tinderbox() {
  const rainRef = useRef<HTMLCanvasElement>(null)
  const emberRef = useRef<HTMLCanvasElement>(null)
  const runnerRef = useRef<ActRunner | null>(null)

  const readoutRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const fluxRef = useRef<HTMLSpanElement>(null)
  const vpdRef = useRef<HTMLSpanElement>(null)
  const dangerRef = useRef<HTMLSpanElement>(null)

  const acts = useMemo<Act[]>(
    () => [
      // the circuit: column → flying river → rain → the loop opening
      { key: 'rain', create: createRainScene, a: 0, b: 0.44, from: 0, to: 0.84, fade: 0.05 },
      // what a dry forest does with one ignition
      { key: 'ember', create: (c) => createEmberScene(c), a: 0.42, b: 1, from: 0.26, to: 1, fade: 0.06 },
    ],
    [],
  )

  const { rootRef } = useNarrative({
    pages: 19,
    onFrame: (p, dt, t) => {
      const runner = runnerRef.current
      if (!runner) return
      runner.update(p, dt, t)

      if (readoutRef.current) {
        const vis = smoothstep(seg(p, 0.06, 0.13)) * (1 - smoothstep(seg(p, 0.92, 0.97)))
        readoutRef.current.style.opacity = clamp01(vis).toFixed(3)
      }

      // one instrument, running the whole way through, getting worse
      const fm = fuelMoisture(p)
      setText(heroRef.current, `${fm.toFixed(0)} %`)
      if (heroRef.current)
        heroRef.current.style.color = fm > 90 ? '#8fe8de' : fm > 45 ? '#d8e8a0' : fm > 18 ? '#ffb069' : '#ff6a4d'

      const rs = runner.get<RainScene>('rain')
      const flux = p < 0.46 && rs ? rs.readState().flux : 1.9
      setText(fluxRef.current, `${flux.toFixed(1)} Gt/day`)
      if (fluxRef.current) fluxRef.current.style.color = flux > 12 ? '#8fe8de' : '#e0a765'

      setText(vpdRef.current, `${vpdAt(p).toFixed(1)} kPa`)
      const danger = dangerOf(fm)
      setText(dangerRef.current, danger)
      if (dangerRef.current)
        dangerRef.current.style.color =
          danger === 'Nil' ? 'rgba(232,244,238,0.5)' : danger === 'Low' ? '#d8e8a0' : danger === 'High' ? '#ffb069' : '#ff6a4d'
    },
  })

  useEffect(() => {
    if (!rainRef.current || !emberRef.current) return
    const map = new Map<string, HTMLCanvasElement>([
      ['rain', rainRef.current],
      ['ember', emberRef.current],
    ])
    const runner = new ActRunner(map, acts)
    runnerRef.current = runner
    const onResize = () => runner.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      runner.dispose()
      runnerRef.current = null
    }
  }, [acts])

  return (
    <div ref={rootRef} className="mg-root tb-root">
      <div className="stage">
        <canvas ref={rainRef} className="mg-stack-canvas" />
        <canvas ref={emberRef} className="mg-stack-canvas" />
        <div className="vignette" />

        {/* ---------- act one: the circuit ---------- */}

        <Beat a={-0.04} b={0.04} className="mg-corner" hold={0.3}>
          <div className="micro mg-eyebrow">
            SylvaSense · ORION-PS-03 · {SITE.id} · merge of Rain + Ember
          </div>
        </Beat>

        <Beat a={0.02} b={0.1} className="mg-centre" mode="scale">
          <h1 className="mg-h1">
            A rainforest is
            <br />
            <span className="tb-cyan">mostly rain.</span>
          </h1>
          <p className="mg-lede">
            Not because it happens to be wet, but because the trees make it that way — a thousand litres
            a day, per large tree, lifted against gravity and released through the leaves.
          </p>
        </Beat>

        <Beat a={0.13} b={0.22} className="mg-centre" mode="scale">
          <h2 className="mg-h1">
            <span className="mono tb-cyan">
              <Counter from={0} to={20.1} a={0.13} b={0.21} decimals={1} />
            </span>{' '}
            billion tonnes a day.
          </h2>
          <p className="mg-lede">
            More water crosses this basin through the air than down the river beneath it. Between a
            quarter and a half of the rain that falls here was breathed out by the forest it falls on.
          </p>
        </Beat>

        <Beat a={0.25} b={0.31} className="mg-left">
          <div className="micro mg-tag">Return · 06:10</div>
          <h2 className="mg-h2">The canopy is wet by dawn, every day.</h2>
          <p className="mg-body">
            Humidity under an intact canopy rarely drops below sixty per cent, and dead fuel on the
            floor stays around a hundred and twenty per cent of its dry weight. There is nothing here
            for a fire to do.
          </p>
        </Beat>

        <Beat a={0.33} b={0.41} className="mg-left">
          <div className="micro mg-tag mg-warn">The loop opens</div>
          <h2 className="mg-h2 mg-warn">Cleared ground transpires almost nothing.</h2>
          <p className="mg-body">
            The column thins, the cloud deck fails to form, and the dry season runs three weeks longer
            than it used to. Watch the number in the corner rather than the sky.
          </p>
        </Beat>

        {/* ---------- the pivot ---------- */}

        <Beat a={0.42} b={0.495} className="mg-pivot" mode="scale" hold={0.2}>
          <div className="mg-pivot-rule" />
          <h2 className="mg-h1">
            A forest that makes its own rain
            <br />
            does not burn.
          </h2>
          <p className="mg-lede">
            This one stopped making it. The fire that follows is not the disaster — it is the receipt
            for a disaster that finished four years ago.
          </p>
        </Beat>

        {/* ---------- act two: the result ---------- */}

        <Beat a={0.515} b={0.59} className="mg-left">
          <div className="micro mg-tag tb-hot">Fuel</div>
          <h2 className="mg-h2 tb-hot">The cut is not the fire. It is the kindling.</h2>
          <p className="mg-body">
            Felled crowns dry on the ground for a season, the edge lets sunlight and wind into a
            hundred metres of forest that evolved without either, and a landscape that could not carry
            flame now carries it for kilometres.
          </p>
        </Beat>

        <Beat a={0.61} b={0.7} className="mg-centre" mode="scale">
          <div className="display tb-hero tb-hot">
            NOBODY SETS FIRE
            <br />
            TO A WET FOREST
          </div>
          <p className="mg-lede">
            At six per cent fuel moisture and 3.9 kPa of vapour pressure deficit, ignition is not the
            interesting variable. Everything in frame was going to burn as soon as something asked it to.
          </p>
        </Beat>

        <Beat a={0.72} b={0.8} className="tb-right">
          <div className="micro mg-tag mg-warn">Released</div>
          <div className="display tb-huge tb-hot">
            <Counter from={0} to={41.9} a={0.72} b={0.795} decimals={1} />
          </div>
          <div className="micro tb-dim">Mt CO₂e · this cell</div>
        </Beat>

        <Beat a={0.72} b={0.8} className="mg-left">
          <div className="micro mg-tag">Fallout</div>
          <h2 className="mg-h2">Forty minutes, four hundred years.</h2>
          <p className="mg-body">
            The carbon changes address from trunk to atmosphere in about forty minutes. The structure it
            was holding up takes four centuries to rebuild, in a basin that is now drier than the one it
            grew in.
          </p>
        </Beat>

        <Beat a={0.82} b={0.9} className="mg-left">
          <div className="micro mg-tag">Re-observation</div>
          <h2 className="mg-h2">The scar is obvious. The cause is upstream.</h2>
          <p className="mg-body">
            Every burn-scar map in existence shows you where it ended. The variable that decided it —
            how much water the surrounding forest was still moving — is measurable months in advance.
          </p>
        </Beat>

        {/* ---------- sylvasense ---------- */}

        <Beat a={0.91} b={0.97} className="mg-top" mode="scale">
          <h2 className="mg-h1">
            Fire is a water problem
            <br />
            <span className="tb-cyan">you can see coming.</span>
          </h2>
          <p className="mg-lede">
            Evapotranspiration, canopy moisture and edge density are all observable from orbit on a
            five-day cycle. Fuel moisture is not a forecast — it is a measurement nobody is reading.
          </p>
        </Beat>

        <Beat a={0.94} b={1} className="mg-metrics" style={{ ['--cols' as string]: 5 }}>
          <M k="Fuel moisture, intact" v="128 %" good />
          <M k="Fuel moisture, at ignition" v="6 %" alarm />
          <M k="Basin flux lost" v="−91 %" alarm />
          <M k="Released" v="41.9 Mt CO₂e" alarm />
          <M k="Lead time available" v="≈ 90 days" good />
        </Beat>

        {/* one instrument, all the way through */}
        <div ref={readoutRef} className="mg-readout">
          <div className="micro tb-k">Dead fuel moisture</div>
          <div ref={heroRef} className="mg-readout-hero">
            128 %
          </div>
          <div className="mg-row">
            <span className="micro">Atmospheric flux</span>
            <span ref={fluxRef} className="mg-row-v">
              20.1 Gt/day
            </span>
          </div>
          <div className="mg-row">
            <span className="micro">Vapour pressure deficit</span>
            <span ref={vpdRef} className="mg-row-v">
              0.4 kPa
            </span>
          </div>
          <div className="mg-row">
            <span className="micro">Fire danger</span>
            <span ref={dangerRef} className="mg-row-v">
              Nil
            </span>
          </div>
        </div>
      </div>

      <div className="micro mg-lineage">Merge · Rain 09 + Ember 01</div>
      <ConceptChrome index="Merge 17" title="Tinderbox" chapters={CHAPTERS} accent="#ffb069" />
      <ScrollTrack pages={19} />
    </div>
  )
}

function M({ k, v, alarm, good }: { k: string; v: string; alarm?: boolean; good?: boolean }) {
  return (
    <div className="mg-m">
      <div className="micro mg-m-k">{k}</div>
      <div className="mg-m-v" style={alarm ? { color: '#ff7a4d' } : good ? { color: '#8fe8de' } : undefined}>
        {v}
      </div>
    </div>
  )
}
