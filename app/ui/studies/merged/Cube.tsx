'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createEnumScene, EnumScene } from '../05-enumeration/scene'
import { createStackScene, formatDate, StackScene, TOTAL_OBS } from '../07-stack/scene'
import { Act, ActRunner } from '../lib/merge'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, ScrollTrack } from '../lib/ui'
import { clamp01, lerp, seg, smoothstep } from '../lib/math'
import { METRICS, SITE } from '../lib/data'
import './merge.css'

/**
 * MERGE — Enumeration (05) + The Stack (07)
 *
 * Two axes, in order. The first act climbs the spatial axis from one stem to
 * orbit; at the top it hands over to a cube of every observation ever made of
 * that ground and descends the time axis instead. Both acts meet on a nadir
 * view of the same raster, which is what makes the join invisible.
 */

const CHAPTERS = [
  { at: 0, label: '01 / One stem' },
  { at: 0.1, label: '02 / Multiplication' },
  { at: 0.33, label: '03 / Subtraction' },
  { at: 0.49, label: '04 / One photograph' },
  { at: 0.6, label: '05 / Descent through time' },
  { at: 0.69, label: '06 / The last green observation' },
  { at: 0.79, label: '07 / Edge-on' },
  { at: 0.9, label: '08 / SylvaSense' },
]

const TOTAL = METRICS.treesDetected
const LOST = 904_118
const nf = new Intl.NumberFormat('en-US')

function population(p: number) {
  if (p < 0.26) return Math.max(1, Math.pow(seg(p, 0.012, 0.26), 3.2) * TOTAL)
  if (p < 0.34) return TOTAL
  if (p < 0.47) return TOTAL - smoothstep(seg(p, 0.34, 0.47)) * LOST
  return TOTAL - LOST
}

export default function Cube() {
  const enumRef = useRef<HTMLCanvasElement>(null)
  const stackRef = useRef<HTMLCanvasElement>(null)
  const runnerRef = useRef<ActRunner | null>(null)

  const countRef = useRef<HTMLDivElement>(null)
  const countWrapRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const r1Ref = useRef<HTMLSpanElement>(null)
  const r2Ref = useRef<HTMLSpanElement>(null)
  const r3Ref = useRef<HTMLSpanElement>(null)
  const k1Ref = useRef<HTMLSpanElement>(null)
  const k2Ref = useRef<HTMLSpanElement>(null)
  const k3Ref = useRef<HTMLSpanElement>(null)

  const acts = useMemo<Act[]>(
    () => [
      // the spatial climb: one stem → 24k stems → the cut → orbit
      { key: 'enum', create: createEnumScene, a: 0, b: 0.54, from: 0, to: 0.735, fade: 0.05 },
      // the temporal descent: a single frame → the whole archive → edge-on
      { key: 'stack', create: createStackScene, a: 0.5, b: 1, from: 0.03, to: 1, fade: 0.05 },
    ],
    [],
  )

  const { rootRef } = useNarrative({
    pages: 18,
    onFrame: (p, dt, t) => {
      const runner = runnerRef.current
      if (!runner) return
      runner.update(p, dt, t)

      /* the population counter belongs to the first act only */
      if (countWrapRef.current && countRef.current) {
        const vis = smoothstep(seg(p, -0.02, 0.03)) * (1 - smoothstep(seg(p, 0.47, 0.53)))
        countWrapRef.current.style.opacity = vis.toFixed(3)
        countWrapRef.current.style.visibility = vis < 0.005 ? 'hidden' : 'visible'
        const s = 1 - smoothstep(seg(p, 0.03, 0.16)) * 0.52
        countWrapRef.current.style.transform = `translate(-50%,-50%) scale(${s.toFixed(3)})`
        countWrapRef.current.style.color = p > 0.35 ? '#ffb069' : '#eaf6ea'
        setText(countRef.current, nf.format(Math.round(population(p))))
      }

      /* one readout panel, two instruments: altitude before the join, date after */
      const spatial = p < 0.52
      const en = runner.get<EnumScene>('enum')
      const sk = runner.get<StackScene>('stack')
      if (readoutRef.current) {
        const vis =
          (smoothstep(seg(p, 0.06, 0.12)) * (1 - smoothstep(seg(p, 0.46, 0.5)))) +
          (smoothstep(seg(p, 0.56, 0.62)) * (1 - smoothstep(seg(p, 0.86, 0.92))))
        readoutRef.current.style.opacity = clamp01(vis).toFixed(3)
      }
      if (spatial && en) {
        const st = en.readState()
        setText(heroRef.current, st.dist < 1000 ? `${Math.round(st.dist)} m` : `${(st.dist / 1000).toFixed(2)} km`)
        setText(k1Ref.current, 'Ground sample')
        setText(k2Ref.current, 'Pyramid level')
        setText(k3Ref.current, 'Axis')
        setText(r1Ref.current, st.gsd < 1 ? `${(st.gsd * 100).toFixed(0)} cm` : `${st.gsd.toFixed(1)} m`)
        setText(r2Ref.current, `z${st.zoom}`)
        setText(r3Ref.current, 'x · y')
      } else if (!spatial && sk) {
        const st = sk.readState()
        setText(heroRef.current, formatDate(st.date))
        setText(k1Ref.current, 'Observation')
        setText(k2Ref.current, 'Status')
        setText(k3Ref.current, 'Axis')
        setText(r1Ref.current, `${nf.format(Math.round(lerp(1, TOTAL_OBS, clamp01(st.index / 259))))} / ${nf.format(TOTAL_OBS)}`)
        setText(r2Ref.current, st.sar ? 'Usable · all weather' : st.cloud ? 'Discarded · cloud' : 'Usable')
        if (r2Ref.current) r2Ref.current.style.color = st.cloud ? '#ff7a4d' : '#7af0b4'
        setText(r3Ref.current, 't')
      }
    },
  })

  useEffect(() => {
    if (!enumRef.current || !stackRef.current) return
    const map = new Map<string, HTMLCanvasElement>([
      ['enum', enumRef.current],
      ['stack', stackRef.current],
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
    <div ref={rootRef} className="mg-root cube-root">
      <div className="stage">
        <canvas ref={enumRef} className="mg-stack-canvas" />
        <canvas ref={stackRef} className="mg-stack-canvas" />
        <div className="vignette" />

        {/* the running population, act one only */}
        <div ref={countWrapRef} className="cube-count-wrap">
          <div ref={countRef} className="mono cube-count">
            1
          </div>
          <div className="micro cube-count-label">stems · instance segmentation</div>
        </div>

        {/* ---------- act one: the spatial axis ---------- */}

        <Beat a={-0.04} b={0.045} className="mg-corner" hold={0.3}>
          <div className="micro mg-eyebrow">
            SylvaSense · ORION-PS-03 · {SITE.id} · merge of Enumeration + The Stack
          </div>
        </Beat>

        <Beat a={0.08} b={0.2} className="cube-bottom-left">
          <h2 className="mg-h2">
            A forest is not a thing.
            <br />
            It is a number of things.
          </h2>
          <p className="mg-body">
            One stem, named and weighed. Then ten. Then two and a half million, at which point the
            camera has climbed far enough that individuals stop being visible at all.
          </p>
        </Beat>

        <Beat a={0.23} b={0.32} className="cube-bottom-centre">
          <h2 className="mg-h2 mg-h2-centre">
            At this altitude it stops being trees
            <br />
            and starts being area.
          </h2>
        </Beat>

        <Beat a={0.35} b={0.47} className="cube-bottom-left">
          <div className="micro mg-tag mg-warn">Subtraction · 2024–2026</div>
          <h2 className="mg-h2">
            {nf.format(METRICS.lossHa2024)} hectares.
            <br />
            {nf.format(LOST)} stems.
            <br />
            One financial year.
          </h2>
        </Beat>

        {/* ---------- the pivot ---------- */}

        <Beat a={0.495} b={0.585} className="mg-pivot" mode="scale" hold={0.2}>
          <div className="mg-pivot-rule" />
          <h2 className="mg-h1">
            Everything you just watched
            <br />
            is <span className="mg-accent">one photograph.</span>
          </h2>
          <p className="mg-lede">
            You have run out of spatial axis. There are two more metres of scale and nothing useful left
            in them — but there is a third axis underneath this frame, and it is forty-two years deep.
          </p>
        </Beat>

        {/* ---------- act two: the temporal axis ---------- */}

        <Beat a={0.6} b={0.68} className="mg-left">
          <div className="micro mg-tag">Descending · optical</div>
          <h2 className="mg-h2">Underneath it, {nf.format(TOTAL_OBS)} more.</h2>
          <p className="mg-body">
            Every observation ever made of this ground, stacked. Two in three optical passes over wet
            tropics return nothing usable; the blue slices are radar, and those never fail.
          </p>
        </Beat>

        <Beat a={0.69} b={0.77} className="cube-event" mode="scale">
          <div className="micro cube-event-k">Last green observation</div>
          <div className="mono cube-event-date">2019-08-15</div>
          <div className="cube-event-note">
            Below this slice the canopy is intact in every frame. Above it, in every frame, it is not.
            The stems you watched disappear have a date.
          </div>
        </Beat>

        <Beat a={0.79} b={0.885} className="mg-top" mode="scale">
          <h2 className="mg-h1">
            Two axes of space.
            <br />
            One of time.
          </h2>
          <p className="mg-lede">
            Each slice collapses to its own cross-section and the loss stops being an event — it becomes
            a shape you can measure the area of.
          </p>
        </Beat>

        <Beat a={0.9} b={1} className="mg-left" mode="left">
          <div className="micro mg-tag">SylvaSense</div>
          <h2 className="mg-h2 mg-accent">
            Query the cube,
            <br />
            not the image.
          </h2>
          <p className="mg-body">
            One column is a hundred square metres of ground with a continuous forty-two year history
            attached. That is the difference between a picture of a forest and a record of one.
          </p>
        </Beat>

        <Beat a={0.915} b={1} className="mg-metrics" style={{ ['--cols' as string]: 5 }}>
          <M k="Stems indexed" v={nf.format(TOTAL)} />
          <M k="Observations" v={nf.format(TOTAL_OBS)} />
          <M k="Usable optical" v="34 %" />
          <M k="Change breakpoint" v="2019-08" alarm />
          <M k="Revisit" v={`${METRICS.revisitDays} days`} />
        </Beat>

        {/* the readout switches instrument at the join */}
        <div ref={readoutRef} className="mg-readout">
          <div ref={heroRef} className="mg-readout-hero">
            38 m
          </div>
          <div className="mg-row">
            <span ref={k1Ref} className="micro">
              Ground sample
            </span>
            <span ref={r1Ref} className="mg-row-v">
              40 cm
            </span>
          </div>
          <div className="mg-row">
            <span ref={k2Ref} className="micro">
              Pyramid level
            </span>
            <span ref={r2Ref} className="mg-row-v">
              z20
            </span>
          </div>
          <div className="mg-row">
            <span ref={k3Ref} className="micro">
              Axis
            </span>
            <span ref={r3Ref} className="mg-row-v">
              x · y
            </span>
          </div>
        </div>
      </div>

      <div className="micro mg-lineage">Merge · Enumeration 05 + The Stack 07</div>
      <ConceptChrome index="Merge 11" title="The Cube" chapters={CHAPTERS} accent="#6fd8e8" />
      <ScrollTrack pages={18} />
    </div>
  )
}

function M({ k, v, alarm }: { k: string; v: string; alarm?: boolean }) {
  return (
    <div className="mg-m">
      <div className="micro mg-m-k">{k}</div>
      <div className="mg-m-v" style={alarm ? { color: '#ff7a4d' } : undefined}>
        {v}
      </div>
    </div>
  )
}
