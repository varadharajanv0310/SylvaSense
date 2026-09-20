'use client'

import { useEffect, useRef } from 'react'
import { clamp01, lerp, mulberry32 } from './lib/math'

export type PreviewKind =
  | 'ember'
  | 'rings'
  | 'night'
  | 'herbarium'
  | 'enumeration'
  | 'stack'
  | 'vitals'
  | 'roots'
  | 'rain'
  | 'seed'
  | 'm-cube'
  | 'm-ashroot'
  | 'm-return'
  | 'm-record'
  | 'm-alarm'
  | 'm-both'
  | 'm-tinder'
  | 'm-type'
  | 'm-below'

/**
 * Tiny looping canvases for the concept selector.
 * Each one is a compressed quotation of its concept's motion system, not a
 * screenshot, so the grid reads as five different experiences at a glance.
 * They pause whenever they are off-screen.
 */
export function Preview({ kind }: { kind: PreviewKind }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    let raf = 0
    let alive = true
    let visible = true
    // offset each loop so previews are never all blank at mount
    let t = 1.5 + (kind.length % 7) * 1.3

    const io = new IntersectionObserver((e) => (visible = e[0].isIntersecting), { threshold: 0.05 })
    io.observe(cv)

    const fit = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6)
      cv.width = Math.max(2, Math.round(r.width * dpr))
      cv.height = Math.max(2, Math.round(r.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    window.addEventListener('resize', fit)

    const draw = DRAWERS[kind]
    const loop = () => {
      if (!alive) return
      raf = requestAnimationFrame(loop)
      if (!visible) return
      t += 1 / 60
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (w < 2 || h < 2) return
      draw(ctx, w, h, t)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [kind])

  return <canvas ref={ref} className="pv-canvas" />
}

type Drawer = (g: CanvasRenderingContext2D, w: number, h: number, t: number) => void

/** 0..1 loop with a slow hold at each end. */
const cycle = (t: number, period: number) => {
  const x = (t % period) / period
  return clamp01((x - 0.12) / 0.76)
}

const EMBER_SEEDS = Array.from({ length: 70 }, (_, i) => {
  const r = mulberry32(i * 31 + 7)
  return { x: r(), y: r(), s: 0.5 + r() * 2.4, ph: r() * 9, dr: r() }
})

const emberDraw: Drawer = (g, w, h, t) => {
  const k = cycle(t, 9)
  const sky = k < 0.5 ? mix('#0c2413', '#4a2109', k / 0.5) : mix('#4a2109', '#141210', (k - 0.5) / 0.5)
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  for (const p of EMBER_SEEDS) {
    const rise = k > 0.35 ? (k - 0.35) * 1.6 : 0
    const x = (p.x + Math.sin(t * 0.5 + p.ph) * 0.03) * w
    const y = (((p.y - rise * p.dr + 1) % 1) + (k > 0.7 ? Math.sin(t * 0.4 + p.ph) * 0.02 : 0)) * h
    const col =
      k < 0.32
        ? `rgba(${60 + p.dr * 60},${120 + p.dr * 80},${60 + p.dr * 40},0.85)`
        : k < 0.66
          ? `rgba(255,${100 + p.dr * 110},${20 + p.dr * 40},0.95)`
          : `rgba(${150 + p.dr * 70},${146 + p.dr * 66},${140 + p.dr * 60},0.7)`
    g.fillStyle = col
    g.beginPath()
    g.ellipse(x, y, p.s * (k < 0.32 ? 2.2 : 1.2), p.s * (k < 0.32 ? 1.1 : 1.2), p.ph, 0, 6.283)
    g.fill()
  }
  // horizon of trunks, felled as k rises
  g.fillStyle = 'rgba(8,10,8,0.92)'
  for (let i = 0; i < 16; i++) {
    const r = mulberry32(i * 13 + 2)
    const x = (i / 16 + r() * 0.03) * w
    const fell = clamp01((k - 0.3 - (i / 16) * 0.25) * 6)
    const hh = h * (0.34 + r() * 0.3) * (1 - fell * 0.94)
    g.fillRect(x, h - hh, Math.max(1.5, w * 0.012), hh)
  }
}

const ringsDraw: Drawer = (g, w, h, t) => {
  const k = cycle(t, 10)
  g.fillStyle = mix('#0a1a0d', '#05090c', clamp01((k - 0.55) / 0.35))
  g.fillRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2
  const Rmax = Math.min(w, h) * 0.42
  const N = 52
  const shown = Math.max(3, k * N)
  const R = Rmax * (0.2 + 0.8 * Math.pow(shown / N, 0.5))
  g.save()
  g.translate(cx, cy)
  g.scale(1, lerp(0.62, 1, clamp01((k - 0.6) / 0.3)))
  g.beginPath()
  g.arc(0, 0, R, 0, 6.283)
  g.fillStyle = mix('#8a6440', '#cec7b8', clamp01((k - 0.55) / 0.3))
  g.fill()
  for (let i = 0; i < shown; i++) {
    const r = R * ((i + 1) / shown)
    const rr = mulberry32(i * 7 + 3)
    const dry = rr() < 0.22
    g.beginPath()
    g.arc(0, 0, r, 0, 6.283)
    const data = clamp01((k - 0.62) / 0.3) * (i / shown > 0.78 ? 1 : 0)
    g.strokeStyle = mix(dry ? '#2c1a0c' : '#54371c', '#ff5a3c', data)
    g.lineWidth = Math.max(0.6, (R / shown) * (dry ? 0.8 : 0.4))
    g.stroke()
  }
  g.restore()
  // sensor arcs
  const band = clamp01((k - 0.7) / 0.28)
  const cols = ['#8fb3ff', '#7bd88f', '#ffd28f', '#ff9bd2']
  for (let i = 0; i < 4; i++) {
    g.beginPath()
    g.arc(cx, cy, R * (1.12 + i * 0.09), -1.57, -1.57 + 6.283 * band)
    g.strokeStyle = cols[i]
    g.globalAlpha = band * 0.85
    g.lineWidth = 1
    g.stroke()
  }
  g.globalAlpha = 1
}

const NIGHT_PTS = Array.from({ length: 300 }, (_, i) => {
  const r = mulberry32(i * 17 + 5)
  const cx = r()
  const cy = r()
  return { cx, cy, r: r(), a: r() * 6.283, rad: 0.01 + r() * 0.055, cleared: cx > 0.3 && cx < 0.5 && cy > 0.4 }
})

const nightDraw: Drawer = (g, w, h, t) => {
  const k = cycle(t, 9)
  g.fillStyle = mix('#0a1a12', '#02040a', clamp01(k / 0.35))
  g.fillRect(0, 0, w, h)
  const sweep = k > 0.42 ? (k - 0.42) / 0.45 : -1
  const light = 1 - clamp01(k / 0.32)
  for (const p of NIGHT_PTS) {
    const x = (p.cx + Math.cos(p.a) * p.rad) * w
    const y = (p.cy + Math.sin(p.a) * p.rad * 0.7) * h
    if (p.cleared && k > 0.34) continue
    const inSar = sweep > 0 && p.cx < sweep
    const a = inSar ? 0.9 : 0.1 + light * 0.75
    g.fillStyle = inSar
      ? `rgba(${140 + p.r * 90},${180 + p.r * 60},${230},${a})`
      : `rgba(${50 + p.r * 40},${110 + p.r * 80},${60 + p.r * 40},${a})`
    g.fillRect(x, y, 1.6, 1.6)
  }
  if (sweep > 0 && sweep < 1) {
    const x = sweep * w
    const gr = g.createLinearGradient(x - 26, 0, x + 6, 0)
    gr.addColorStop(0, 'rgba(120,180,255,0)')
    gr.addColorStop(1, 'rgba(180,220,255,0.85)')
    g.fillStyle = gr
    g.fillRect(x - 26, 0, 32, h)
  }
}

const herbDraw: Drawer = (g, w, h, t) => {
  const k = cycle(t, 11)
  const ink = clamp01((k - 0.62) / 0.3)
  g.fillStyle = mix('#efe9dc', '#0d100e', ink)
  g.fillRect(0, 0, w, h)
  const cardW = Math.min(w * 0.19, h * 0.34)
  const cardH = cardW * 1.42
  const rows = 3
  const cols = 5
  const spread = clamp01((k - 0.06) / 0.3)
  const run = clamp01((k - 0.34) / 0.3)
  for (let i = 0; i < rows * cols; i++) {
    const c = i % cols
    const r = (i / cols) | 0
    const gx = lerp(w / 2, w * (0.13 + (c / (cols - 1)) * 0.74), spread)
    const gy = lerp(h / 2, h * (0.2 + (r / (rows - 1)) * 0.6), spread)
    const z = ((i / (rows * cols) + run * 2.4) % 1)
    const sc = lerp(1, 0.35 + z * 2.2, run)
    const a = run > 0.02 ? clamp01(1.6 - z * 1.8) * (1 - ink) : (i === 7 ? 1 : spread) * (1 - ink)
    if (a <= 0.02) continue
    g.globalAlpha = a
    const cw = cardW * sc
    const ch = cardH * sc
    g.fillStyle = '#f7f3e8'
    g.fillRect(gx - cw / 2, gy - ch / 2, cw, ch)
    g.strokeStyle = 'rgba(92,72,40,0.3)'
    g.lineWidth = 0.6
    g.strokeRect(gx - cw / 2 + 2, gy - ch / 2 + 2, cw - 4, ch - 4)
    // leaf
    g.fillStyle = '#5c6738'
    g.beginPath()
    g.ellipse(gx, gy - ch * 0.12, cw * 0.15, ch * 0.28, 0, 0, 6.283)
    g.fill()
    g.strokeStyle = 'rgba(40,36,24,0.5)'
    g.lineWidth = Math.max(0.4, cw * 0.03)
    g.beginPath()
    g.moveTo(gx, gy - ch * 0.12 - ch * 0.26)
    g.lineTo(gx, gy - ch * 0.12 + ch * 0.26)
    g.stroke()
  }
  g.globalAlpha = 1
  if (ink > 0.1) {
    g.strokeStyle = `rgba(122,240,180,${ink * 0.5})`
    g.lineWidth = 1
    const s = Math.min(w, h) * 0.1
    for (let x = 0; x < w; x += s) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, h)
      g.stroke()
    }
    for (let y = 0; y < h; y += s) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(w, y)
      g.stroke()
    }
  }
}

const ENUM_PTS = Array.from({ length: 900 }, (_, i) => {
  const r = mulberry32(i * 11 + 9)
  const a = r() * 6.283
  const rad = Math.sqrt(r())
  return { x: Math.cos(a) * rad, y: Math.sin(a) * rad, o: r(), s: r() }
})

const enumDraw: Drawer = (g, w, h, t) => {
  const k = cycle(t, 10)
  g.fillStyle = mix('#060d08', '#04070d', clamp01((k - 0.55) / 0.3))
  g.fillRect(0, 0, w, h)
  const cx = w / 2
  const cy = h * 0.54
  const grow = Math.pow(clamp01(k / 0.42), 0.5)
  const Rr = Math.min(w, h) * 0.46 * grow
  const cut = clamp01((k - 0.46) / 0.22)
  const n = Math.max(1, Math.round(Math.pow(clamp01(k / 0.42), 3) * ENUM_PTS.length))
  for (let i = 0; i < n; i++) {
    const p = ENUM_PTS[i]
    if (p.o < cut * 0.42) continue
    const x = cx + p.x * Rr
    const y = cy + p.y * Rr * 0.52
    const sz = Math.max(1, (1 - grow * 0.72) * 5)
    g.fillStyle = `rgba(${40 + p.s * 40},${110 + p.s * 80},${52 + p.s * 40},0.95)`
    g.fillRect(x - sz / 2, y - sz / 2, sz, sz)
  }
  const shown = Math.round(Math.pow(clamp01(k / 0.42), 3) * 2417338 * (1 - cut * 0.37)) || 1
  g.fillStyle = cut > 0.05 ? '#ffb069' : '#eaf6ea'
  g.font = `200 ${Math.round(Math.min(w, h) * 0.17)}px "JetBrains Mono", monospace`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(shown.toLocaleString('en-US'), cx, h * 0.42)
}

/* ---- 07 stack: falling through a data cube ---- */

const stackDraw: Drawer = (g, w, h, t) => {
  const k = (t % 9) / 9
  g.fillStyle = '#05080c'
  g.fillRect(0, 0, w, h)
  const N = 22
  for (let i = 0; i < N; i++) {
    const z = ((i / N + k) % 1)
    const y = h * (0.08 + z * 0.92)
    const sc = 0.3 + z * 0.9
    const ww = w * 0.66 * sc
    const hh = Math.max(1.5, h * 0.05 * sc)
    const r = mulberry32(i * 31 + 5)
    const cloud = r() < 0.4
    const sar = !cloud && r() < 0.25
    const green = i / N > 0.52
    g.globalAlpha = 0.28 + z * 0.62
    g.fillStyle = cloud ? '#c7cdd4' : sar ? '#3e5f86' : green ? '#1c5a22' : '#4a3520'
    g.fillRect(w / 2 - ww / 2, y - hh / 2, ww, hh)
    g.strokeStyle = 'rgba(120,200,215,0.5)'
    g.lineWidth = 0.6
    g.strokeRect(w / 2 - ww / 2, y - hh / 2, ww, hh)
  }
  g.globalAlpha = 1
}

/* ---- 08 vitals: rhythms, one of them stopping ---- */

const vitalsDraw: Drawer = (g, w, h, t) => {
  const k = cycle(t, 10)
  g.fillStyle = mix('#061009', '#03090b', k)
  g.fillRect(0, 0, w, h)
  const lanes = 6
  for (let i = 0; i < lanes; i++) {
    const y0 = h * (0.12 + (i / lanes) * 0.78)
    const lh = h * 0.1
    const stress = 0.3 + i * 0.1
    const death = i < 3 ? 0.5 + i * 0.13 : 99
    const dead = k > death
    g.beginPath()
    for (let x = 0; x <= w; x += 2) {
      const tt = x / w
      if (tt > k) break
      const s = clamp01((tt - stress) / 0.2)
      const amp = lerp(0.2, 0.62, s) * (tt > death ? 0.05 : 1)
      const base = tt > death ? 0.82 : 0.42 + s * 0.2
      const v = base + amp * Math.sin(tt * 78 + i) * 0.4
      const y = y0 + v * lh
      if (x === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.strokeStyle = dead ? 'rgba(190,206,200,0.4)' : k > stress ? '#f2c14e' : '#7af0b4'
    g.lineWidth = 1.1
    g.stroke()
  }
}

/* ---- 06 roots: the camera descends, the soil scrolls up ---- */

type Seg = { x1: number; y1: number; x2: number; y2: number; w: number }

/** Root system in world units: 1000 wide, surface at y=120, tips near y=980. */
const ROOT_SEGS: Seg[] = (() => {
  const out: Seg[] = []
  const r = mulberry32(19)
  const grow = (x: number, y: number, ang: number, len: number, wd: number, d: number) => {
    if (d > 6 || len < 8 || out.length > 320) return
    const x2 = x + Math.cos(ang) * len
    const y2 = y + Math.sin(ang) * len
    out.push({ x1: x, y1: y, x2, y2, w: wd })
    const n = d < 2 ? 3 : 2
    for (let i = 0; i < n; i++) {
      grow(x2, y2, ang + (r() - 0.5) * 1.35, len * (0.58 + r() * 0.22), wd * 0.62, d + 1)
    }
  }
  for (let i = 0; i < 3; i++) grow(280 + i * 220, 120, Math.PI / 2 + (r() - 0.5) * 0.4, 196, 5.2, 0)
  return out
})()

const ROOT_GRAIN = Array.from({ length: 190 }, (_, i) => {
  const r = mulberry32(i * 41 + 3)
  return { x: r() * 1000, y: r() * 1420, s: 0.5 + r() * 1.6, d: r() }
})

const rootsDraw: Drawer = (g, w, h, t) => {
  const k = cycle(t, 11)
  const cam = -70 + k * 620 // world y at the top of the frame
  const sx = w / 1000
  const sy = h / 520
  const Y = (y: number) => (y - cam) * sy
  const deep = clamp01((k - 0.3) / 0.6)

  const grd = g.createLinearGradient(0, 0, 0, h)
  grd.addColorStop(0, mix('#3d2c18', '#150d07', deep))
  grd.addColorStop(1, mix('#1d1309', '#080503', deep))
  g.fillStyle = grd
  g.fillRect(0, 0, w, h)

  // soil grain drifting past the camera
  for (const p of ROOT_GRAIN) {
    const y = Y(p.y)
    if (y < -4 || y > h + 4) continue
    const rise = k > 0.68 ? (k - 0.68) * 90 * p.d : 0
    g.fillStyle =
      k > 0.68
        ? `rgba(255,${Math.round(150 + p.d * 60)},90,${(0.1 + p.d * 0.3).toFixed(3)})`
        : `rgba(210,${Math.round(160 + p.d * 40)},110,${(0.06 + p.d * 0.16).toFixed(3)})`
    g.fillRect(p.x * sx, y - rise, p.s, p.s)
  }

  // litter, and the sky shut out behind it
  const surf = Y(120)
  if (surf > -30 && surf < h + 10) {
    g.fillStyle = 'rgba(70,110,52,0.55)'
    g.fillRect(0, surf - 7, w, 7)
    g.fillStyle = 'rgba(12,18,11,0.88)'
    g.fillRect(0, 0, w, Math.max(0, surf - 7))
  }

  // the root plate
  for (const s of ROOT_SEGS) {
    const y1 = Y(s.y1)
    const y2 = Y(s.y2)
    if (Math.max(y1, y2) < -20 || Math.min(y1, y2) > h + 20) continue
    g.strokeStyle = `rgba(216,${Math.round(146 + s.w * 6)},78,${(0.42 + s.w * 0.09).toFixed(3)})`
    g.lineWidth = Math.max(0.75, s.w * sx * 1.9)
    g.beginPath()
    g.moveTo(s.x1 * sx, y1)
    g.lineTo(s.x2 * sx, y2)
    g.stroke()
  }

  // mycelium, with one pulse travelling along each filament
  const myc = clamp01((k - 0.42) / 0.2)
  if (myc > 0.01) {
    for (let i = 0; i < 7; i++) {
      const r = mulberry32(i * 57 + 9)
      const y0 = 520 + r() * 460
      g.strokeStyle = `rgba(110,232,220,${(0.1 + myc * 0.22).toFixed(3)})`
      g.lineWidth = 0.7
      g.beginPath()
      for (let x = 0; x <= 1000; x += 40) {
        const y = Y(y0 + Math.sin(x * 0.011 + i * 2.2) * 26)
        if (x === 0) g.moveTo(0, y)
        else g.lineTo(x * sx, y)
      }
      g.stroke()
      const px = ((t * 0.16 + i * 0.3) % 1) * 1000
      const py = Y(y0 + Math.sin(px * 0.011 + i * 2.2) * 26)
      g.fillStyle = `rgba(170,255,246,${(myc * 0.9).toFixed(3)})`
      g.beginPath()
      g.arc(px * sx, py, 1.6, 0, 6.283)
      g.fill()
    }
  }
}

/* ---- 09 rain: the loop the forest runs, then the loop opening ---- */

const RAIN_SEEDS = Array.from({ length: 130 }, (_, i) => {
  const r = mulberry32(i * 17 + 5)
  return { x: r(), s: r(), ph: r() * 9, sp: 0.6 + r() * 0.8 }
})

const rainDraw: Drawer = (g, w, h, t) => {
  const k = cycle(t, 10)
  const dry = clamp01((k - 0.7) / 0.28)
  const grd = g.createLinearGradient(0, 0, 0, h)
  grd.addColorStop(0, mix('#0e2b30', '#2b2416', dry))
  grd.addColorStop(1, mix('#0a1a12', '#231a0e', dry))
  g.fillStyle = grd
  g.fillRect(0, 0, w, h)

  // the cloud deck forms, then fails to form
  const cloud = clamp01((k - 0.22) / 0.2) * (1 - dry * 0.88)
  if (cloud > 0.01) {
    for (let i = 0; i < 5; i++) {
      const r = mulberry32(i * 29 + 4)
      const cx = (r() * 1.2 - 0.1) * w + Math.sin(t * 0.1 + i) * w * 0.02
      const cy = h * (0.18 + r() * 0.12)
      g.fillStyle = `rgba(196,214,220,${(cloud * (0.1 + r() * 0.12)).toFixed(3)})`
      g.beginPath()
      g.ellipse(cx, cy, w * (0.16 + r() * 0.16), h * (0.05 + r() * 0.04), 0, 0, 6.283)
      g.fill()
    }
  }

  const rainPhase = clamp01((k - 0.5) / 0.14)
  for (const p of RAIN_SEEDS) {
    if (p.s > 1 - dry * 0.8) continue
    const x = p.x * w
    if (rainPhase < 0.5) {
      // vapour leaving the canopy
      const y = h * (0.94 - ((t * 0.07 * p.sp + p.ph) % 1) * 0.72)
      g.fillStyle = `rgba(150,236,224,${(0.1 + p.s * 0.3).toFixed(3)})`
      g.beginPath()
      g.arc(x + Math.sin(t * 0.6 + p.ph) * w * 0.012, y, 0.8 + p.s * 1.2, 0, 6.283)
      g.fill()
    } else {
      const y = h * (0.24 + ((t * 0.5 * p.sp + p.ph) % 1) * 0.72)
      g.strokeStyle = `rgba(178,224,236,${(0.22 + p.s * 0.4).toFixed(3)})`
      g.lineWidth = 0.8
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + w * 0.004, y + h * (0.05 + p.s * 0.04))
      g.stroke()
    }
  }

  // the ground it falls on, drying from the right
  const gg = g.createLinearGradient(0, 0, w, 0)
  gg.addColorStop(0, mix('#173d20', '#2e2410', dry * 0.6))
  gg.addColorStop(1, mix('#1c4a26', '#9a7434', dry))
  g.fillStyle = gg
  g.fillRect(0, h * 0.88, w, h * 0.12)
}

/* ---- 10 seed: eighty years of succession in one loop ---- */

const SEED_STEMS = Array.from({ length: 70 }, (_, i) => {
  const r = mulberry32(i * 23 + 11)
  const pio = r() < 0.58
  return {
    x: r(),
    birth: (pio ? 0.02 : 0.1) + r() * 0.3,
    mx: pio ? 0.2 + r() * 0.18 : 0.34 + r() * 0.5,
    rate: pio ? 2.4 + r() * 1.4 : 0.7 + r() * 0.5,
    die: 0.46 + r() * 0.4,
    pio,
    sw: r(),
  }
})

const seedDraw: Drawer = (g, w, h, t) => {
  const k = cycle(t, 12)
  g.fillStyle = mix('#2a1d12', '#0d1a10', clamp01((k - 0.2) / 0.6))
  g.fillRect(0, 0, w, h)
  const gy = h * 0.9
  g.fillStyle = mix('#5c4326', '#23361f', clamp01((k - 0.14) / 0.4))
  g.fillRect(0, gy, w, h - gy)

  for (const s of SEED_STEMS) {
    const age = k - s.birth
    if (age <= 0) continue
    let f = 1 - Math.exp(-age * s.rate * 2.6)
    if (s.pio && k > s.die) f *= 1 - clamp01((k - s.die) / 0.22) * 0.94
    const hh = s.mx * f * h * 0.82
    if (hh < 1) continue
    const x = s.x * w
    const lean = Math.sin(s.sw * 9) * hh * 0.07
    g.strokeStyle = s.pio ? `rgba(128,166,84,${(0.5 + s.sw * 0.3).toFixed(3)})` : `rgba(58,74,48,${(0.6 + s.sw * 0.3).toFixed(3)})`
    g.lineWidth = Math.max(0.6, (s.pio ? 1.1 : 2.2) * (hh / (h * 0.5)))
    g.beginPath()
    g.moveTo(x, gy)
    g.lineTo(x + lean, gy - hh)
    g.stroke()
    g.fillStyle = s.pio ? `rgba(168,216,106,${(0.28 + s.sw * 0.28).toFixed(3)})` : `rgba(74,142,76,${(0.34 + s.sw * 0.3).toFixed(3)})`
    g.beginPath()
    g.ellipse(x + lean, gy - hh, hh * (s.pio ? 0.2 : 0.3), hh * (s.pio ? 0.13 : 0.2), 0, 0, 6.283)
    g.fill()
  }
}

/* ---- merge previews ---- */

/**
 * A merge preview shows its two sources meeting: the first drawer paints the
 * whole frame, the second is clipped to a wipe that travels across it.
 */
const pair = (A: Drawer, B: Drawer, period = 11): Drawer => (g, w, h, t) => {
  const k = cycle(t, period)
  A(g, w, h, t)
  const x = k * w
  g.save()
  g.beginPath()
  g.rect(x, 0, w - x, h)
  g.clip()
  B(g, w, h, t)
  g.restore()
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.fillRect(x - 0.5, 0, 1, h)
}

const DRAWERS: Record<PreviewKind, Drawer> = {
  ember: emberDraw,
  rings: ringsDraw,
  night: nightDraw,
  herbarium: herbDraw,
  enumeration: enumDraw,
  stack: stackDraw,
  vitals: vitalsDraw,
  roots: rootsDraw,
  rain: rainDraw,
  seed: seedDraw,
  'm-cube': pair(enumDraw, stackDraw),
  'm-ashroot': pair(emberDraw, rootsDraw, 12),
  'm-return': pair(rainDraw, seedDraw, 12),
  'm-record': pair(ringsDraw, nightDraw, 13),
  'm-alarm': pair(vitalsDraw, nightDraw, 12),
  'm-both': pair(ringsDraw, seedDraw, 13),
  'm-tinder': pair(rainDraw, emberDraw, 12),
  'm-type': pair(herbDraw, enumDraw, 13),
  'm-below': pair(stackDraw, rootsDraw, 12),
}

/* ---- helpers ---- */
function hex(h: string) {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a: string, b: string, t: number) {
  const A = hex(a)
  const B = hex(b)
  const k = clamp01(t)
  return `rgb(${Math.round(lerp(A[0], B[0], k))},${Math.round(lerp(A[1], B[1], k))},${Math.round(lerp(A[2], B[2], k))})`
}
