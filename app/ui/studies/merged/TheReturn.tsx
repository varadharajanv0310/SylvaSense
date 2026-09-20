'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createRainScene, RainScene } from '../09-rain/scene'
import { createSeedScene, SeedScene } from '../10-seed/scene'
import { Act, ActRunner } from '../lib/merge'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { clamp01, seg, smoothstep } from '../lib/math'
import { MEDIA, ScrubVideo } from '../lib/media'
import { METRICS, SITE } from '../lib/data'
import './merge.css'

/**
 * MERGE — Rain (09) + Seed (10)
 *
 * The first act rides one circuit of the water the forest moves, and watches
 * the circuit open when the forest is removed. The second act tries to put the
 * forest back — into the drier climate the first act just created. They meet
 * on the same parched ochre ground, which is why the join reads as consequence
 * rather than as a cut.
 *
 * The evidence panel in act one is a real Landsat sequence of Rondonia,
 * 1977 to 2003, with the scrollbar as its time axis.
 */

const CHAPTERS = [
  { at: 0, label: '01 / A forest makes its own rain' },
  { at: 0.18, label: '02 / The flying river' },
  { at: 0.34, label: '03 / The loop opens' },
  { at: 0.46, label: '04 / You cannot replant rain' },
  { at: 0.545, label: '05 / Year zero' },
  { at: 0.61, label: '06 / The green trap' },
  { at: 0.82, label: '07 / Year eighty' },
  { at: 0.91, label: '08 / SylvaSense' },
]

const nf = new Intl.NumberFormat('en-US')

export default function TheReturn() {
  const rainRef = useRef<HTMLCanvasElement>(null)
  const seedRef = useRef<HTMLCanvasElement>(null)
  const runnerRef = useRef<ActRunner | null>(null)

  const scrubElRef = useRef<HTMLVideoElement>(null)
  const scrubRef = useRef<ScrubVideo | null>(null)
  const scrubWrapRef = useRef<HTMLDivElement>(null)
  const scrubYearRef = useRef<HTMLSpanElement>(null)

  const readoutRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const k1 = useRef<HTMLSpanElement>(null)
  const k2 = useRef<HTMLSpanElement>(null)
  const v1 = useRef<HTMLSpanElement>(null)
  const v2 = useRef<HTMLSpanElement>(null)

  const acts = useMemo<Act[]>(
    () => [
      // wet canopy → column → flying river → rain → the loop opening
      { key: 'rain', create: createRainScene, a: 0, b: 0.52, from: 0, to: 0.92, fade: 0.05 },
      // bare ground → pioneers → succession → year eighty
      { key: 'seed', create: createSeedScene, a: 0.48, b: 1, from: 0.04, to: 1, fade: 0.05 },
    ],
    [],
  )

  const { rootRef } = useNarrative({
    pages: 18,
    onFrame: (p, dt, t) => {
      const runner = runnerRef.current
      if (!runner) return
      runner.update(p, dt, t)

      // scroll is the time axis of the Landsat sequence
      const sw = scrubWrapRef.current
      if (sw) {
        const vis = smoothstep(seg(p, 0.28, 0.34)) * (1 - smoothstep(seg(p, 0.45, 0.5)))
        sw.style.opacity = vis.toFixed(3)
        sw.style.visibility = vis < 0.01 ? 'hidden' : 'visible'
        if (vis > 0.01) {
          const k = clamp01(seg(p, 0.29, 0.46))
          scrubRef.current?.seek(k)
          scrubRef.current?.update()
          setText(scrubYearRef.current, String(1977 + Math.round(k * 26)))
        }
      }

      const water = p < 0.5
      const rs = runner.get<RainScene>('rain')
      const ss = runner.get<SeedScene>('seed')
      if (readoutRef.current) {
        const vis =
          smoothstep(seg(p, 0.08, 0.15)) * (1 - smoothstep(seg(p, 0.44, 0.48))) +
          smoothstep(seg(p, 0.53, 0.59)) * (1 - smoothstep(seg(p, 0.94, 0.99)))
        readoutRef.current.style.opacity = clamp01(vis).toFixed(3)
      }
      if (water && rs) {
        const st = rs.readState()
        setText(heroRef.current, st.altitude < 1000 ? `${Math.round(st.altitude)} m` : `${(st.altitude / 1000).toFixed(1)} km`)
        setText(k1.current, 'Atmospheric flux')
        setText(v1.current, `${st.flux.toFixed(1)} Gt/day`)
        if (v1.current) v1.current.style.color = p > 0.36 ? '#e0a765' : '#8fe8de'
        setText(k2.current, 'Axis')
        setText(v2.current, 'Altitude')
        if (v2.current) v2.current.style.color = ''
      } else if (!water && ss) {
        const st = ss.readState()
        setText(heroRef.current, `Year ${Math.floor(st.year)}`)
        setText(k1.current, 'Above-ground carbon')
        const pct = (st.carbon / METRICS.agbTHa) * 100
        setText(v1.current, `${st.carbon.toFixed(1)} t/ha · ${pct.toFixed(0)}%`)
        if (v1.current) v1.current.style.color = pct > 60 ? '#a8d86a' : pct > 25 ? '#e0c765' : '#e08a65'
        setText(k2.current, 'Living stems')
        setText(v2.current, nf.format(st.stems))
        if (v2.current) v2.current.style.color = ''
      }
    },
  })

  useEffect(() => {
    if (!rainRef.current || !seedRef.current) return
    const map = new Map<string, HTMLCanvasElement>([
      ['rain', rainRef.current],
      ['seed', seedRef.current],
    ])
    if (scrubElRef.current) scrubRef.current = new ScrubVideo(scrubElRef.current)
    const runner = new ActRunner(map, acts)
    runnerRef.current = runner
    const onResize = () => runner.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      runner.dispose()
      scrubRef.current?.dispose()
      scrubRef.current = null
      runnerRef.current = null
    }
  }, [acts])

  return (
    <div ref={rootRef} className="mg-root tr-root">
      <div className="stage">
        <canvas ref={rainRef} className="mg-stack-canvas" />
        <canvas ref={seedRef} className="mg-stack-canvas" />
        <div className="vignette" />

        {/* ---------- act one: the water ---------- */}

        <Beat a={-0.04} b={0.045} className="mg-corner" hold={0.3}>
          <div className="micro mg-eyebrow">
            SylvaSense · ORION-PS-03 · {SITE.id} · merge of Rain + Seed
          </div>
        </Beat>

        <Beat a={0.04} b={0.16} className="mg-centre" mode="scale">
          <h1 className="mg-h1">
            A forest does not
            <br />
            wait for rain. <span className="mg-accent">It makes it.</span>
          </h1>
          <p className="mg-lede">
            One large tree moves a thousand litres a day into the air, drawn up nine metres against
            gravity and released through the leaves, on sunlight alone.
          </p>
        </Beat>

        <Beat a={0.19} b={0.32} className="mg-centre" mode="scale">
          <h2 className="mg-h1">
            <span className="mono mg-accent">
              <Counter from={0} to={20.1} a={0.19} b={0.3} decimals={1} />
            </span>{' '}
            billion tonnes a day.
          </h2>
          <p className="mg-lede">
            More water crosses this basin through the air than down the river beneath it, and between a
            quarter and a half of the rain that falls here was transpired by the forest it falls on.
          </p>
        </Beat>

        <Beat a={0.35} b={0.45} className="mg-left">
          <div className="micro mg-tag mg-warn">The loop opens</div>
          <h2 className="mg-h2 mg-warn">Cleared ground transpires almost nothing.</h2>
          <p className="mg-body">
            The column thins, the cloud deck fails to form, and the rain that should have fallen here
            falls somewhere else. Each hectare lost makes the next one drier.
          </p>
        </Beat>

        {/* real Landsat imagery, scrubbed by the same scroll */}
        <div ref={scrubWrapRef} className="tr-scrub">
          <video ref={scrubElRef} className="tr-scrub-vid" src={MEDIA.rondonia} preload="auto" playsInline muted />
          <div className="tr-scrub-bar">
            <span className="micro tr-scrub-k">Landsat · Rondônia · 30 m</span>
            <span ref={scrubYearRef} className="mono tr-scrub-y">
              1977
            </span>
          </div>
        </div>

        {/* ---------- the pivot ---------- */}

        <Beat a={0.46} b={0.535} className="mg-pivot" mode="scale" hold={0.2}>
          <div className="mg-pivot-rule" />
          <h2 className="mg-h1">
            You can replant the trees.
            <br />
            <span className="mg-bad">You cannot replant the rain.</span>
          </h2>
          <p className="mg-lede">
            Everything that follows happens on this ground, in the drier climate the last four minutes
            created. That is the part restoration models are worst at.
          </p>
        </Beat>

        {/* ---------- act two: the attempt ---------- */}

        <Beat a={0.545} b={0.6} className="mg-left">
          <div className="micro mg-tag">Year 0 to 3</div>
          <h2 className="mg-h2">Nothing happens for a long time.</h2>
          <p className="mg-body">
            Seed arrives on wind and in the gut of birds that no longer have anywhere to perch. On
            compacted ground in full sun, the first three years produce about a metre.
          </p>
        </Beat>

        <Beat a={0.61} b={0.7} className="mg-left">
          <div className="micro mg-tag tr-lime">Year 5 to 20 · pioneers</div>
          <h2 className="mg-h2 tr-lime">Then it goes green fast, and that is the trap.</h2>
          <p className="mg-body">
            Fast species close the ground inside a decade. At ten metres per pixel this already reads as
            forest — the greenness recovers years before the carbon does, and a thinner water cycle slows
            what comes next.
          </p>
        </Beat>

        <Beat a={0.72} b={0.8} className="mg-left">
          <div className="micro mg-tag">Year 20 to 50 · succession</div>
          <h2 className="mg-h2">The slow species are the ones that matter.</h2>
          <p className="mg-body">
            Pioneers are shaded out by the trees they sheltered. Hardwoods put on height at a fifth of the
            rate and hold four times the carbon — and in a drier basin they take longer still.
          </p>
        </Beat>

        <Beat a={0.82} b={0.9} className="mg-top" mode="scale">
          <h2 className="mg-h1">
            A forest that looks finished
            <br />
            and a forest that <em>is</em> finished
            <br />
            are <span className="tr-lime">eighty years</span> apart.
          </h2>
        </Beat>

        {/* ---------- sylvasense ---------- */}

        <Beat a={0.91} b={1} className="mg-left" mode="left">
          <div className="micro mg-tag">SylvaSense</div>
          <h2 className="mg-h2 mg-accent">
            Eighty years is
            <br />
            5,840 observations.
          </h2>
          <p className="mg-body">
            Canopy height separates real recovery from a green-looking thicket, and evapotranspiration
            says whether the water cycle came back with it. Patience becomes fundable the moment it
            becomes checkable.
          </p>
        </Beat>

        <Beat a={0.93} b={1} className="mg-metrics" style={{ ['--cols' as string]: 5 }}>
          <M k="Basin flux" v="20.1 Gt/day" />
          <M k="Flux over cleared cells" v="−68 %" alarm />
          <M k="Canopy cover, year 80" v="94 %" />
          <M k="Carbon, year 80" v="71 %" alarm />
          <M k="Observations" v="5,840" good />
        </Beat>

        {/* the readout switches instrument at the join */}
        <div ref={readoutRef} className="mg-readout">
          <div ref={heroRef} className="mg-readout-hero">
            16 m
          </div>
          <div className="mg-row">
            <span ref={k1} className="micro">
              Atmospheric flux
            </span>
            <span ref={v1} className="mg-row-v">
              20.1 Gt/day
            </span>
          </div>
          <div className="mg-row">
            <span ref={k2} className="micro">
              Axis
            </span>
            <span ref={v2} className="mg-row-v">
              Altitude
            </span>
          </div>
        </div>
      </div>

      <div className="micro mg-lineage">Merge · Rain 09 + Seed 10</div>
      <ConceptChrome index="Merge 13" title="The Return" chapters={CHAPTERS} accent="#8fe8de" />
      <ScrollTrack pages={18} />
    </div>
  )
}

function M({ k, v, alarm, good }: { k: string; v: string; alarm?: boolean; good?: boolean }) {
  return (
    <div className="mg-m">
      <div className="micro mg-m-k">{k}</div>
      <div className="mg-m-v" style={alarm ? { color: '#e0a765' } : good ? { color: '#a8d86a' } : undefined}>
        {v}
      </div>
    </div>
  )
}
