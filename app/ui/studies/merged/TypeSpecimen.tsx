'use client'

import { useEffect, useMemo, useRef } from 'react'
import { drawPressedLeaf, drawVectorLeaf, toURL } from '../04-herbarium/art'
import { createEnumScene, EnumScene } from '../05-enumeration/scene'
import { Act, ActRunner } from '../lib/merge'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, ScrollTrack } from '../lib/ui'
import { clamp01, easeInOutCubic, lerp, mulberry32, seg, smoothstep } from '../lib/math'
import { METRICS, SITE, SPECIMENS } from '../lib/data'
import './merge.css'

/**
 * MERGE — Herbarium (04) + Enumeration (05)
 *
 * Two censuses of the same forest, two centuries apart, asking different
 * questions. The herbarium asked *what is this* — once per species, by hand,
 * beautifully, and never again. The satellite asks *is it still there* — once
 * per stem, every five days, and not beautifully at all.
 *
 * The join is literal: the pressed leaf on the hero sheet resolves to its
 * vector outline, the outline is the silhouette of one living stem, and that
 * stem is instance zero of two and a half million.
 */

const CHAPTERS = [
  { at: 0, label: '01 / One sheet, 1857' },
  { at: 0.115, label: '02 / 41,904 sheets' },
  { at: 0.22, label: '03 / Every one past tense' },
  { at: 0.3, label: '04 / Twelve years since anybody looked' },
  { at: 0.43, label: '05 / The second question' },
  { at: 0.515, label: '06 / Multiplication' },
  { at: 0.665, label: '07 / Subtraction' },
  { at: 0.86, label: '08 / SylvaSense' },
]

const SHEETS = 12
const TOTAL = METRICS.treesDetected
const LOST = 904_118
const nf = new Intl.NumberFormat('en-US')

function population(p: number) {
  if (p < 0.555) return Math.max(1, Math.pow(seg(p, 0.394, 0.555), 3.2) * TOTAL)
  if (p < 0.63) return TOTAL
  if (p < 0.75) return TOTAL - smoothstep(seg(p, 0.63, 0.75)) * LOST
  return TOTAL - LOST
}

export default function TypeSpecimen() {
  const enumRef = useRef<HTMLCanvasElement>(null)
  const runnerRef = useRef<ActRunner | null>(null)

  const paperRef = useRef<HTMLDivElement>(null)
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([])
  const heroSheetRef = useRef<HTMLDivElement>(null)

  const countWrapRef = useRef<HTMLDivElement>(null)
  const countRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const v1 = useRef<HTMLSpanElement>(null)
  const v2 = useRef<HTMLSpanElement>(null)

  const cells = useMemo(() => {
    const rnd = mulberry32(17)
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
      leaves: [0, 1, 2].map((i) => toURL(drawPressedLeaf(300, 520, 5 + i * 9))),
      vectors: [0, 1, 2].map((i) => toURL(drawVectorLeaf(300, 520, 5 + i * 9))),
    }),
    [],
  )

  const acts = useMemo<Act[]>(
    () => [
      // one stem → two and a half million → the subtraction → orbit
      { key: 'enum', create: createEnumScene, a: 0.36, b: 1, from: 0.05, to: 1, fade: 0.07 },
    ],
    [],
  )

  const { rootRef } = useNarrative({
    pages: 19,
    onFrame: (p, dt, t) => {
      const runner = runnerRef.current
      if (!runner) return
      runner.update(p, dt, t)

      /* ---- act one lives entirely in the DOM ---- */
      const paperOut = smoothstep(seg(p, 0.36, 0.42))
      if (paperRef.current) {
        const v = smoothstep(seg(p, -0.02, 0.045)) * (1 - paperOut)
        paperRef.current.style.opacity = v.toFixed(3)
        paperRef.current.style.visibility = v < 0.01 ? 'hidden' : 'visible'
      }

      const spread = easeInOutCubic(seg(p, 0.05, 0.145))
      const run = Math.pow(seg(p, 0.17, 0.31), 1.6) * 4200
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
        const inT = smoothstep(seg(p, 0.3, 0.335))
        const out = smoothstep(seg(p, 0.36, 0.41))
        const v = inT * (1 - out)
        heroSheetRef.current.style.opacity = v.toFixed(3)
        heroSheetRef.current.style.visibility = v < 0.01 ? 'hidden' : 'visible'
        // the pressed leaf resolves to its outline, which is the shape of a stem
        const vec = heroSheetRef.current.querySelector<HTMLElement>('.rc-leaf-vec')
        if (vec) vec.style.opacity = smoothstep(seg(p, 0.325, 0.37)).toFixed(3)
        const plate = heroSheetRef.current.querySelector<HTMLElement>('.rc-leaf-plate')
        if (plate) plate.style.opacity = (1 - smoothstep(seg(p, 0.325, 0.37)) * 0.78).toFixed(3)
      }

      /* ---- act two: the count ---- */
      if (countWrapRef.current && countRef.current) {
        const vis = smoothstep(seg(p, 0.52, 0.57)) * (1 - smoothstep(seg(p, 0.78, 0.84)))
        countWrapRef.current.style.opacity = vis.toFixed(3)
        countWrapRef.current.style.visibility = vis < 0.005 ? 'hidden' : 'visible'
        const s = 1 - smoothstep(seg(p, 0.53, 0.65)) * 0.46
        countWrapRef.current.style.transform = `translate(-50%,-50%) scale(${s.toFixed(3)})`
        countWrapRef.current.style.color = p > 0.64 ? '#ffb069' : '#eaf6ea'
        setText(countRef.current, nf.format(Math.round(population(p))))
      }

      const en = runner.get<EnumScene>('enum')
      if (readoutRef.current) {
        const vis = smoothstep(seg(p, 0.5, 0.56)) * (1 - smoothstep(seg(p, 0.88, 0.93)))
        readoutRef.current.style.opacity = vis.toFixed(3)
        if (vis > 0.01 && en) {
          const st = en.readState()
          setText(heroRef.current, st.dist < 1000 ? `${Math.round(st.dist)} m` : `${(st.dist / 1000).toFixed(2)} km`)
          setText(v1.current, st.gsd < 1 ? `${(st.gsd * 100).toFixed(0)} cm` : `${st.gsd.toFixed(1)} m`)
          setText(v2.current, `${nf.format(Math.round(population(p)))} of ${nf.format(TOTAL)}`)
        }
      }
    },
  })

  useEffect(() => {
    if (!enumRef.current) return
    const map = new Map<string, HTMLCanvasElement>([['enum', enumRef.current]])
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
    <div ref={rootRef} className="mg-root ty-root">
      <div className="stage rc-stage">
        <canvas ref={enumRef} className="mg-stack-canvas" />

        {/* act one is paper, above the canvas */}
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
            <img className="rc-leaf rc-leaf-plate" src={art.leaves[2]} alt="" />
            <img className="rc-leaf rc-leaf-vec" src={art.vectors[2]} alt="" />
            <div className="rc-fields">
              <div className="rc-taxon editorial">{SPECIMENS[4].taxon}</div>
              <div className="rc-meta mono">
                <span>{SPECIMENS[4].id}</span>
                <span>{SPECIMENS[4].last}</span>
              </div>
            </div>
            <div className="rc-stamp rc-stamp-red">{SPECIMENS[4].status}</div>
          </div>
        </div>

        <div className="vignette" />

        {/* the count, act two */}
        <div ref={countWrapRef} className="ty-count-wrap">
          <div ref={countRef} className="mono ty-count">
            1
          </div>
          <div className="micro ty-count-label">stems identified, this cell</div>
        </div>

        {/* ---------- act one ---------- */}

        <Beat a={-0.04} b={0.03} className="mg-corner" hold={0.3}>
          <div className="micro ty-eyebrow-dark">
            SylvaSense · ORION-PS-03 · {SITE.id} · merge of Herbarium + Enumeration
          </div>
        </Beat>

        <Beat a={0.02} b={0.09} className="mg-centre" mode="scale">
          <h1 className="ty-h1 editorial rc-dark">
            One sheet.
            <br />
            One species.
            <br />
            <em>One afternoon in 1857.</em>
          </h1>
        </Beat>

        <Beat a={0.115} b={0.2} className="ty-left rc-left-dark">
          <div className="micro ty-num">The first census</div>
          <h2 className="ty-h2 editorial rc-dark">
            <span className="mono">41,904</span> sheets.
          </h2>
          <p className="mg-body rc-body-dark">
            Collected, pressed, mounted, annotated and filed by people who walked there. As a record of
            what grows in this basin it has never been bettered.
          </p>
        </Beat>

        <Beat a={0.22} b={0.285} className="ty-left rc-left-dark">
          <h2 className="ty-h2 editorial rc-dark">Every one of them is past tense.</h2>
          <p className="mg-body rc-body-dark">
            The date on the label is the last time anybody actually looked. The median sheet in this
            collection was last verified thirty-eight years ago.
          </p>
        </Beat>

        <Beat a={0.3} b={0.35} className="ty-bottom">
          <div className="micro ty-num">
            {SPECIMENS[4].id} · {SPECIMENS[4].taxon} · last verified {SPECIMENS[4].last}
          </div>
          <h2 className="ty-h2 editorial rc-dark">
            Twelve years since <em>anybody looked</em>.
          </h2>
        </Beat>

        {/* ---------- the pivot ---------- */}

        <Beat a={0.43} b={0.5} className="mg-pivot" mode="scale" hold={0.2}>
          <div className="mg-pivot-rule" />
          <h2 className="mg-h1">
            Taxonomy asked what this is.
            <br />
            <span className="ty-hi">Nobody asked whether it is still there.</span>
          </h2>
        </Beat>

        {/* ---------- act two ---------- */}

        <Beat a={0.515} b={0.565} className="mg-bottom-left">
          <div className="micro mg-tag">The second census</div>
          <h2 className="mg-h2">Same question, once per stem.</h2>
        </Beat>

        <Beat a={0.58} b={0.65} className="mg-left">
          <div className="micro mg-tag">1.18 Mha · 10 m ground sample</div>
          <h2 className="mg-h2">
            Not one sheet per species.
            <br />
            One record per tree.
          </h2>
          <p className="mg-body">
            Crown segmentation gives every stem above about four metres an identifier, a position, a
            height and a confidence. No pressing, no walking, no permission.
          </p>
        </Beat>

        <Beat a={0.665} b={0.74} className="mg-left">
          <div className="micro mg-tag mg-warn">Subtraction · 2019 to 2026</div>
          <h2 className="mg-h2 mg-warn">
            <span className="mono">904,118</span> of them are no longer there.
          </h2>
          <p className="mg-body">
            A herbarium cannot tell you this, because a herbarium records presence once. The interesting
            measurement was always absence, and absence needs a revisit.
          </p>
        </Beat>

        <Beat a={0.76} b={0.83} className="mg-left">
          <div className="micro mg-tag">Index</div>
          <h2 className="mg-h2">Both collections are archives.</h2>
          <p className="mg-body">
            One is closed and beautiful; the other reopens every five days. The sheets are not obsolete
            — they are the taxonomic ground truth the classifier is trained against.
          </p>
        </Beat>

        {/* ---------- sylvasense ---------- */}

        <Beat a={0.86} b={0.93} className="mg-top" mode="scale">
          <h2 className="mg-h1">
            A herbarium
            <br />
            <span className="ty-hi">that refiles itself every five days.</span>
          </h2>
        </Beat>

        <Beat a={0.9} b={1} className="mg-metrics" style={{ ['--cols' as string]: 5 }}>
          <M k="Sheets" v="41,904" s="1857 to 1994" />
          <M k="Median sheet age" v="38 years" s="since last check" alarm />
          <M k="Stems identified" v={nf.format(TOTAL)} s="this cell" good />
          <M k="No longer present" v={nf.format(LOST)} s="2019 to 2026" alarm />
          <M k="Re-verification" v={`${METRICS.revisitDays} days`} s="per stem" good />
        </Beat>

        {/* the instrument */}
        <div ref={readoutRef} className="mg-readout">
          <div ref={heroRef} className="mg-readout-hero">
            1.4 m
          </div>
          <div className="mg-row">
            <span className="micro">Ground sample</span>
            <span ref={v1} className="mg-row-v">
              2 cm
            </span>
          </div>
          <div className="mg-row">
            <span className="micro">Records held</span>
            <span ref={v2} className="mg-row-v">
              1 of 2,417,338
            </span>
          </div>
        </div>
      </div>

      <div className="micro mg-lineage">Merge · Herbarium 04 + Enumeration 05</div>
      <ConceptChrome index="Merge 18" title="Type Specimen" chapters={CHAPTERS} accent="#e8d9b0" />
      <ScrollTrack pages={19} />
    </div>
  )
}

function M({ k, v, s, alarm, good }: { k: string; v: string; s: string; alarm?: boolean; good?: boolean }) {
  return (
    <div className="mg-m">
      <div className="micro mg-m-k">{k}</div>
      <div className="mg-m-v" style={alarm ? { color: '#ffb069' } : good ? { color: '#7af0b4' } : undefined}>
        {v}
      </div>
      <div className="micro ty-m-s">{s}</div>
    </div>
  )
}
