import { clamp01, easeInOutCubic, easeOutCubic, lerp, mulberry32, seg, smoothstep } from '../lib/math'
import { CANOPY_SERIES, RING_SERIES, SENSORS } from '../lib/data'
import { perfTier } from '../lib/narrative'

/**
 * Concept 02 renders entirely to a single 2D canvas.
 * The scroll position is time: the pith is 1802, the bark is 2026, and the
 * camera pulls back as the tree adds rings so the newest ring is always framed.
 */

export interface RingsRenderer {
  draw: (p: number, t: number) => void
  resize: () => void
  dispose: () => void
}

const CUT_A = 0.2
const CUT_B = 0.27
const RING_A = 0.26
const RING_B = 0.56
const FIRST_YEAR = RING_SERIES[0].year
const LAST_YEAR = RING_SERIES[RING_SERIES.length - 1].year

/** Cumulative radii so ring i sits at cum[i]. */
const CUM: number[] = (() => {
  const out: number[] = []
  let s = 0
  for (const r of RING_SERIES) {
    s += r.width
    out.push(s)
  }
  return out
})()

const coverAt = (year: number) => {
  const rec = CANOPY_SERIES.find((c) => c.year === year)
  return rec ? rec.cover / 100 : null
}

export function createRingsRenderer(canvas: HTMLCanvasElement): RingsRenderer {
  const tier = perfTier()
  const ctx = canvas.getContext('2d', { alpha: false })!
  let W = 0
  let H = 0
  let dpr = 1

  /* ---- offscreen layers, rebuilt on resize ---- */
  let canopy: HTMLCanvasElement[] = []
  let bark: HTMLCanvasElement | null = null
  let grain: HTMLCanvasElement | null = null

  function buildCanopy() {
    const layers: HTMLCanvasElement[] = []
    const blurs = [9, 4, 1.5]
    const tints = [
      ['#123a1c', '#1d5b2a'],
      ['#0d2e16', '#26702f'],
      ['#061a0c', '#153f1c'],
    ]
    const counts = tier === 'low' ? [26, 30, 22] : [46, 52, 34]
    for (let k = 0; k < 3; k++) {
      const c = document.createElement('canvas')
      c.width = Math.round(W)
      c.height = Math.round(H)
      const g = c.getContext('2d')!
      const rnd = mulberry32(300 + k * 17)
      g.filter = `blur(${blurs[k]}px)`
      for (let i = 0; i < counts[k]; i++) {
        // leaf clusters: lobed blobs, biggest near the frame edges
        const edge = rnd()
        const cx = (edge < 0.5 ? rnd() * 0.42 : 0.58 + rnd() * 0.42) * W
        const cy = rnd() * H
        const R = (0.06 + rnd() * 0.2) * Math.min(W, H) * (1 + k * 0.45)
        g.fillStyle = rnd() < 0.5 ? tints[k][0] : tints[k][1]
        g.globalAlpha = 0.72 + rnd() * 0.28
        g.beginPath()
        const lobes = 5 + ((rnd() * 4) | 0)
        for (let a = 0; a <= lobes; a++) {
          const ang = (a / lobes) * Math.PI * 2
          const rr = R * (0.55 + rnd() * 0.7)
          const x = cx + Math.cos(ang) * rr
          const y = cy + Math.sin(ang) * rr * 0.8
          if (a === 0) g.moveTo(x, y)
          else g.quadraticCurveTo(cx + Math.cos(ang - 0.3) * rr * 1.4, cy + Math.sin(ang - 0.3) * rr * 1.2, x, y)
        }
        g.closePath()
        g.fill()
      }
      g.globalAlpha = 1
      layers.push(c)
    }
    return layers
  }

  function buildBark() {
    const c = document.createElement('canvas')
    c.width = Math.round(W)
    c.height = Math.round(H * 1.5)
    const g = c.getContext('2d')!
    const rnd = mulberry32(88)
    g.fillStyle = '#231a12'
    g.fillRect(0, 0, c.width, c.height)
    for (let i = 0; i < (tier === 'low' ? 380 : 900); i++) {
      const x = rnd() * c.width
      const y = rnd() * c.height
      const len = 60 + rnd() * 420
      const v = 18 + rnd() * 58
      g.strokeStyle = `rgba(${v + 34},${v + 20},${v + 9},${0.1 + rnd() * 0.32})`
      g.lineWidth = 0.6 + rnd() * 4
      g.beginPath()
      g.moveTo(x, y)
      g.bezierCurveTo(x + (rnd() - 0.5) * 14, y + len * 0.4, x + (rnd() - 0.5) * 18, y + len * 0.7, x + (rnd() - 0.5) * 11, y + len)
      g.stroke()
    }
    return c
  }

  function buildGrain() {
    const s = 360
    const c = document.createElement('canvas')
    c.width = c.height = s
    const g = c.getContext('2d')!
    const img = g.createImageData(s, s)
    const rnd = mulberry32(17)
    for (let i = 0; i < s * s; i++) {
      const v = 120 + rnd() * 135
      img.data[i * 4] = v
      img.data[i * 4 + 1] = v
      img.data[i * 4 + 2] = v
      img.data[i * 4 + 3] = 46
    }
    g.putImageData(img, 0, 0)
    return c
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, tier === 'low' ? 1.2 : 1.5)
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    canopy = buildCanopy()
    bark = buildBark()
    grain = buildGrain()
  }
  resize()

  /* ------------------------------------------------------------------ */

  const dust = Array.from({ length: tier === 'low' ? 60 : 140 }, () => {
    const r = mulberry32((Math.random() * 1e9) | 0)
    return { x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 1, s: 0.4 + r() * 2.4, ph: Math.random() * 9 }
  })

  function backdrop(p: number) {
    const dataT = smoothstep(seg(p, 0.6, 0.78))
    const g = ctx.createLinearGradient(0, 0, 0, H)
    // canopy green -> wood dark -> instrument black
    const top = mixHex('#123d1e', '#1a1209', smoothstep(seg(p, 0.08, 0.3)))
    const bot = mixHex('#04140a', '#0b0906', smoothstep(seg(p, 0.08, 0.3)))
    g.addColorStop(0, mixHex(top, '#05090c', dataT))
    g.addColorStop(1, mixHex(bot, '#03060a', dataT))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  function drawCanopy(p: number) {
    const d = easeInOutCubic(seg(p, 0.005, 0.17))
    for (let k = 0; k < canopy.length; k++) {
      const layer = canopy[k]
      const sc = 1 + d * (0.9 + k * 1.5)
      const alpha = 1 - smoothstep(seg(p, 0.05 + k * 0.02, 0.15 + k * 0.03))
      if (alpha <= 0.002) continue
      ctx.globalAlpha = alpha
      const w = W * sc
      const h = H * sc
      ctx.drawImage(layer, (W - w) / 2, (H - h) / 2, w, h)
    }
    ctx.globalAlpha = 1

    // sun through the crown
    const sunA = (1 - smoothstep(seg(p, 0.04, 0.14))) * 0.95
    if (sunA > 0.004) {
      const r = Math.min(W, H) * (0.17 + d * 0.5)
      const cx = W * 0.56
      const cy = H * 0.3
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      g.addColorStop(0, `rgba(255,246,208,${0.95 * sunA})`)
      g.addColorStop(0.28, `rgba(190,240,160,${0.34 * sunA})`)
      g.addColorStop(1, 'rgba(120,200,120,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }
  }

  function drawBark(p: number) {
    if (!bark) return
    const a = smoothstep(seg(p, 0.1, 0.16)) * (1 - smoothstep(seg(p, CUT_A, CUT_B)))
    if (a <= 0.003) return
    ctx.save()
    ctx.globalAlpha = a
    // descending fast: the bark streams upward
    const off = (easeInOutCubic(seg(p, 0.1, CUT_B)) * H * 2.2) % (H * 0.5)
    const slideUp = easeInOutCubic(seg(p, CUT_A, CUT_B)) * -H * 0.85
    ctx.translate(0, slideUp)
    ctx.drawImage(bark, 0, -off, W, H * 1.5)
    ctx.drawImage(bark, 0, -off + H * 1.5, W, H * 1.5)
    // cylinder shading
    const g = ctx.createLinearGradient(0, 0, W, 0)
    g.addColorStop(0, 'rgba(0,0,0,0.85)')
    g.addColorStop(0.42, 'rgba(0,0,0,0)')
    g.addColorStop(0.62, 'rgba(0,0,0,0.05)')
    g.addColorStop(1, 'rgba(0,0,0,0.9)')
    ctx.fillStyle = g
    ctx.fillRect(0, -H, W, H * 3)
    ctx.restore()
    ctx.globalAlpha = 1

    // the blade: a full-width kerf with a hot leading edge
    const cutT = seg(p, CUT_A, CUT_A + 0.05)
    if (cutT > 0.001 && cutT < 0.999) {
      const x = easeOutCubic(cutT) * W
      const y = H * 0.5
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const kerf = ctx.createLinearGradient(0, 0, x, 0)
      kerf.addColorStop(0, 'rgba(255,226,160,0.10)')
      kerf.addColorStop(0.8, 'rgba(255,236,186,0.34)')
      kerf.addColorStop(1, 'rgba(255,250,228,0.95)')
      ctx.fillStyle = kerf
      ctx.fillRect(0, y - 2, x, 4)
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 130)
      glow.addColorStop(0, 'rgba(255,214,138,0.55)')
      glow.addColorStop(1, 'rgba(255,170,70,0)')
      ctx.fillStyle = glow
      ctx.fillRect(x - 130, y - 130, 260, 260)
      ctx.restore()
    }
  }

  /* ---- the cross-section / dial ---- */

  function drawSection(p: number, t: number) {
    const appear = smoothstep(seg(p, CUT_A + 0.02, CUT_B + 0.03))
    if (appear <= 0.003) return

    const dial = smoothstep(seg(p, 0.64, 0.8)) // log -> instrument
    const bone = smoothstep(seg(p, 0.56, 0.66)) // colour drains
    const cx = W * 0.5
    const cy = H * lerp(0.56, 0.5, dial)
    const tilt = lerp(0.6, 1.0, dial)
    const spin = (t * 0.008 + seg(p, RING_A, RING_B) * 0.28) * (1 - smoothstep(seg(p, 0.6, 0.78)))

    // how many rings exist yet
    const grow = easeOutCubic(seg(p, RING_A, RING_B))
    const N = RING_SERIES.length
    const shown = Math.max(4, grow * N)
    const idx = Math.min(N - 1, Math.floor(shown))

    // the disc physically grows as the tree adds years
    const frac = idx / (N - 1)
    const Rfull = Math.min(W, H) * lerp(0.4, 0.35, dial) * appear
    const R = Rfull * lerp(0.17 + 0.83 * Math.pow(frac, 0.5), 1, dial)

    // radial mapping: half true cumulative width, half even spacing, so the
    // late rings stay readable instead of collapsing into a solid band
    const radiusOf = (i: number) => {
      if (idx === 0) return R
      const cumR = CUM[i] / CUM[idx]
      return R * (0.5 * Math.pow(cumR, 1.7) + 0.5 * (i / idx))
    }
    const meanW = 1.35

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(spin)
    ctx.scale(1, tilt)

    // log thickness underneath, only while it is still a physical object
    if (dial < 0.98) {
      const thick = R * 0.34 * (1 - dial)
      ctx.save()
      ctx.translate(0, thick / tilt)
      ctx.fillStyle = mixHex('#1d140c', '#2a2724', bone)
      ctx.beginPath()
      ctx.arc(0, 0, R * 1.005, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // sapwood field
    ctx.beginPath()
    ctx.arc(0, 0, R * 1.005, 0, Math.PI * 2)
    ctx.fillStyle = mixHex('#9a7147', '#d8d2c6', bone)
    ctx.fill()

    // rings, pith outward
    for (let i = 0; i <= idx; i++) {
      const rec = RING_SERIES[i]
      const r = radiusOf(i)
      if (r < 0.4) continue
      const cover = coverAt(rec.year)
      const wRel = clamp01(rec.width / meanW)
      const spacing = R / Math.max(20, idx)

      // dark latewood band on light earlywood; a poor year lays down a
      // thicker, darker boundary, which is what makes rings readable at all
      let col = rec.scar === 2 ? '#150b04' : rec.scar === 1 ? '#3a2410' : '#54371c'
      col = mixHex(col, rec.scar ? '#3d3833' : '#6d6559', bone)

      // in the data phase the years with an orbital record recolour to cover
      const dataMix = dial * (cover !== null ? 1 : 0.18)
      if (dataMix > 0 && cover !== null) {
        const c = clamp01((cover - 0.55) / 0.45)
        const dataCol = c < 0.5 ? mixHex('#ff3b2f', '#f2b134', c / 0.5) : mixHex('#f2b134', '#39d98a', (c - 0.5) / 0.5)
        col = mixHex(col, dataCol, dataMix)
      }

      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.strokeStyle = col
      ctx.lineWidth = Math.max(0.65, spacing * (0.2 + (1 - wRel) * 0.55) * (rec.scar ? 1.5 : 1) * (cover !== null ? 1 + dial * 0.9 : 1))
      ctx.stroke()
    }

    // fire scars: charred wedges spanning several years
    for (let i = 0; i <= idx; i++) {
      if (RING_SERIES[i].scar !== 2) continue
      const r0 = radiusOf(i)
      const r1 = radiusOf(Math.min(idx, i + 4))
      const a0 = (i * 2.399) % (Math.PI * 2)
      const spread = 0.12 + ((i % 5) / 5) * 0.16
      ctx.beginPath()
      ctx.arc(0, 0, r0, a0 - spread, a0 + spread)
      ctx.arc(0, 0, r1, a0 + spread, a0 - spread, true)
      ctx.closePath()
      ctx.fillStyle = `rgba(12,7,4,${0.85 * (1 - bone * 0.5)})`
      ctx.fill()
    }

    // radial checks
    const rnd = mulberry32(4)
    ctx.strokeStyle = `rgba(10,6,3,${0.5 * (1 - dial)})`
    for (let k = 0; k < 5; k++) {
      const a = rnd() * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      let rr = 0
      while (rr < R) {
        rr += R * 0.09
        ctx.lineTo(Math.cos(a + (rnd() - 0.5) * 0.12) * rr, Math.sin(a + (rnd() - 0.5) * 0.12) * rr)
      }
      ctx.lineWidth = 1 + rnd() * 2
      ctx.stroke()
    }

    // pith
    ctx.beginPath()
    ctx.arc(0, 0, Math.max(1.5, R * 0.006), 0, Math.PI * 2)
    ctx.fillStyle = mixHex('#1a0f07', '#efe9dd', bone)
    ctx.fill()

    // bark edge while it is still wood
    if (dial < 0.9 && grow > 0.985) {
      ctx.beginPath()
      ctx.arc(0, 0, R * 1.02, 0, Math.PI * 2)
      ctx.strokeStyle = mixHex('#120c07', '#454039', bone)
      ctx.lineWidth = R * 0.035
      ctx.stroke()
    }

    ctx.restore()

    // wood grain overlay, clipped to the disc
    if (grain && dial < 0.95) {
      ctx.save()
      ctx.globalAlpha = 0.5 * (1 - dial)
      ctx.globalCompositeOperation = 'overlay'
      ctx.beginPath()
      ctx.ellipse(cx, cy, R, R * tilt, 0, 0, Math.PI * 2)
      ctx.clip()
      for (let x = 0; x < W; x += 360) for (let y = 0; y < H; y += 360) ctx.drawImage(grain, x, y)
      ctx.restore()
      ctx.globalAlpha = 1
    }

    if (dial > 0.02) drawInstrument(p, t, cx, cy, R, dial)
  }

  /** The dial that the cross-section becomes: sensors as concentric bands. */
  function drawInstrument(p: number, t: number, cx: number, cy: number, R: number, dial: number) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.globalAlpha = dial

    // year ticks around the circumference
    const yearsShown = smoothstep(seg(p, 0.68, 0.82))
    ctx.font = '500 9px "JetBrains Mono", monospace'
    ctx.textAlign = 'center'
    const NN = CUM.length - 1
    for (let y = 1810; y <= LAST_YEAR; y += 20) {
      const i = y - FIRST_YEAR
      if (i < 0 || i >= CUM.length) continue
      const r = R * (0.5 * Math.pow(CUM[i] / CUM[NN], 1.7) + 0.5 * (i / NN))
      const a = -Math.PI / 2 + 0.0
      ctx.globalAlpha = dial * yearsShown * 0.85
      ctx.strokeStyle = 'rgba(190,220,210,0.4)'
      ctx.beginPath()
      ctx.moveTo(r, -4)
      ctx.lineTo(r, 4)
      ctx.stroke()
      ctx.fillStyle = 'rgba(200,228,218,0.62)'
      ctx.fillText(String(y), r, -10)
      void a
    }

    // sensor bands outside the disc
    const bands = smoothstep(seg(p, 0.79, 0.92))
    if (bands > 0.004) {
      const rnd = mulberry32(61)
      SENSORS.forEach((s, k) => {
        const rr = R * (1.1 + k * 0.085)
        const reveal = smoothstep(seg(p, 0.79 + k * 0.022, 0.9 + k * 0.022))
        if (reveal <= 0.004) return
        ctx.globalAlpha = dial * reveal * 0.95
        ctx.strokeStyle = s.color
        ctx.lineWidth = 1.1
        ctx.beginPath()
        ctx.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * reveal)
        ctx.stroke()

        // each sensor gets its own sampling signature
        ctx.globalAlpha = dial * reveal * 0.8
        const n = s.key === 'S1' ? 120 : s.key === 'S2' ? 150 : s.key === 'L9' ? 46 : 22
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i / n) * Math.PI * 2 * reveal
          const len = s.key === 'LID' ? 3 + rnd() * 9 : 2 + rnd() * 4
          const jitter = s.key === 'S1' ? (rnd() - 0.5) * 3.5 : 0
          ctx.strokeStyle = s.color
          ctx.lineWidth = s.key === 'LID' ? 1.6 : 0.9
          ctx.beginPath()
          ctx.moveTo(Math.cos(a) * (rr + jitter), Math.sin(a) * (rr + jitter))
          ctx.lineTo(Math.cos(a) * (rr + len + jitter), Math.sin(a) * (rr + len + jitter))
          ctx.stroke()
        }
      })
    }

    // degradation alerts on the outermost ring
    const alerts = smoothstep(seg(p, 0.9, 0.99))
    if (alerts > 0.004) {
      const rnd = mulberry32(7)
      const pulse = 0.55 + 0.45 * Math.sin(t * 4)
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2
        if (rnd() > alerts) continue
        const rr = R * (1.45 + rnd() * 0.05)
        ctx.globalAlpha = dial * alerts * pulse
        ctx.strokeStyle = '#ff3b2f'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
        ctx.lineTo(Math.cos(a) * (rr + 12), Math.sin(a) * (rr + 12))
        ctx.stroke()
      }
    }

    // crosshair
    ctx.globalAlpha = dial * 0.3
    ctx.strokeStyle = 'rgba(180,230,214,0.9)'
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(-R * 1.6, 0)
    ctx.lineTo(R * 1.6, 0)
    ctx.moveTo(0, -R * 1.6)
    ctx.lineTo(0, R * 1.6)
    ctx.stroke()

    ctx.restore()
    ctx.globalAlpha = 1
  }

  function drawDust(p: number, t: number) {
    const sawdust = Math.sin(seg(p, CUT_A - 0.02, 0.42) * Math.PI)
    const ambient = 0.25 + sawdust * 0.75
    ctx.save()
    for (const d of dust) {
      const y = (d.y + t * 0.016 * d.z + p * 0.9 * d.z) % 1
      const x = d.x + Math.sin(t * 0.3 * d.z + d.ph) * 0.012
      const s = d.s * (0.6 + d.z)
      ctx.globalAlpha = 0.06 + ambient * d.z * 0.22
      ctx.fillStyle = p > 0.62 ? 'rgba(180,220,210,0.9)' : 'rgba(228,206,160,0.9)'
      ctx.beginPath()
      ctx.arc(x * W, (1 - y) * H, s, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    ctx.globalAlpha = 1
  }

  function draw(p: number, t: number) {
    backdrop(p)
    if (p < 0.24) drawCanopy(p)
    drawBark(p)
    drawSection(p, t)
    drawDust(p, t)

    // vignette
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.6)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  return {
    draw,
    resize,
    dispose: () => {
      canopy = []
      bark = null
      grain = null
    },
  }
}

/* ---- tiny hex colour mixer ---- */
const hexCache = new Map<string, [number, number, number]>()
function hex2rgb(h: string): [number, number, number] {
  let v = hexCache.get(h)
  if (!v) {
    const n = parseInt(h.slice(1), 16)
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    hexCache.set(h, v)
  }
  return v
}
export function mixHex(a: string, b: string, t: number) {
  const A = hex2rgb(a)
  const B = hex2rgb(b)
  const k = clamp01(t)
  return `rgb(${Math.round(lerp(A[0], B[0], k))},${Math.round(lerp(A[1], B[1], k))},${Math.round(lerp(A[2], B[2], k))})`
}

/** Year label for the current scroll position. */
export function yearAt(p: number) {
  const grow = easeOutCubic(seg(p, RING_A, RING_B))
  const i = Math.min(RING_SERIES.length - 1, Math.floor(Math.max(4, grow * RING_SERIES.length)))
  return RING_SERIES[i].year
}
