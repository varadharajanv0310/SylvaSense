'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createEmberScene } from '../01-ember/scene'
import { createRootsScene, RootsScene } from '../06-roots/scene'
import { Act, ActRunner } from '../lib/merge'
import { setText, useNarrative } from '../lib/narrative'
import { Beat, ConceptChrome, Counter, ScrollTrack } from '../lib/ui'
import { clamp01, lerp, seg, smoothstep } from '../lib/math'
import { AudioMixer, createVideo, loadImage, MEDIA } from '../lib/media'
import { SITE } from '../lib/data'
import './merge.css'

/**
 * MERGE — Ember (01) + Roots (06)
 *
 * The fire takes the half of the forest you can photograph. The second act
 * goes underneath and finds that the other half — root mass and nine thousand
 * years of soil carbon — left with it, silently, over the following four
 * years. Both acts meet at the forest floor, which is why the cut is invisible.
 *
 * This is also the media-carrying merge: real footage is projected into the
 * WebGL scene, composited over it, and masked inside the typography, the
 * orbital phase resolves to a real Landsat tile, and four ambience beds
 * crossfade behind a sound toggle.
 */

const CHAPTERS = [
  { at: 0, label: '01 / Canopy' },
  { at: 0.16, label: '02 / The cut' },
  { at: 0.28, label: '03 / Combustion' },
  { at: 0.44, label: '04 / The fire stopped at the surface' },
  { at: 0.56, label: '05 / The root plate' },
  { at: 0.7, label: '06 / Soil carbon' },
  { at: 0.82, label: '07 / The second loss' },
  { at: 0.9, label: '08 / SylvaSense' },
]

/** White letterforms on transparent — composited once, not per line. */
function buildTypeMask(w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(2, Math.round(w * dpr))
  c.height = Math.max(2, Math.round(h * dpr))
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  const lines = ['THEN IT', 'BURNS']
  const size = Math.min(w * 0.2, h * 0.31)
  g.font = `400 ${size}px Anton, Impact, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#fff'
  const lh = size * 0.9
  const y0 = h * 0.47 - ((lines.length - 1) * lh) / 2
  lines.forEach((ln, i) => g.fillText(ln, w / 2, y0 + i * lh))
  return c
}

export default function AshAndRoot() {
  const emberRef = useRef<HTMLCanvasElement>(null)
  const rootsRef = useRef<HTMLCanvasElement>(null)
  const runnerRef = useRef<ActRunner | null>(null)
  const fireWrapRef = useRef<HTMLDivElement>(null)
  const fireVidRef = useRef<HTMLVideoElement>(null)
  const typeRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement | null>(null)

  const readoutRef = useRef<HTMLDivElement>(null)
  const depthRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLSpanElement>(null)
  const heldRef = useRef<HTMLSpanElement>(null)

  const mediaRef = useRef<{ canopy: HTMLVideoElement; tile: HTMLImageElement } | null>(null)
  const mixRef = useRef<AudioMixer | null>(null)
  const [sound, setSound] = useState(false)

  const acts = useMemo<Act[]>(() => {
    const makeEmber = (c: HTMLCanvasElement) =>
      createEmberScene(c, { canopyVideo: mediaRef.current?.canopy, tileImage: mediaRef.current?.tile })
    return [
      { key: 'ember', create: makeEmber, a: 0, b: 0.48, from: 0, to: 0.72, fade: 0.05 },
      { key: 'roots', create: createRootsScene, a: 0.44, b: 1, from: 0.04, to: 1, fade: 0.05 },
    ]
  }, [])

  const { rootRef } = useNarrative({
    pages: 18,
    onFrame: (p, dt, t) => {
      const runner = runnerRef.current
      if (!runner) return
      runner.update(p, dt, t)

      // 1 — footage composited over the scene as a fire front
      if (fireWrapRef.current) {
        const v = Math.sin(clamp01(seg(p, 0.22, 0.5)) * Math.PI)
        fireWrapRef.current.style.opacity = (v * 0.8).toFixed(3)
        fireWrapRef.current.style.visibility = v < 0.01 ? 'hidden' : 'visible'
        fireWrapRef.current.style.transform = `scale(${lerp(1.16, 1.02, clamp01(seg(p, 0.22, 0.5))).toFixed(3)})`
      }

      // 2 — the same footage masked inside the letterforms
      const cv = typeRef.current
      const mask = maskRef.current
      if (cv && mask) {
        const k = clamp01(seg(p, 0.285, 0.44))
        const vis = smoothstep(seg(p, 0.285, 0.33)) * (1 - smoothstep(seg(p, 0.4, 0.445)))
        cv.style.opacity = vis.toFixed(3)
        cv.style.transform = `scale(${lerp(1.07, 1, k).toFixed(4)})`
        if (vis > 0.004) {
          cv.style.visibility = 'visible'
          const g = cv.getContext('2d')!
          g.setTransform(1, 0, 0, 1, 0, 0)
          g.clearRect(0, 0, cv.width, cv.height)
          const vid = fireVidRef.current
          if (vid && vid.readyState >= 2 && vid.videoWidth) {
            const s = Math.max(cv.width / vid.videoWidth, cv.height / vid.videoHeight)
            const dw = vid.videoWidth * s
            const dh = vid.videoHeight * s
            g.drawImage(vid, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh)
          } else {
            g.fillStyle = '#c84a12'
            g.fillRect(0, 0, cv.width, cv.height)
          }
          // lift the dark half of the frame so every glyph stays legible
          g.globalCompositeOperation = 'lighter'
          const grd = g.createLinearGradient(0, 0, 0, cv.height)
          grd.addColorStop(0, 'rgba(255,128,32,0.36)')
          grd.addColorStop(1, 'rgba(255,58,8,0.22)')
          g.fillStyle = grd
          g.fillRect(0, 0, cv.width, cv.height)
          // one knockout pass — two destination-in calls would intersect
          g.globalCompositeOperation = 'destination-in'
          g.drawImage(mask, 0, 0, cv.width, cv.height)
          g.globalCompositeOperation = 'source-over'
        } else {
          cv.style.visibility = 'hidden'
        }
      }

      // 3 — four ambience beds mixed by scroll position
      mixRef.current?.set({
        forest: (1 - smoothstep(seg(p, 0.12, 0.3))) * 0.85,
        fire: smoothstep(seg(p, 0.2, 0.32)) * (1 - smoothstep(seg(p, 0.46, 0.58))),
        wind: smoothstep(seg(p, 0.44, 0.58)) * (1 - smoothstep(seg(p, 0.74, 0.86))) * 0.7,
        data: smoothstep(seg(p, 0.78, 0.92)) * 0.8,
      })

      const rs = runner.get<RootsScene>('roots')
      if (readoutRef.current) {
        const vis = smoothstep(seg(p, 0.5, 0.57)) * (1 - smoothstep(seg(p, 0.92, 0.98)))
        readoutRef.current.style.opacity = vis.toFixed(3)
        if (vis > 0.01 && rs) {
          const d = rs.readDepth()
          setText(depthRef.current, `−${d.toFixed(1)} m`)
          setText(
            layerRef.current,
            d < 0.3 ? 'Litter' : d < 1.1 ? 'Humus' : d < 3.4 ? 'Root plate' : d < 6.6 ? 'Mycorrhizal zone' : 'Mineral soil',
          )
          const held = lerp(0, 96.2, Math.min(1, d / 9.4)) * (1 - smoothstep(seg(p, 0.84, 0.96)) * 0.62)
          setText(heldRef.current, `${held.toFixed(1)} t/ha`)
          if (heldRef.current) heldRef.current.style.color = p > 0.86 ? '#ff7a4d' : '#e0a765'
        }
      }
    },
  })

  useEffect(() => {
    if (!emberRef.current || !rootsRef.current) return
    mediaRef.current = {
      canopy: createVideo(MEDIA.canopy, { loop: true, autoplay: true }),
      tile: loadImage(MEDIA.tile),
    }
    const fire = fireVidRef.current
    if (fire) {
      fire.muted = true
      fire.loop = true
      fire.playsInline = true
      fire.play().catch(() => undefined)
    }

    const sizeType = () => {
      const cv = typeRef.current
      if (!cv) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      maskRef.current = buildTypeMask(w, h, dpr)
    }
    sizeType()
    // Anton arrives after first paint; rebuild the mask once it has
    document.fonts?.ready.then(sizeType).catch(() => undefined)

    const map = new Map<string, HTMLCanvasElement>([
      ['ember', emberRef.current],
      ['roots', rootsRef.current],
    ])
    const runner = new ActRunner(map, acts)
    runnerRef.current = runner
    const onResize = () => {
      runner.resize()
      sizeType()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      runner.dispose()
      mixRef.current?.dispose()
      mixRef.current = null
      mediaRef.current?.canopy.pause()
      mediaRef.current = null
      runnerRef.current = null
    }
  }, [acts])

  // audio cannot be constructed outside a gesture
  const toggleSound = async () => {
    if (!mixRef.current) {
      const mix = new AudioMixer()
      const ok = await mix.enable()
      if (!ok) return
      mixRef.current = mix
      setSound(true)
      return
    }
    const next = !sound
    mixRef.current.mute(!next)
    setSound(next)
  }

  return (
    <div ref={rootRef} className="mg-root ar-root">
      <div className="stage">
        <canvas ref={emberRef} className="mg-stack-canvas" />
        <canvas ref={rootsRef} className="mg-stack-canvas" />

        <div ref={fireWrapRef} className="mg-fire">
          <video ref={fireVidRef} className="mg-fire-vid" src={MEDIA.fire} preload="auto" playsInline muted loop />
        </div>

        <canvas ref={typeRef} className="mg-typemask" />
        <div className="vignette" />

        {/* ---------- act one: the half you can photograph ---------- */}

        <Beat a={-0.04} b={0.04} className="mg-corner" hold={0.3}>
          <div className="micro mg-eyebrow">
            SylvaSense · ORION-PS-03 · {SITE.id} · merge of Ember + Roots
          </div>
        </Beat>

        <Beat a={0.04} b={0.15} className="mg-centre" mode="scale">
          <div className="display ar-hero">
            EVERY LEAF IS A
            <br />
            MEASUREMENT
            <br />
            NOBODY TOOK
          </div>
        </Beat>

        <Beat a={0.17} b={0.27} className="mg-centre" mode="scale">
          <div className="display ar-hero ar-warm">
            THE CUT DOES NOT
            <br />
            ANNOUNCE ITSELF
          </div>
        </Beat>

        {/* the headline of this beat is the masked-type canvas above */}
        <Beat a={0.33} b={0.42} className="ar-under" mode="up">
          <p className="mg-lede">
            Above-ground biomass does not disappear. It changes address — from trunk to atmosphere, in
            about forty minutes.
          </p>
        </Beat>

        <Beat a={0.31} b={0.43} className="ar-right">
          <div className="micro mg-tag mg-warn">Released, above ground</div>
          <div className="display ar-huge ar-hot">
            <Counter from={0} to={41.9} a={0.31} b={0.42} decimals={1} />
          </div>
          <div className="micro ar-dim">Mt CO₂e · this cell</div>
        </Beat>

        {/* ---------- the pivot ---------- */}

        <Beat a={0.44} b={0.55} className="mg-pivot" mode="scale" hold={0.2}>
          <div className="mg-pivot-rule" />
          <h2 className="mg-h1">
            The fire stopped at the surface.
            <br />
            <span className="mg-bad">The loss did not.</span>
          </h2>
          <p className="mg-lede">
            Every figure you have just watched accumulate came from the part of this forest that was
            standing up. Underneath it, and never photographed, is roughly the same amount again.
          </p>
        </Beat>

        {/* ---------- act two: the half you cannot ---------- */}

        <Beat a={0.57} b={0.66} className="mg-left">
          <div className="micro mg-tag">Root plate · −1.1 to −3.4 m</div>
          <h2 className="mg-h2 ar-amber">Wider than the crown it fed.</h2>
          <p className="mg-body">
            A mature plate spreads past twenty metres and reaches eight down. The tree that burned was the
            smaller half of the organism, and the larger half is still here — for now.
          </p>
        </Beat>

        <Beat a={0.68} b={0.78} className="mg-left">
          <div className="micro mg-tag ar-cyan">Mycorrhizal zone · −3.4 to −6.6 m</div>
          <h2 className="mg-h2 ar-cyan">
            <span className="mono">96.2</span> tonnes per hectare,
            <br />
            and not one in a tree.
          </h2>
          <p className="mg-body">
            Soil organic carbon here outweighs everything that was growing on top of it. It took nine
            thousand years to put there, and it is held in place by roots that are already dying.
          </p>
        </Beat>

        <Beat a={0.81} b={0.9} className="mg-left">
          <div className="micro mg-tag mg-bad">The second loss</div>
          <h2 className="mg-h2 mg-bad">Nobody photographs this one.</h2>
          <p className="mg-body">
            Fine roots let go, the fungal network goes quiet, and the carbon oxidises and leaves over the
            following four years. No smoke, no alert, no headline — and more tonnes than the fire took.
          </p>
        </Beat>

        <Beat a={0.83} b={0.92} className="ar-right">
          <div className="micro mg-tag mg-bad">Released, below ground</div>
          <div className="display ar-huge mg-bad">
            <Counter from={0} to={59.6} a={0.84} b={0.92} decimals={1} />
          </div>
          <div className="micro ar-dim">t/ha · within four years</div>
        </Beat>

        {/* ---------- sylvasense ---------- */}

        <Beat a={0.91} b={1} className="mg-top" mode="scale">
          <h2 className="mg-h1">
            Measure the half you can see.
            <br />
            <span className="mg-accent">Infer the half you cannot.</span>
          </h2>
          <p className="mg-lede">
            Canopy height and crown area predict root mass; root mass predicts soil carbon. The fire is
            visible from orbit within six hours. The larger loss underneath it becomes an estimate with
            an error bar on the same pass.
          </p>
        </Beat>

        <Beat a={0.93} b={1} className="mg-metrics" style={{ ['--cols' as string]: 5 }}>
          <M k="Above-ground released" v="41.9 Mt CO₂e" alarm />
          <M k="Below-ground released" v="59.6 t/ha" alarm />
          <M k="Root : shoot ratio" v="0.24" />
          <M k="Soil carbon inferred" v="±22 %" />
          <M k="Detection latency" v="6 hours" good />
        </Beat>

        {/* depth readout, act two */}
        <div ref={readoutRef} className="mg-readout">
          <div ref={depthRef} className="mg-readout-hero">
            −0.0 m
          </div>
          <div className="mg-row">
            <span className="micro">Horizon</span>
            <span ref={layerRef} className="mg-row-v">
              Litter
            </span>
          </div>
          <div className="mg-row">
            <span className="micro">Carbon above this depth</span>
            <span ref={heldRef} className="mg-row-v">
              0.0 t/ha
            </span>
          </div>
          <div className="mg-row">
            <span className="micro">Observable from orbit</span>
            <span className="mg-row-v mg-bad">No</span>
          </div>
        </div>
      </div>

      <button type="button" className="micro mg-sound" onClick={toggleSound} aria-pressed={sound}>
        <span className={sound ? 'mg-sound-dot mg-sound-on' : 'mg-sound-dot'} aria-hidden />
        {sound ? 'Sound on' : 'Sound off'}
      </button>

      <div className="micro mg-lineage">Merge · Ember 01 + Roots 06 · media pass</div>
      <ConceptChrome index="Merge 12" title="Ash and Root" chapters={CHAPTERS} accent="#e0a765" />
      <ScrollTrack pages={18} />
    </div>
  )
}

function M({ k, v, alarm, good }: { k: string; v: string; alarm?: boolean; good?: boolean }) {
  return (
    <div className="mg-m">
      <div className="micro mg-m-k">{k}</div>
      <div className="mg-m-v" style={alarm ? { color: '#ff7a4d' } : good ? { color: '#7af0b4' } : undefined}>
        {v}
      </div>
    </div>
  )
}
