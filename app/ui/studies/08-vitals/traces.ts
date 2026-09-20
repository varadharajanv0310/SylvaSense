import { clamp01, lerp, seg, smoothstep } from '../lib/math'
import { CELLS, Cell, fmtYear, instability, ndvi, START_YEAR, statusOf, yearForScroll } from './cells'

/**
 * The trace layer: twelve greenness rhythms drawn over the canopy.
 *
 * Early on there is one trace on a rolling twelve-month window, the way a
 * bedside monitor shows a live waveform. As the scroll compresses time the
 * window opens to the whole record and the other eleven cells join, so the
 * same drawing routine carries both readings.
 */

const MINT = '#7af0b4'
const AMBER = '#f2c14e'
const RED = '#ff6a4d'
const GREY = 'rgba(190,206,200,0.42)'

const colourFor = (s: 'nominal' | 'stressed' | 'lost') => (s === 'lost' ? GREY : s === 'stressed' ? AMBER : MINT)

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Lane geometry morphs from one hero waveform to a twelve-channel stack. */
function laneRect(i: number, t: number, W: number, H: number): Rect {
  const solo: Rect = { x: W * 0.08, y: H * 0.6, w: W * 0.84, h: H * 0.22 }
  const rowH = H * 0.055
  const gap = H * 0.0135
  const top = H * 0.115
  const stack: Rect = { x: W * 0.53, y: top + i * (rowH + gap), w: W * 0.41, h: rowH }
  return {
    x: lerp(solo.x, stack.x, t),
    y: lerp(solo.y, stack.y, t),
    w: lerp(solo.w, stack.w, t),
    h: lerp(solo.h, stack.h, t),
  }
}

function traceY(r: Rect, v: number) {
  // 0.18..0.95 greenness maps to the full lane height
  return r.y + r.h - clamp01((v - 0.18) / 0.77) * r.h
}

function drawLane(
  g: CanvasRenderingContext2D,
  cell: Cell,
  r: Rect,
  winA: number,
  winB: number,
  now: number,
  alpha: number,
  labels: boolean,
) {
  if (alpha <= 0.01 || r.w < 4) return
  const status = statusOf(cell, now)
  const colour = colourFor(status)

  g.save()
  g.globalAlpha = alpha

  // lane floor
  g.strokeStyle = 'rgba(190,220,206,0.10)'
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(r.x, r.y + r.h)
  g.lineTo(r.x + r.w, r.y + r.h)
  g.stroke()

  const steps = Math.max(8, Math.round(r.w))
  const span = winB - winA

  // soft afterglow under the live portion
  g.beginPath()
  for (let i = 0; i <= steps; i++) {
    const year = winA + (i / steps) * span
    if (year > now) break
    const px = r.x + (i / steps) * r.w
    const py = traceY(r, ndvi(cell, year))
    if (i === 0) g.moveTo(px, py)
    else g.lineTo(px, py)
  }
  g.strokeStyle = colour
  g.lineWidth = 2.6
  g.globalAlpha = alpha * 0.16
  g.stroke()

  // the trace itself
  g.globalAlpha = alpha
  g.lineWidth = r.h > 40 ? 1.5 : 1.05
  g.stroke()

  // instability shading: where the rhythm is wrong, not just low
  const unrest = instability(cell, now)
  if (unrest > 0.05 && status !== 'lost') {
    g.globalAlpha = alpha * unrest * 0.16
    g.fillStyle = AMBER
    g.fillRect(r.x, r.y, r.w, r.h)
    g.globalAlpha = alpha
  }

  // cursor
  const cursorX = r.x + clamp01((now - winA) / span) * r.w
  const cv = ndvi(cell, Math.min(now, winB))
  g.beginPath()
  g.arc(cursorX, traceY(r, cv), r.h > 40 ? 3.6 : 2.2, 0, 6.283)
  g.fillStyle = colour
  g.fill()

  if (labels) {
    g.font = '400 9px "JetBrains Mono", monospace'
    g.textAlign = 'right'
    g.fillStyle = 'rgba(214,234,226,0.55)'
    g.fillText(cell.id, r.x - 10, r.y + r.h * 0.5 + 3)
    g.textAlign = 'left'
    if (status === 'lost' && cell.death !== null) {
      g.fillStyle = 'rgba(255,122,90,0.8)'
      g.fillText(`STOPPED ${fmtYear(cell.death)}`, r.x + r.w + 10, r.y + r.h * 0.5 + 3)
    } else if (status === 'stressed') {
      g.fillStyle = 'rgba(242,193,78,0.85)'
      g.fillText('UNSTABLE', r.x + r.w + 10, r.y + r.h * 0.5 + 3)
    } else {
      g.fillStyle = 'rgba(122,240,180,0.6)'
      g.fillText('NOMINAL', r.x + r.w + 10, r.y + r.h * 0.5 + 3)
    }
    g.textAlign = 'left'
  }

  g.restore()
}

/** The four-channel close-up on a single cell, late in the piece. */
function drawMonitor(g: CanvasRenderingContext2D, W: number, H: number, now: number, alpha: number) {
  if (alpha <= 0.01) return
  const cell = CELLS[7] // Interfluve — stressed, still standing
  const channels: { k: string; unit: string; colour: string; f: (y: number) => number; threshold?: number }[] = [
    { k: 'NDVI', unit: '', colour: MINT, f: (y) => ndvi(cell, y), threshold: 0.62 },
    { k: 'NDWI', unit: '', colour: '#6fd8e8', f: (y) => ndvi(cell, y) * 0.86 - 0.06 + Math.sin(y * 6.1) * 0.02 },
    { k: 'σ⁰ VH', unit: 'dB', colour: '#9fb3ff', f: (y) => 0.52 + Math.sin(y * 6.28 + 1.1) * 0.05 - instability(cell, y) * 0.16 },
    { k: 'Canopy height', unit: 'm', colour: '#f2c14e', f: (y) => 0.74 - instability(cell, y) * 0.2 },
  ]

  const x = W * 0.53
  const w = W * 0.41
  const top = H * 0.16
  const rowH = H * 0.13
  const gap = H * 0.035

  g.save()
  g.globalAlpha = alpha
  channels.forEach((ch, i) => {
    const r: Rect = { x, y: top + i * (rowH + gap), w, h: rowH }
    g.strokeStyle = 'rgba(190,220,206,0.12)'
    g.lineWidth = 1
    g.strokeRect(r.x, r.y, r.w, r.h)

    if (ch.threshold !== undefined) {
      const ty = r.y + r.h - ch.threshold * r.h
      g.setLineDash([3, 4])
      g.strokeStyle = 'rgba(255,122,77,0.55)'
      g.beginPath()
      g.moveTo(r.x, ty)
      g.lineTo(r.x + r.w, ty)
      g.stroke()
      g.setLineDash([])
    }

    const steps = Math.max(8, Math.round(r.w))
    g.beginPath()
    for (let s = 0; s <= steps; s++) {
      const year = lerp(2014, now, s / steps)
      const px = r.x + (s / steps) * r.w
      const py = r.y + r.h - clamp01(ch.f(year)) * r.h
      if (s === 0) g.moveTo(px, py)
      else g.lineTo(px, py)
    }
    g.strokeStyle = ch.colour
    g.lineWidth = 1.2
    g.stroke()

    g.font = '400 9px "JetBrains Mono", monospace'
    g.fillStyle = 'rgba(214,234,226,0.6)'
    g.textAlign = 'right'
    g.fillText(ch.k, r.x - 10, r.y + 10)
    g.textAlign = 'left'
    g.fillStyle = ch.colour
    g.fillText(ch.f(now).toFixed(3) + (ch.unit ? ' ' + ch.unit : ''), r.x + r.w + 10, r.y + 10)
  })
  g.restore()
}

export function drawTraces(cv: HTMLCanvasElement | null, p: number) {
  if (!cv) return
  const g = cv.getContext('2d')
  if (!g) return
  const W = cv.clientWidth
  const H = cv.clientHeight
  if (W < 8 || H < 8) return
  g.clearRect(0, 0, W, H)

  const now = yearForScroll(p)
  const stackT = smoothstep(seg(p, 0.2, 0.42))
  const expand = smoothstep(seg(p, 0.18, 0.44))
  const winA = lerp(Math.max(START_YEAR, now - 1.2), START_YEAR, expand)
  const winB = now + (1 - expand) * 0.05
  const labels = stackT > 0.55
  const monitorT = smoothstep(seg(p, 0.7, 0.8))

  if (monitorT < 0.99) {
    for (let i = 0; i < CELLS.length; i++) {
      const cell = CELLS[i]
      // the chorus joins one voice at a time
      const join = i === 0 ? 1 : smoothstep(seg(p, 0.2 + i * 0.012, 0.3 + i * 0.012))
      const alpha = join * (1 - monitorT) * lerp(1, 0.92, stackT)
      drawLane(g, cell, laneRect(i, stackT, W, H), winA, winB, now, alpha, labels && stackT > 0.6)
    }
  }
  drawMonitor(g, W, H, now, monitorT)

  // the time axis, once the window is the whole record
  if (expand > 0.4) {
    g.save()
    g.globalAlpha = (expand - 0.4) / 0.6
    g.font = '400 8px "JetBrains Mono", monospace'
    g.fillStyle = 'rgba(214,234,226,0.34)'
    const x0 = W * 0.53
    const w = W * 0.41
    for (let y = 1990; y <= 2020; y += 10) {
      const px = x0 + ((y - START_YEAR) / (2026.7 - START_YEAR)) * w
      g.fillText(String(y), px - 10, H * 0.105)
    }
    g.restore()
  }
}
