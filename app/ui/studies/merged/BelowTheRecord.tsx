'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createStackScene, formatDate, StackScene, TOTAL_OBS } from '../07-stack/scene'
import { createRootsScene, RootsScene } from '../06-roots/scene'
import { Act, ActRunner } from '../lib/merge'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { clamp01, lerp, seg, smoothstep } from '../lib/math'
import { SITE } from '../lib/data'
import './merge.css'

/**
 * MERGE — The Stack (07) + Roots (06)
 *
 * One continuous fall, with the axis changed underneath you. Act one descends
 * the time axis of the data cube — two thousand one hundred and eighteen
 * observations of this hectare, every one of them taken from above. At the
 * floor of the cube it keeps going, and act two descends nine and a half
 * metres of soil that no instrument has ever recorded at all.
 *
 * The camera never stops moving downward, which is what makes the join read as
 * the same gesture rather than as a cut.
 */

const CHAPTERS = [
  { at: 0, label: '01 / Surface · 2026' },
  { at: 0.12, label: '02 / Descent through time' },
  { at: 0.185, label: '03 / The last green observation' },
  { at: 0.27, label: '04 / Floor · 1984' },
  { at: 0.4, label: '05 / Keep falling' },
  { at: 0.585, label: '06 / The root plate' },
  { at: 0.68, label: '07 / Soil carbon' },
  { at: 0.88, label: '08 / SylvaSense' },
]

export default function BelowTheRecord() {
  const stackRef = useRef<HTMLCanvasElement>(null)
  const rootsRef = useRef<HTMLCanvasElement>(null)
  const runnerRef = useRef<ActRunner | null>(null)

  const readoutRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const axisRef = useRef<HTMLSpanElement>(null)
  const k1 = useRef<HTMLSpanElement>(null)
  const v1 = useRef<HTMLSpanElement>(null)
  const k2 = useRef<HTMLSpanElement>(null)
  const v2 = useRef<HTMLSpanElement>(null)

  const acts = useMemo<Act[]>(
    () => [
      // 2026 surface → the last green observation → the floor at 1984 → edge-on
      { key: 'stack', create: createStackScene, a: 0, b: 0.44, from: 0, to: 0.74, fade: 0.05 },
      // litter → root plate → mycorrhizal zone → mineral soil
      { key: 'roots', create: createRootsScene, a: 0.4, b: 1, from: 0.04, to: 1, fade: 0.06 },
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
        const vis =
          smoothstep(seg(p, 0.06, 0.13)) * (1 - smoothstep(seg(p, 0.36, 0.4))) +
          smoothstep(seg(p, 0.47, 0.53)) * (1 - smoothstep(seg(p, 0.93, 0.98)))
        readoutRef.current.style.opacity = clamp01(vis).toFixed(3)
      }

      const inTime = p < 0.42
      const sk = runner.get<StackScene>('stack')
      const rs = runner.get<RootsScene>('roots')

      if (inTime && sk) {
        const st = sk.readState()
        setText(heroRef.current, formatDate(st.date))
        setText(axisRef.current, 'Axis · time')
        setText(k1.current, 'Observation')
        setText(v1.current, `${st.index} of ${TOTAL_OBS}`)
        setText(k2.current, 'Usable')
        setText(v2.current, st.cloud ? 'Cloud · no' : st.sar ? 'SAR · yes' : 'Optical · yes')
        if (v2.current) v2.current.style.color = st.cloud ? '#ff6a4d' : '#7af0b4'
      } else if (!inTime && rs) {
        const d = rs.readDepth()
        setText(heroRef.current, `−${d.toFixed(1)} m`)
        setText(axisRef.current, 'Axis · depth')
        setText(k1.current, 'Horizon')
        setText(
          v1.current,
          d < 0.3 ? 'Litter' : d < 1.1 ? 'Humus' : d < 3.4 ? 'Root plate' : d < 6.6 ? 'Mycorrhizal zone' : 'Mineral soil',
        )
        setText(k2.current, 'Observations, all time')
        setText(v2.current, '0')
        if (v2.current) v2.current.style.color = '#ff6a4d'
      }

      // the readout's hero colour tracks which half of the fall we are in
      if (heroRef.current) heroRef.current.style.color = inTime ? '#dceaf2' : '#f4ece0'
    },
  })

  useEffect(() => {
    if (!stackRef.current || !rootsRef.current) return
    const map = new Map<string, HTMLCanvasElement>([
      ['stack', stackRef.current],
      ['roots', rootsRef.current],
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
    <div ref={rootRef} className="mg-root br-root">
      <div className="stage">
        <canvas ref={stackRef} className="mg-stack-canvas" />
        <canvas ref={rootsRef} className="mg-stack-canvas" />
        <div className="vignette" />

        {/* ---------- act one: the recorded half ---------- */}

        <Beat a={-0.04} b={0.04} className="mg-corner" hold={0.3}>
          <div className="micro mg-eyebrow">
            SylvaSense · ORION-PS-03 · {SITE.id} · merge of The Stack + Roots
          </div>
        </Beat>

        <Beat a={0.02} b={0.1} className="mg-centre" mode="scale">
          <h1 className="mg-h1">
            <span className="mono br-cyan">
              <Counter from={0} to={TOTAL_OBS} a={0.025} b={0.085} />
            </span>{' '}
            observations
            <br />
            of this hectare.
          </h1>
          <p className="mg-lede">
            Every one of them taken from above, looking down, at the top surface of something. Scroll
            is the time axis — you are about to fall through all of them.
          </p>
        </Beat>

        <Beat a={0.12} b={0.185} className="mg-left">
          <div className="micro mg-tag">2026 to 1984 · descending</div>
          <h2 className="mg-h2">Earth observation is not images. It is a cube.</h2>
          <p className="mg-body">
            Two space axes and one time axis. Almost every wrong claim about a forest comes from
            treating one slice of this as though it were the whole thing.
          </p>
        </Beat>

        <Beat a={0.185} b={0.23} className="mg-left">
          <div className="micro mg-tag mg-warn">2019-12-29 · 09:47 UTC</div>
          <h2 className="mg-h2 mg-warn">The last green observation.</h2>
          <p className="mg-body">
            Nothing is announced in this frame. It is simply the final slice in which this cell is
            still forest, and the next usable one is eleven days later.
          </p>
        </Beat>

        <Beat a={0.27} b={0.36} className="mg-left">
          <div className="micro mg-tag">Floor · 1984-04-12</div>
          <h2 className="mg-h2">Forty-two years, and you have reached the bottom.</h2>
          <p className="mg-body">
            This is the oldest observation that exists of this ground. Below it the archive is empty,
            which is usually where the story is expected to stop.
          </p>
        </Beat>

        {/* ---------- the pivot ---------- */}

        <Beat a={0.4} b={0.475} className="mg-pivot" mode="scale" hold={0.2}>
          <div className="mg-pivot-rule" />
          <h2 className="mg-h1">
            You have fallen through everything
            <br />
            ever recorded here.
            <br />
            <span className="br-amber">Keep falling.</span>
          </h2>
        </Beat>

        {/* ---------- act two: the unrecorded half ---------- */}

        <Beat a={0.5} b={0.57} className="mg-left">
          <div className="micro mg-tag">−0.0 to −1.1 m · litter and humus</div>
          <h2 className="mg-h2">The axis changed. The direction did not.</h2>
          <p className="mg-body">
            Same camera, same fall, same hectare. What has changed is that nothing below this line has
            ever appeared in any slice of the cube you just descended.
          </p>
        </Beat>

        <Beat a={0.585} b={0.66} className="mg-left">
          <div className="micro mg-tag br-amber">Root plate · −1.1 to −3.4 m</div>
          <h2 className="mg-h2 br-amber">Wider than the crown it fed.</h2>
          <p className="mg-body">
            A mature plate spreads past twenty metres and reaches eight down. Everything the cube
            recorded was the smaller half of the organism.
          </p>
        </Beat>

        <Beat a={0.68} b={0.77} className="mg-left">
          <div className="micro mg-tag br-cyan">Mycorrhizal zone · −3.4 to −6.6 m</div>
          <h2 className="mg-h2 br-cyan">
            <span className="mono">96.2</span> tonnes per hectare,
            <br />
            and zero observations of it.
          </h2>
          <p className="mg-body">
            Soil organic carbon here outweighs everything that was growing on top of it, and it took
            nine thousand years to put there. The archive above has 2,118 entries. This has none.
          </p>
        </Beat>

        <Beat a={0.79} b={0.86} className="br-right">
          <div className="micro mg-tag mg-bad">Slices available</div>
          <div className="display br-huge mg-bad">0</div>
          <div className="micro br-dim">at any depth, any sensor, any year</div>
        </Beat>

        {/* ---------- sylvasense ---------- */}

        <Beat a={0.88} b={0.95} className="mg-top" mode="scale">
          <h2 className="mg-h1">
            The cube has no layer for this.
            <br />
            <span className="mg-accent">So infer it from the one above.</span>
          </h2>
          <p className="mg-lede">
            Canopy height and crown area predict root mass; root mass predicts soil carbon. The half
            that was never photographed becomes an estimate with an error bar, on the same pass that
            measures the half that was.
          </p>
        </Beat>

        <Beat a={0.92} b={1} className="mg-metrics" style={{ ['--cols' as string]: 5 }}>
          <M k="Observations, above" v="2,118" s="1984 to 2026" good />
          <M k="Observations, below" v="0" s="all sensors, all time" alarm />
          <M k="Depth of the archive" v="0.0 m" s="surface only" />
          <M k="Carbon below" v="96.2 t/ha" s="inferred ±22 %" />
          <M k="Root : shoot ratio" v="0.24" s="allometric" />
        </Beat>

        {/* one panel, one fall, two axes */}
        <div ref={readoutRef} className="mg-readout">
          <div className="micro br-axis">
            <span ref={axisRef}>Axis · time</span>
          </div>
          <div ref={heroRef} className="mg-readout-hero">
            2026-09
          </div>
          <div className="mg-row">
            <span ref={k1} className="micro">
              Observation
            </span>
            <span ref={v1} className="mg-row-v">
              2118 of 2118
            </span>
          </div>
          <div className="mg-row">
            <span ref={k2} className="micro">
              Usable
            </span>
            <span ref={v2} className="mg-row-v">
              Optical · yes
            </span>
          </div>
        </div>
      </div>

      <div className="micro mg-lineage">Merge · The Stack 07 + Roots 06</div>
      <ConceptChrome index="Merge 19" title="Below the Record" chapters={CHAPTERS} accent="#78c8d7" />
      <ScrollTrack pages={19} />
    </div>
  )
}

function M({ k, v, s, alarm, good }: { k: string; v: string; s: string; alarm?: boolean; good?: boolean }) {
  return (
    <div className="mg-m">
      <div className="micro mg-m-k">{k}</div>
      <div className="mg-m-v" style={alarm ? { color: '#ff6a4d' } : good ? { color: '#7af0b4' } : undefined}>
        {v}
      </div>
      <div className="micro br-m-s">{s}</div>
    </div>
  )
}
