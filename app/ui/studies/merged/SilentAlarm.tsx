'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createVitalsScene } from '../08-vitals/scene'
import { CELLS, fmtYear, statusOf, yearForScroll } from '../08-vitals/cells'
import { drawTraces } from '../08-vitals/traces'
import { createNightScene } from '../03-nightwatch/scene'
import { Act, ActRunner } from '../lib/merge'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { clamp01, seg, smoothstep } from '../lib/math'
import { METRICS, SITE } from '../lib/data'
import './merge.css'

/**
 * MERGE — Vitals (08) + Night Watch (03)
 *
 * Act one is a patient on a monitor: twelve cells breathing on a twelve-month
 * cycle until six of them flatline. Act two answers the question that leaves —
 * how would anybody have known — by putting you on the ground at 23:10 with
 * nothing optical working, and then running a radar pass over it.
 *
 * The join is a flatline: the last trace goes quiet and the frame goes dark in
 * the same beat, so the darkness reads as the consequence rather than as a
 * scene change.
 */

const CHAPTERS = [
  { at: 0, label: '01 / Twelve cells, one rhythm' },
  { at: 0.15, label: '02 / Wet season, dry season' },
  { at: 0.29, label: '03 / This is not a season' },
  { at: 0.42, label: '04 / Six have stopped' },
  { at: 0.48, label: '05 / It stops in the dark' },
  { at: 0.575, label: '06 / Zero observable hectares' },
  { at: 0.67, label: '07 / C-band' },
  { at: 0.885, label: '08 / SylvaSense' },
]

export default function SilentAlarm() {
  const vitalsRef = useRef<HTMLCanvasElement>(null)
  const nightRef = useRef<HTMLCanvasElement>(null)
  const traceRef = useRef<HTMLCanvasElement>(null)
  const runnerRef = useRef<ActRunner | null>(null)

  const readoutRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const k1 = useRef<HTMLSpanElement>(null)
  const v1 = useRef<HTMLSpanElement>(null)
  const k2 = useRef<HTMLSpanElement>(null)
  const v2 = useRef<HTMLSpanElement>(null)
  const k3 = useRef<HTMLSpanElement>(null)
  const v3 = useRef<HTMLSpanElement>(null)

  const acts = useMemo<Act[]>(
    () => [
      // the rhythm: seasons, then arrhythmia, then six flatlines
      { key: 'vitals', create: createVitalsScene, a: 0, b: 0.5, from: 0, to: 0.82, fade: 0.05 },
      // the dark it happened in, and the sensor that did not need light
      { key: 'night', create: createNightScene, a: 0.46, b: 1, from: 0.12, to: 1, fade: 0.06 },
    ],
    [],
  )

  const { rootRef } = useNarrative({
    pages: 18,
    onFrame: (p, dt, t) => {
      const runner = runnerRef.current
      if (!runner) return
      runner.update(p, dt, t)

      /* ---- the waveform layer belongs to act one only ---- */
      const traceOp = 1 - smoothstep(seg(p, 0.44, 0.52))
      const tc = traceRef.current
      if (tc) {
        tc.style.opacity = traceOp.toFixed(3)
        tc.style.visibility = traceOp < 0.01 ? 'hidden' : 'visible'
        if (traceOp > 0.01) drawTraces(tc, runner.localOf(acts[0], p))
      }

      /* ---- one panel, two instruments ---- */
      const vitalsPhase = p < 0.5
      if (readoutRef.current) {
        const vis =
          smoothstep(seg(p, 0.08, 0.15)) * (1 - smoothstep(seg(p, 0.46, 0.5))) +
          smoothstep(seg(p, 0.56, 0.62)) * (1 - smoothstep(seg(p, 0.9, 0.96)))
        readoutRef.current.style.opacity = clamp01(vis).toFixed(3)
      }

      if (vitalsPhase) {
        const year = yearForScroll(runner.localOf(acts[0], p))
        setText(heroRef.current, fmtYear(year))
        let nom = 0
        let str = 0
        let lost = 0
        for (const c of CELLS) {
          const s = statusOf(c, year)
          if (s === 'lost') lost++
          else if (s === 'stressed') str++
          else nom++
        }
        setText(k1.current, 'Nominal')
        setText(v1.current, String(nom))
        if (v1.current) v1.current.style.color = '#7af0b4'
        setText(k2.current, 'Arrhythmic')
        setText(v2.current, String(str))
        if (v2.current) v2.current.style.color = '#f2c14e'
        setText(k3.current, 'Stopped')
        setText(v3.current, String(lost))
        if (v3.current) v3.current.style.color = lost > 0 ? '#ff6a4d' : 'rgba(220,238,226,0.5)'
      } else {
        const sweep = clamp01(seg(p, 0.66, 0.8))
        setText(heroRef.current, '23:10 local')
        setText(k1.current, 'Optical, observable')
        setText(v1.current, '0.00 ha')
        if (v1.current) v1.current.style.color = '#ff6a4d'
        setText(k2.current, 'C-band, observable')
        setText(v2.current, sweep > 0.02 ? `${(1.18 * sweep).toFixed(2)} Mha` : '—')
        if (v2.current) v2.current.style.color = sweep > 0.02 ? '#7af0b4' : 'rgba(220,238,226,0.5)'
        setText(k3.current, 'Latency to alert')
        setText(v3.current, sweep > 0.5 ? '6 hours' : 'pending')
        if (v3.current) v3.current.style.color = sweep > 0.5 ? '#7af0b4' : 'rgba(220,238,226,0.5)'
      }
    },
  })

  useEffect(() => {
    if (!vitalsRef.current || !nightRef.current) return
    const map = new Map<string, HTMLCanvasElement>([
      ['vitals', vitalsRef.current],
      ['night', nightRef.current],
    ])
    const runner = new ActRunner(map, acts)
    runnerRef.current = runner

    const fitTrace = () => {
      const cv = traceRef.current
      if (!cv) return
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      cv.width = Math.max(2, Math.round(window.innerWidth * dpr))
      cv.height = Math.max(2, Math.round(window.innerHeight * dpr))
      cv.style.width = window.innerWidth + 'px'
      cv.style.height = window.innerHeight + 'px'
      cv.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fitTrace()

    const onResize = () => {
      runner.resize()
      fitTrace()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      runner.dispose()
      runnerRef.current = null
    }
  }, [acts])

  return (
    <div ref={rootRef} className="mg-root sa-root">
      <div className="stage">
        <canvas ref={vitalsRef} className="mg-stack-canvas" />
        <canvas ref={nightRef} className="mg-stack-canvas" />
        <canvas ref={traceRef} className="sa-traces" />
        <div className="vignette" />

        {/* ---------- act one: the rhythm ---------- */}

        <Beat a={-0.04} b={0.04} className="mg-corner" hold={0.3}>
          <div className="micro mg-eyebrow">
            SylvaSense · ORION-PS-03 · {SITE.id} · merge of Vitals + Night Watch
          </div>
        </Beat>

        <Beat a={0.03} b={0.12} className="mg-centre" mode="scale">
          <h1 className="mg-h1">
            Twelve cells.
            <br />
            <span className="mg-accent">One rhythm.</span>
          </h1>
          <p className="mg-lede">
            A forest breathes on a twelve-month cycle — leaf out, green up, dry down, repeat. Put
            forty-two years of that on a monitor and it looks exactly like what it is.
          </p>
        </Beat>

        <Beat a={0.15} b={0.26} className="mg-left">
          <div className="micro mg-tag">1984 to 2003 · nominal</div>
          <h2 className="mg-h2">Wet season, dry season, repeat.</h2>
          <p className="mg-body">
            Every trace is one monitoring cell, and the amplitude is how hard it is photosynthesising.
            Healthy cells are boring. That is the entire diagnostic value of them.
          </p>
        </Beat>

        <Beat a={0.29} b={0.4} className="mg-left">
          <div className="micro mg-tag mg-warn">2004 to 2019 · arrhythmia</div>
          <h2 className="mg-h2 mg-warn">This is not a season.</h2>
          <p className="mg-body">
            The peaks shorten, the troughs deepen, and the interval stops being twelve months. Selective
            logging and edge drying do this years before the canopy is visibly gone.
          </p>
        </Beat>

        <Beat a={0.42} b={0.47} className="mg-left">
          <div className="micro mg-tag mg-bad">2019 to 2026</div>
          <h2 className="mg-h2 mg-bad">
            <span className="mono">
              <Counter from={0} to={6} a={0.418} b={0.438} />
            </span>{' '}
            of the twelve have stopped.
          </h2>
        </Beat>

        {/* ---------- the pivot ---------- */}

        <Beat a={0.48} b={0.555} className="mg-pivot" mode="scale" hold={0.2}>
          <div className="mg-pivot-rule" />
          <h2 className="mg-h1">
            A forest does not stop
            <br />
            breathing loudly.
          </h2>
          <p className="mg-lede">
            Five of those six stopped between 22:00 and 04:00, under cloud, in the half of the calendar
            when nothing optical can see this basin at all.
          </p>
        </Beat>

        {/* ---------- act two: the dark it happened in ---------- */}

        <Beat a={0.575} b={0.65} className="mg-left">
          <div className="micro mg-tag">23:10 local · 96 % cloud</div>
          <h2 className="mg-h2">
            <span className="mono sa-zero">0.00 ha</span>
          </h2>
          <p className="mg-body">
            Observable from the ground, from the air and from every optical sensor in orbit. The event
            that flattened three of those traces is happening right now, in this frame.
          </p>
        </Beat>

        <Beat a={0.67} b={0.76} className="mg-left">
          <div className="micro mg-tag sa-cyan">55.5 mm · C-band · descending pass</div>
          <h2 className="mg-h2 sa-cyan">Radar brings its own light.</h2>
          <p className="mg-body">
            Sentinel-1 illuminates the canopy itself and reads how rough the return is. Cloud is
            transparent at this wavelength and darkness is irrelevant, so the pass runs on schedule
            whatever the sky is doing.
          </p>
        </Beat>

        <Beat a={0.78} b={0.87} className="mg-left">
          <div className="micro mg-tag">Fusion</div>
          <h2 className="mg-h2">The trace and the scene are the same event.</h2>
          <p className="mg-body">
            A flatline says <em>something ended here</em>; a radar pass says <em>this is the shape of
            it, and it is 1,840 hectares</em>. Neither is conclusive alone. The agreement is.
          </p>
        </Beat>

        {/* ---------- sylvasense ---------- */}

        <Beat a={0.885} b={0.96} className="mg-top" mode="scale">
          <h2 className="mg-h1">
            The alarm existed.
            <br />
            <span className="mg-accent">Nobody was subscribed to it.</span>
          </h2>
          <p className="mg-lede">
            Every figure in this arc came from data that was already being collected and already being
            thrown away. SylvaSense is the subscription.
          </p>
        </Beat>

        <Beat a={0.93} b={1} className="mg-metrics" style={{ ['--cols' as string]: 5 }}>
          <M k="Cells monitored" v="12" />
          <M k="Stopped by 2026" v="6" alarm />
          <M k="Optical, at 23:10" v="0.00 ha" alarm />
          <M k="C-band, at 23:10" v="1.18 Mha" good />
          <M k="Revisit" v={`${METRICS.revisitDays} days`} good />
        </Beat>

        {/* the instrument, switching at the join */}
        <div ref={readoutRef} className="mg-readout">
          <div ref={heroRef} className="mg-readout-hero">
            1984-01
          </div>
          <div className="mg-row">
            <span ref={k1} className="micro">
              Nominal
            </span>
            <span ref={v1} className="mg-row-v">
              12
            </span>
          </div>
          <div className="mg-row">
            <span ref={k2} className="micro">
              Arrhythmic
            </span>
            <span ref={v2} className="mg-row-v">
              0
            </span>
          </div>
          <div className="mg-row">
            <span ref={k3} className="micro">
              Stopped
            </span>
            <span ref={v3} className="mg-row-v">
              0
            </span>
          </div>
        </div>
      </div>

      <div className="micro mg-lineage">Merge · Vitals 08 + Night Watch 03</div>
      <ConceptChrome index="Merge 15" title="The Silent Alarm" chapters={CHAPTERS} accent="#7af0b4" />
      <ScrollTrack pages={18} />
    </div>
  )
}

function M({ k, v, alarm, good }: { k: string; v: string; alarm?: boolean; good?: boolean }) {
  return (
    <div className="mg-m">
      <div className="micro mg-m-k">{k}</div>
      <div className="mg-m-v" style={alarm ? { color: '#ff6a4d' } : good ? { color: '#7af0b4' } : undefined}>
        {v}
      </div>
    </div>
  )
}
