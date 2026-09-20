'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createRingsRenderer, yearAt } from '../02-rings/renderer'
import { createSeedScene, SeedScene } from '../10-seed/scene'
import { Act, ActRunner, SceneLike } from '../lib/merge'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { clamp01, seg, smoothstep } from '../lib/math'
import { METRICS, RING_SERIES, SITE } from '../lib/data'
import './merge.css'

/**
 * MERGE — Growth Rings (02) + Seed (10)
 *
 * The same instant, read in both directions. Act one runs backwards: two
 * hundred and twenty-four rings, each one a year that already happened, on a
 * stem that had to die to be legible. Act two runs forwards: eighty years that
 * have not happened yet, on ground that is currently bare.
 *
 * The pivot is the outermost ring — the last line the tree will ever write —
 * and everything after it has to be measured rather than read.
 */

const CHAPTERS = [
  { at: 0, label: '01 / A tree keeps its own record' },
  { at: 0.155, label: '02 / The cut' },
  { at: 0.26, label: '03 / 224 lines' },
  { at: 0.38, label: '04 / End of record' },
  { at: 0.485, label: '05 / Forwards' },
  { at: 0.645, label: '06 / The green trap' },
  { at: 0.84, label: '07 / Eighty rings from now' },
  { at: 0.92, label: '08 / SylvaSense' },
]

const nf = new Intl.NumberFormat('en-US')

/** the Rings renderer exposes draw(), not update() */
const createRingsAct = (canvas: HTMLCanvasElement): SceneLike => {
  const r = createRingsRenderer(canvas)
  return {
    update: (p, _dt, t) => r.draw(p, t),
    resize: () => r.resize(),
    dispose: () => r.dispose(),
  }
}

export default function BothDirections() {
  const ringsRef = useRef<HTMLCanvasElement>(null)
  const seedRef = useRef<HTMLCanvasElement>(null)
  const runnerRef = useRef<ActRunner | null>(null)

  const readoutRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const dirRef = useRef<HTMLSpanElement>(null)
  const k1 = useRef<HTMLSpanElement>(null)
  const v1 = useRef<HTMLSpanElement>(null)
  const k2 = useRef<HTMLSpanElement>(null)
  const v2 = useRef<HTMLSpanElement>(null)

  const acts = useMemo<Act[]>(
    () => [
      // crown → descent → the cut → 224 rings accumulating outward
      { key: 'rings', create: createRingsAct, a: 0, b: 0.5, from: 0, to: 0.64, fade: 0.05 },
      // bare ground → pioneers → succession → year eighty
      { key: 'seed', create: createSeedScene, a: 0.49, b: 1, from: 0.02, to: 1, fade: 0.06 },
    ],
    [],
  )

  const { rootRef } = useNarrative({
    pages: 19,
    onFrame: (p, dt, t) => {
      const runner = runnerRef.current
      if (!runner) return
      runner.update(p, dt, t)

      const backwards = p < 0.52
      if (readoutRef.current) {
        const vis =
          smoothstep(seg(p, 0.24, 0.3)) * (1 - smoothstep(seg(p, 0.46, 0.5))) +
          smoothstep(seg(p, 0.56, 0.62)) * (1 - smoothstep(seg(p, 0.94, 0.99)))
        readoutRef.current.style.opacity = clamp01(vis).toFixed(3)
      }

      if (backwards) {
        const year = yearAt(runner.localOf(acts[0], p))
        const rec = RING_SERIES[Math.min(RING_SERIES.length - 1, Math.max(0, year - RING_SERIES[0].year))]
        setText(heroRef.current, String(year))
        setText(dirRef.current, 'Reading backwards')
        setText(k1.current, 'Ring signal')
        const label = rec.scar === 2 ? 'Fire scar' : rec.scar === 1 ? 'Drought' : 'Nominal growth'
        setText(v1.current, label)
        if (v1.current)
          v1.current.style.color = rec.scar === 2 ? '#ff7a4d' : rec.scar === 1 ? '#f2b134' : 'rgba(232,240,230,0.7)'
        setText(k2.current, 'Years on record')
        setText(v2.current, String(Math.max(0, year - RING_SERIES[0].year + 1)))
        if (v2.current) v2.current.style.color = ''
      } else {
        const st = runner.get<SeedScene>('seed')?.readState()
        if (st) {
          setText(heroRef.current, `Year ${Math.floor(st.year)}`)
          setText(dirRef.current, 'Writing forwards')
          const pct = (st.carbon / METRICS.agbTHa) * 100
          setText(k1.current, 'Above-ground carbon')
          setText(v1.current, `${st.carbon.toFixed(1)} t/ha · ${pct.toFixed(0)}%`)
          if (v1.current) v1.current.style.color = pct > 60 ? '#a8d86a' : pct > 25 ? '#e0c765' : '#e08a65'
          setText(k2.current, 'Living stems')
          setText(v2.current, nf.format(st.stems))
          if (v2.current) v2.current.style.color = ''
        }
      }
    },
  })

  useEffect(() => {
    if (!ringsRef.current || !seedRef.current) return
    const map = new Map<string, HTMLCanvasElement>([
      ['rings', ringsRef.current],
      ['seed', seedRef.current],
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
    <div ref={rootRef} className="mg-root bd-root">
      <div className="stage">
        <canvas ref={ringsRef} className="mg-stack-canvas" />
        <canvas ref={seedRef} className="mg-stack-canvas" />
        <div className="vignette" />

        {/* ---------- act one: backwards ---------- */}

        <Beat a={-0.04} b={0.04} className="mg-corner" hold={0.3}>
          <div className="micro mg-eyebrow">
            SylvaSense · ORION-PS-03 · {SITE.id} · merge of Growth Rings + Seed
          </div>
        </Beat>

        <Beat a={0.03} b={0.12} className="mg-centre" mode="scale">
          <h1 className="bd-h1 editorial">
            A tree keeps
            <br />
            <em>its own record.</em>
          </h1>
          <p className="mg-lede">
            One line a year, for as long as it stands. Width is rainfall, char is fire, and none of it
            was written for us.
          </p>
        </Beat>

        <Beat a={0.155} b={0.235} className="mg-left">
          <div className="micro mg-tag">1802 to 2026</div>
          <h2 className="bd-h2 editorial">To read it, end it.</h2>
          <p className="mg-body">
            Two hundred and twenty-four years of daily weather, recorded perfectly and legible only
            once. The instrument and the subject are the same object.
          </p>
        </Beat>

        <Beat a={0.26} b={0.36} className="mg-left">
          <div className="micro mg-tag">Dendrochronology</div>
          <h2 className="bd-h2 editorial">
            <span className="mono">224</span> lines,
            <br />
            none of them guessed.
          </h2>
          <p className="mg-body">
            A narrow pale ring is a drought year. A black one is the year fire came through and the tree
            survived it. This sequence is the closest thing to ground truth that forestry has.
          </p>
        </Beat>

        <Beat a={0.38} b={0.46} className="mg-left">
          <div className="micro mg-tag mg-warn">2026 · outermost ring</div>
          <h2 className="bd-h2 editorial mg-warn">And then the record stops.</h2>
          <p className="mg-body">
            Not because the climate stopped happening, but because there is no longer a tree here to
            write it down. The archive ends at the stump.
          </p>
        </Beat>

        {/* ---------- the pivot ---------- */}

        <Beat a={0.485} b={0.56} className="mg-pivot" mode="scale" hold={0.2}>
          <div className="mg-pivot-rule" />
          <h2 className="mg-h1">
            Everything before this ring
            <br />
            was written for you.
            <br />
            <span className="bd-lime">Everything after it, you write.</span>
          </h2>
        </Beat>

        {/* ---------- act two: forwards ---------- */}

        <Beat a={0.575} b={0.625} className="mg-left">
          <div className="micro mg-tag">Year 0 to 3</div>
          <h2 className="mg-h2">Nothing happens for a long time.</h2>
          <p className="mg-body">
            Seed arrives on wind and in the gut of birds that no longer have anywhere to perch. On
            compacted ground in full sun, the first three years produce about a metre.
          </p>
        </Beat>

        <Beat a={0.645} b={0.73} className="mg-left">
          <div className="micro mg-tag bd-lime">Year 5 to 20 · pioneers</div>
          <h2 className="mg-h2 bd-lime">Then it goes green fast, and that is the trap.</h2>
          <p className="mg-body">
            Fast species close the ground inside a decade, and from above it already reads as forest. A
            ring count would not be fooled by this. An index of greenness is.
          </p>
        </Beat>

        <Beat a={0.748} b={0.82} className="mg-left">
          <div className="micro mg-tag">Year 20 to 50 · succession</div>
          <h2 className="mg-h2">The slow species are the ones that matter.</h2>
          <p className="mg-body">
            Pioneers are shaded out by the trees they sheltered. Hardwoods put on height at a fifth of
            the rate and hold four times the carbon, and they are only getting started at year forty.
          </p>
        </Beat>

        <Beat a={0.84} b={0.91} className="mg-centre" mode="scale">
          <h2 className="bd-h1 editorial">
            Eighty rings from now,
            <br />
            <em>somebody could cut this open</em>
            <br />
            and read what we did.
          </h2>
        </Beat>

        {/* ---------- sylvasense ---------- */}

        <Beat a={0.92} b={1} className="mg-left" mode="left">
          <div className="micro mg-tag">SylvaSense</div>
          <h2 className="mg-h2 mg-accent">
            Or you could read it
            <br />
            <span className="mono">
              <Counter from={0} to={5840} a={0.925} b={0.985} />
            </span>{' '}
            times before then.
          </h2>
          <p className="mg-body">
            Every five days, non-destructively, with canopy height separating a real recovery from a
            green-looking thicket. The ring count stays the gold standard; it just stops being the only
            record anybody can keep.
          </p>
        </Beat>

        <Beat a={0.94} b={1} className="mg-metrics" style={{ ['--cols' as string]: 5 }}>
          <M k="Backwards" v="224 years" s="one stem · destructive" />
          <M k="Forwards" v="80 years" s="one hectare · modelled" />
          <M k="Canopy cover, year 80" v="94 %" s="looks recovered" />
          <M k="Carbon, year 80" v="71 %" s="of pre-clearing" alarm />
          <M k="Observations, year 80" v="5,840" s={`every ${METRICS.revisitDays} days`} good />
        </Beat>

        {/* the instrument, reversing direction at the join */}
        <div ref={readoutRef} className="mg-readout">
          <div className="micro bd-dir">
            <span ref={dirRef}>Reading backwards</span>
          </div>
          <div ref={heroRef} className="mg-readout-hero">
            1802
          </div>
          <div className="mg-row">
            <span ref={k1} className="micro">
              Ring signal
            </span>
            <span ref={v1} className="mg-row-v">
              Nominal growth
            </span>
          </div>
          <div className="mg-row">
            <span ref={k2} className="micro">
              Years on record
            </span>
            <span ref={v2} className="mg-row-v">
              1
            </span>
          </div>
        </div>
      </div>

      <div className="micro mg-lineage">Merge · Growth Rings 02 + Seed 10</div>
      <ConceptChrome index="Merge 16" title="Both Directions" chapters={CHAPTERS} accent="#e8b96a" />
      <ScrollTrack pages={19} />
    </div>
  )
}

function M({ k, v, s, alarm, good }: { k: string; v: string; s: string; alarm?: boolean; good?: boolean }) {
  return (
    <div className="mg-m">
      <div className="micro mg-m-k">{k}</div>
      <div className="mg-m-v" style={alarm ? { color: '#e0c765' } : good ? { color: '#a8d86a' } : undefined}>
        {v}
      </div>
      <div className="micro bd-m-s">{s}</div>
    </div>
  )
}
