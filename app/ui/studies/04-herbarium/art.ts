import { lerp, mulberry32 } from '../lib/math'
import { makeForestMask } from '../lib/mask'

/**
 * Concept 04 draws its own botanical plates.
 * One geometry, two renderings: a pressed specimen and its vector skeleton.
 * Because both come from the same vein graph, the digitisation cross-fade
 * lands exactly on top of itself.
 */

export interface LeafGeometry {
  outline: [number, number][]
  midrib: [number, number][]
  veins: [number, number][][]
  nodes: [number, number][]
}

export function buildLeafGeometry(seed = 3): LeafGeometry {
  const rnd = mulberry32(seed)
  const tipY = 0.06
  const baseY = 0.95
  const outline: [number, number][] = []
  const STEPS = 46
  const width = 0.3 + rnd() * 0.07

  // ovate blade with a slightly irregular margin
  for (let side = 0; side < 2; side++) {
    const dir = side === 0 ? 1 : -1
    for (let i = 0; i <= STEPS; i++) {
      const t = side === 0 ? i / STEPS : 1 - i / STEPS
      const y = lerp(tipY, baseY, t)
      const swell = Math.sin(Math.pow(t, 0.78) * Math.PI) ** 0.82
      const serration = 1 + Math.sin(t * 34 + seed) * 0.035
      const x = 0.5 + dir * swell * width * serration
      outline.push([x, y])
    }
  }

  const midrib: [number, number][] = []
  for (let i = 0; i <= 26; i++) {
    const t = i / 26
    midrib.push([0.5 + Math.sin(t * 2.2) * 0.012, lerp(tipY + 0.01, baseY + 0.03, t)])
  }

  const veins: [number, number][][] = []
  const nodes: [number, number][] = []
  const PAIRS = 9
  for (let i = 1; i <= PAIRS; i++) {
    const t = i / (PAIRS + 1)
    const y0 = lerp(tipY + 0.05, baseY - 0.04, t)
    const swell = Math.sin(Math.pow(t, 0.78) * Math.PI) ** 0.82
    for (const dir of [1, -1]) {
      const path: [number, number][] = []
      const reach = swell * width * (0.86 + rnd() * 0.12)
      for (let k = 0; k <= 8; k++) {
        const s = k / 8
        const x = 0.5 + dir * reach * s
        const y = y0 - s * 0.055 * (1 - t * 0.4) + Math.sin(s * 2.4) * 0.006
        path.push([x, y])
      }
      veins.push(path)
      nodes.push(path[path.length - 1])
      // tertiary branch
      if (i % 2 === 0) {
        const branch: [number, number][] = []
        const from = path[5]
        for (let k = 0; k <= 4; k++) {
          const s = k / 4
          branch.push([from[0] + dir * s * reach * 0.34, from[1] + s * 0.045])
        }
        veins.push(branch)
      }
    }
    nodes.push([0.5, y0])
  }

  return { outline, midrib, veins, nodes }
}

function pathTo(g: CanvasRenderingContext2D, pts: [number, number][], W: number, H: number) {
  g.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x * W, y * H) : g.lineTo(x * W, y * H)))
}

/** The pressed specimen: dried olive-brown, mottled, slightly translucent. */
export function drawPressedLeaf(W: number, H: number, seed = 3): HTMLCanvasElement {
  const geo = buildLeafGeometry(seed)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const rnd = mulberry32(seed * 31 + 5)

  pathTo(g, geo.outline, W, H)
  g.closePath()
  const grad = g.createLinearGradient(0, 0, W * 0.8, H)
  grad.addColorStop(0, '#6f7a45')
  grad.addColorStop(0.42, '#5c6738')
  grad.addColorStop(1, '#4a4526')
  g.fillStyle = grad
  g.globalAlpha = 0.92
  g.fill()
  g.globalAlpha = 1

  // age spots and press marks
  g.save()
  g.clip()
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W
    const y = rnd() * H
    const r = 1 + rnd() * 13
    g.fillStyle = rnd() < 0.42 ? `rgba(92,62,26,${0.05 + rnd() * 0.18})` : `rgba(140,150,92,${0.04 + rnd() * 0.12})`
    g.beginPath()
    g.ellipse(x, y, r, r * (0.5 + rnd()), rnd() * 3, 0, 6.283)
    g.fill()
  }
  g.restore()

  // veins, lighter than the blade
  g.strokeStyle = 'rgba(214,214,176,0.5)'
  g.lineWidth = Math.max(0.6, W * 0.0045)
  for (const v of geo.veins) {
    pathTo(g, v, W, H)
    g.stroke()
  }
  g.strokeStyle = 'rgba(226,224,190,0.72)'
  g.lineWidth = Math.max(1, W * 0.009)
  pathTo(g, geo.midrib, W, H)
  g.stroke()

  // petiole
  g.strokeStyle = '#4a4526'
  g.lineWidth = Math.max(1.4, W * 0.012)
  g.beginPath()
  g.moveTo(0.5 * W, 0.95 * H)
  g.lineTo(0.505 * W, 1.0 * H)
  g.stroke()

  return c
}

/** The same leaf as extracted geometry: skeleton, nodes, crown hull. */
export function drawVectorLeaf(W: number, H: number, seed = 3): HTMLCanvasElement {
  const geo = buildLeafGeometry(seed)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!

  // crown hull, the polygon a segmenter would emit
  pathTo(g, geo.outline.filter((_, i) => i % 4 === 0), W, H)
  g.closePath()
  g.strokeStyle = 'rgba(122,240,180,0.95)'
  g.lineWidth = Math.max(1, W * 0.005)
  g.setLineDash([W * 0.02, W * 0.014])
  g.stroke()
  g.setLineDash([])
  g.fillStyle = 'rgba(80,220,150,0.09)'
  g.fill()

  g.strokeStyle = 'rgba(150,250,200,0.62)'
  g.lineWidth = Math.max(0.6, W * 0.0035)
  for (const v of geo.veins) {
    pathTo(g, v, W, H)
    g.stroke()
  }
  g.strokeStyle = 'rgba(190,255,220,0.9)'
  g.lineWidth = Math.max(1, W * 0.007)
  pathTo(g, geo.midrib, W, H)
  g.stroke()

  // vertices
  g.fillStyle = '#d8ffe9'
  for (const [x, y] of geo.nodes) {
    g.beginPath()
    g.arc(x * W, y * H, Math.max(1.3, W * 0.006), 0, 6.283)
    g.fill()
  }
  return c
}

/**
 * A synthetic Sentinel-2 style tile: canopy texture, the same clearing
 * geometry used elsewhere, crown polygons and two alert boxes.
 */
export function drawTile(W: number, H: number, opts: { polygons?: boolean; alerts?: boolean } = {}): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const rnd = mulberry32(512)
  const mask = makeForestMask(180, 21)

  g.fillStyle = '#16301a'
  g.fillRect(0, 0, W, H)
  // canopy mottle
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * W
    const y = rnd() * H
    const m = mask.sample(x / W, 1 - y / H)
    const r = 2 + rnd() * 9
    if (m > 0.4) {
      g.fillStyle = `rgba(${118 + rnd() * 40},${86 + rnd() * 30},${52 + rnd() * 24},${0.35 + rnd() * 0.4})`
    } else {
      g.fillStyle = `rgba(${22 + rnd() * 40},${70 + rnd() * 62},${28 + rnd() * 34},${0.3 + rnd() * 0.45})`
    }
    g.beginPath()
    g.arc(x, y, r, 0, 6.283)
    g.fill()
  }
  // bare ground where the mask says cleared
  g.globalAlpha = 0.55
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const m = mask.sample(x / W, 1 - y / H)
      if (m > 0.5) {
        g.fillStyle = `rgba(${132 + rnd() * 28},${100 + rnd() * 22},${62 + rnd() * 18},0.85)`
        g.fillRect(x, y, 3, 3)
      }
    }
  }
  g.globalAlpha = 1

  if (opts.polygons) {
    g.lineWidth = 1
    for (let i = 0; i < 520; i++) {
      const x = rnd() * W
      const y = rnd() * H
      if (mask.sample(x / W, 1 - y / H) > 0.35) continue
      const r = 5 + rnd() * 11
      const sides = 7
      g.beginPath()
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * 6.283
        const rr = r * (0.76 + rnd() * 0.42)
        const px = x + Math.cos(a) * rr
        const py = y + Math.sin(a) * rr
        if (s === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.closePath()
      g.strokeStyle = `rgba(122,240,180,${0.28 + rnd() * 0.4})`
      g.stroke()
      g.fillStyle = '#d8ffe9'
      g.fillRect(x - 0.7, y - 0.7, 1.4, 1.4)
    }
  }

  if (opts.alerts) {
    const boxes = [
      [0.16, 0.31, 0.16, 0.11],
      [0.6, 0.12, 0.19, 0.14],
      [0.68, 0.59, 0.14, 0.15],
    ]
    g.lineWidth = 1.6
    g.strokeStyle = '#ff3b2f'
    g.font = '400 9px "JetBrains Mono", monospace'
    g.fillStyle = '#ff6a54'
    boxes.forEach((b, i) => {
      g.strokeRect(b[0] * W, b[1] * H, b[2] * W, b[3] * H)
      g.fillText(`ALT-88${41 - i * 5}`, b[0] * W, b[1] * H - 5)
    })
  }

  return c
}

export const toURL = (c: HTMLCanvasElement) => c.toDataURL('image/png')
