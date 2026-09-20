'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createRingsRenderer, yearAt } from '../02-rings/renderer'
import { createNightScene } from '../03-nightwatch/scene'
import { drawPressedLeaf, drawVectorLeaf, toURL } from '../04-herbarium/art'
import { Act, ActRunner, SceneLike } from '../lib/merge'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { clamp01, easeInOutCubic, lerp, mulberry32, seg, smoothstep } from '../lib/math'
import { METRICS, RING_SERIES, SITE, SPECIMENS } from '../lib/data'
import './merge.css'

/**
 * MERGE — Growth Rings (02) + Herbarium (04) + Night Watch (03)
 *
 * Three ways to keep a record of a forest, in the order of how much the forest
 * has to give up for each: cut it down and count the rings, press it and file
 * it, or leave it standing and watch it from orbit. The palette walks warm
 * wood → cream paper → cold radar, which is the argument in colour.
 */

const CHAPTERS = [
  { at: 0, label: '01 / Three methods' },
  { at: 0.14, label: '02 / Method one — end it' },
  { at: 0.33, label: '03 / Method two — press it' },
  { at: 0.58, label: '04 / Method three — leave it standing' },
  { at: 0.74, label: '05 / C-band' },
  { at: 0.84, label: '06 / Structure' },
  { at: 0.93, label: '07 / SylvaSense' },
]

const SHEETS = 12

/** the Rings renderer exposes draw(), not update() */
const createRingsAct = (canvas: HTMLCanvasElement): SceneLike => {
  const r = createRingsRenderer(canvas)
  return {
    update: (p, _dt, t) => r.draw(p, t),
    resize: () => r.resize(),
    dispose: () => r.dispose(),
  }
}

export default function TheRecord() {
  const ringsRef = useRef<HTMLCanvasElement>(null)
  const nightRef = useRef<HTMLCanvasElement>(null)
  const runnerRef = useRef<ActRunner | null>(null)

  const paperRef = useRef<HTMLDivElement>(null)
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([])
  const heroSheetRef = useRef<HTMLDivElement>(null)
  const ringReadRef = useRef<HTMLDivElement>(null)
  const ringYearRef = useRef<HTMLDivElement>(null)
  const ringSigRef = useRef<HTMLSpanElement>(null)

  const cells = useMemo(() => {
    const rnd = mulberry32(31)
    return Array.from({ length: SHEETS }, (_, i) => ({
      x: ((i % 4) - 1.5) * 19,
      y: (Math.floor(i / 4) - 1) * 30,
      r: (rnd() - 0.5) * 3,
      rec: SPECIMENS[i % SPECIMENS.length],
      leaf: i % 3,
    }))
  }, [])

  const art = useMemo(
    () => ({
      leaves: [0, 1, 2].map((i) => toURL(drawPressedLeaf(300, 520, 3 + i * 7))),
      vectors: [0, 1, 2].map((i) => toURL(drawVectorLeaf(300, 520, 3 + i * 7))),
    }),
    [],
  )

  const acts = useMemo<Act[]>(
    () => [
      // canopy → descent → the cut → rings accumulating
      { key: 'rings', create: createRingsAct, a: 0, b: 0.36, from: 0, to: 0.6, fade: 0.05 },
      // nightfall → blind → radar → structure → segmentation
      { key: 'night', create: createNightScene, a: 0.58, b: 1, from: 0.22, to: 1, fade: 0.05 },
    ],
    [],
  )

  const { rootRef } = useNarrative({
    pages: 19,
    onFrame: (p, dt, t) => {
      runnerRef.current?.update(p, dt, t)

      /* ---- the dendro readout, act one ---- */
      if (ringReadRef.current) {
        const vis = smoothstep(seg(p, 0.15, 0.2)) * (1 - smoothstep(seg(p, 0.3, 0.35)))
        ringReadRef.current.style.opacity = vis.toFixed(3)
        if (vis > 0.01) {
          const local = 0.6 * clamp01(seg(p, 0, 0.36))
          const y = yearAt(local)
          const rec = RING_SERIES[Math.min(RING_SERIES.length - 1, y - RING_SERIES[0].year)]
          setText(ringYearRef.current, String(y))
          const label = rec.scar === 2 ? 'Fire scar' : rec.scar === 1 ? 'Drought' : 'Nominal growth'
          setText(ringSigRef.current, label)
          if (ringSigRef.current)
            ringSigRef.current.style.color =
              rec.scar === 2 ? '#ff7a4d' : rec.scar === 1 ? '#f2b134' : 'rgba(224,232,226,0.66)'
        }
      }

      /* ---- act two: the herbarium ---- */
      const paperIn = smoothstep(seg(p, 0.31, 0.38))
      const paperOut = smoothstep(seg(p, 0.58, 0.65))
      if (paperRef.current) {
        const v = paperIn * (1 - paperOut)
        paperRef.current.style.opacity = v.toFixed(3)
        paperRef.current.style.visibility = v < 0.01 ? 'hidden' : 'visible'
      }

      const spread = easeInOutCubic(seg(p, 0.34, 0.44))
      const run = Math.pow(seg(p, 0.45, 0.56), 1.6) * 4200
      const SPACING = 190
      for (let i = 0; i < SHEETS; i++) {
        const el = sheetRefs.current[i]
        if (!el) continue
        const c = cells[i]
        let z = -i * SPACING * spread + run
        const span = SHEETS * SPACING
        while (z > 380) z -= span
        while (z < 380 - span) z += span
        const near = clamp01((z + 200) / 620)
        const zFade = run > 1 ? clamp01((z + span - 200) / 400) * (1 - smoothstep((z - 210) / 190)) : 1
        const op = (1 - paperOut) * clamp01(0.18 + zFade)
        el.style.transform =
          `translate3d(${(c.x * lerp(1, 1.45, spread)).toFixed(2)}vw, ${(c.y * lerp(1, 1.3, spread)).toFixed(2)}vh, ${z.toFixed(1)}px) ` +
          `rotateZ(${c.r.toFixed(2)}deg)`
        el.style.opacity = op.toFixed(3)
        el.style.filter = near > 0.74 ? `blur(${((near - 0.74) * 20).toFixed(1)}px)` : ''
        el.style.visibility = op < 0.01 ? 'hidden' : 'visible'
      }

      if (heroSheetRef.current) {
        const inT = smoothstep(seg(p, 0.545, 0.585))
        const out = smoothstep(seg(p, 0.6, 0.65))
        const v = inT * (1 - out)
        heroSheetRef.current.style.opacity = v.toFixed(3)
        heroSheetRef.current.style.visibility = v < 0.01 ? 'hidden' : 'visible'
        const vec = heroSheetRef.current.querySelector<HTMLElement>('.rc-leaf-vec')
        if (vec) vec.style.opacity = smoothstep(seg(p, 0.565, 0.61)).toFixed(3)
        const plate = heroSheetRef.current.querySelector<HTMLElement>('.rc-leaf-plate')
        if (plate) plate.style.opacity = (1 - smoothstep(seg(p, 0.565, 0.61)) * 0.7).toFixed(3)
      }
    },
  })

  useEffect(() => {
    if (!ringsRef.current || !nightRef.current) return
    const map = new Map<string, HTMLCanvasElement>([
      ['rings', ringsRef.current],
      ['night', nightRef.current],
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
    <div ref={rootRef} className="mg-root rc-root">
      <div className="stage rc-stage">
        <canvas ref={ringsRef} className="mg-stack-canvas" />
        <canvas ref={nightRef} className="mg-stack-canvas" />

        {/* act two lives on paper, above both canvases */}
        <div ref={paperRef} className="rc-paper">
          <div className="rc-fibre" />
          <div className="rc-world">
            {cells.map((c, i) => (
              <div key={i} ref={(el) => { sheetRefs.current[i] = el }} className="rc-sheet">
                <div className="rc-sheet-rule" />
                <img className="rc-leaf" src={art.leaves[c.leaf]} alt="" />
                <div className="rc-fields">
                  <div className="rc-taxon editorial">{c.rec.taxon}</div>
                  <div className="rc-meta mono">
                    <span>{c.rec.id}</span>
                    <span>{c.rec.last}</span>
                  </div>
                </div>
                <div className="rc-stamp">{c.rec.status}</div>
              </div>
            ))}
          </div>

          <div ref={heroSheetRef} className="rc-hero rc-sheet">
            <div className="rc-sheet-rule" />
            <img className="rc-leaf rc-leaf-plate" src={art.leaves[0]} alt="" />
            <img className="rc-leaf rc-leaf-vec" src={art.vectors[0]} alt="" />
            <div className="rc-fields">
              <div className="rc-taxon editorial">{SPECIMENS[0].taxon}</div>
              <div className="rc-meta mono">
                <span>{SPECIMENS[0].id}</span>
                <span>{SPECIMENS[0].last}</span>
              </div>
            </div>
            <div className="rc-stamp rc-stamp-red">{SPECIMENS[0].status}</div>
          </div>
        </div>

        <div className="vignette" />

        {/* ---------- titles ---------- */}

        <Beat a={-0.04} b={0.04} className="mg-corner" hold={0.3}>
          <div className="micro mg-eyebrow">
            SylvaSense · ORION-PS-03 · {SITE.id} · merge of Growth Rings + Herbarium + Night Watch
          </div>
        </Beat>

        <Beat a={0.03} b={0.13} className="mg-centre" mode="scale">
          <h1 className="rc-h1 editorial">
            Three ways to keep a record
            <br />
            <em>of a forest.</em>
          </h1>
          <p className="mg-lede">In order of how much the forest has to give up for each.</p>
        </Beat>

        {/* method one */}
        <Beat a={0.15} b={0.24} className="rc-left">
          <div className="micro rc-num">Method one</div>
          <h2 className="rc-h2 editorial">End it.</h2>
          <p className="mg-body">
            A tree writes one line a year. Width is rainfall, char is fire, and the sequence is
            completely honest — which is why it has been the gold standard for a century. Reading it
            requires the tree to be dead.
          </p>
        </Beat>

        <Beat a={0.25} b={0.32} className="rc-left">
          <p className="mg-body rc-strong">
            One stem, felled, dated. Behind it stand{' '}
            <span className="mono rc-inline">{METRICS.treesDetected.toLocaleString('en-US')}</span> others
            that cannot be read this way, and never will be.
          </p>
        </Beat>

        {/* method two */}
        <Beat a={0.325} b={0.42} className="mg-pivot" mode="scale" hold={0.2}>
          <div className="mg-pivot-rule" />
          <div className="micro rc-num rc-num-dark">Method two</div>
          <h2 className="rc-h1 editorial rc-dark">Press it.</h2>
        </Beat>

        <Beat a={0.44} b={0.56} className="rc-left rc-left-dark">
          <h2 className="rc-h2 editorial rc-dark">
            <span className="mono">41,904</span> sheets.
          </h2>
          <p className="mg-body rc-body-dark">
            Every one accurate. Every one beautiful. Every one past tense — the date on the label is the
            last time anybody actually looked.
          </p>
        </Beat>

        {/* method three */}
        <Beat a={0.552} b={0.628} className="mg-pivot" mode="scale" hold={0.2}>
          <div className="mg-pivot-rule" />
          <div className="micro rc-num">Method three</div>
          <h2 className="rc-h1 editorial">Leave it standing.</h2>
        </Beat>

        <Beat a={0.632} b={0.7} className="mg-centre" hold={0.2}>
          <div className="rc-zero mono">0.00 ha</div>
          <div className="micro rc-zero-note">observable from the ground, all sensors, 23:10 local</div>
        </Beat>

        <Beat a={0.705} b={0.79} className="mg-left">
          <div className="micro mg-tag">55.5 mm · C-band</div>
          <h2 className="mg-h2">Nothing has to die for this one.</h2>
          <p className="mg-body">
            Radar illuminates the canopy itself and reads its roughness. It works at night, through
            cloud and smoke, every six days, and it removes nothing from the forest in order to measure
            it.
          </p>
        </Beat>

        <Beat a={0.8} b={0.868} className="mg-left">
          <div className="micro mg-tag">Fusion stack</div>
          <h2 className="mg-h2">Four physics, one ground.</h2>
          <p className="mg-body">
            SAR, optical, vegetation index and canopy height, read for the same hectare on the same
            pass. No single layer is conclusive; the agreement between them is.
          </p>
        </Beat>

        <Beat a={0.875} b={0.945} className="mg-left">
          <div className="micro mg-tag">Fused returns</div>
          <h2 className="mg-h2">Structure, not colour.</h2>
          <p className="mg-body">
            Height carries biomass. What the ring count gave you for one stem, a canopy height model
            gives you for <span className="mono mg-accent">{METRICS.treesDetected.toLocaleString('en-US')}</span>{' '}
            of them, and it updates.
          </p>
        </Beat>

        <Beat a={0.95} b={1} className="mg-top" mode="scale">
          <h2 className="mg-h1">
            <span className="mono">
              <Counter from={0} to={METRICS.treesDetected} a={0.952} b={0.995} />
            </span>
            <br />
            crowns, none of them felled.
          </h2>
        </Beat>

        <Beat a={0.955} b={1} className="mg-metrics" style={{ ['--cols' as string]: 5 }}>
          <M k="Method one" v="1 stem" s="destructive · once" />
          <M k="Method two" v="41,904 sheets" s="non-destructive · once" />
          <M k="Method three" v={METRICS.treesDetected.toLocaleString('en-US')} s={`every ${METRICS.revisitDays} days`} good />
          <M k="Mean canopy height" v={`${METRICS.meanCanopyHeightM} m`} s="LiDAR-calibrated" />
          <M k="Confidence" v={`${(METRICS.meanConfidence * 100).toFixed(1)} %`} s="validated subset" />
        </Beat>

        {/* dendro readout */}
        <div ref={ringReadRef} className="rc-readout">
          <div className="micro rc-readout-k">Ring year</div>
          <div ref={ringYearRef} className="mono rc-year">
            1802
          </div>
          <div className="mg-row">
            <span className="micro">Signal</span>
            <span ref={ringSigRef} className="mg-row-v">
              Nominal growth
            </span>
          </div>
        </div>
      </div>

      <div className="micro mg-lineage">Merge · Growth Rings 02 + Herbarium 04 + Night Watch 03</div>
      <ConceptChrome index="Merge 14" title="The Record" chapters={CHAPTERS} accent="#e8b96a" />
      <ScrollTrack pages={19} />
    </div>
  )
}

function M({ k, v, s, good }: { k: string; v: string; s: string; good?: boolean }) {
  return (
    <div className="mg-m">
      <div className="micro mg-m-k">{k}</div>
      <div className="mg-m-v" style={good ? { color: '#7af0b4' } : undefined}>
        {v}
      </div>
      <div className="micro rc-m-s">{s}</div>
    </div>
  )
}
