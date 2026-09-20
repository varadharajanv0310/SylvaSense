import { clamp01, mulberry32 } from './math'

/**
 * A reusable "what has been cleared" mask, drawn once to a canvas.
 * Concepts sample it on the CPU (tree placement) and on the GPU (imagery), so
 * every representation of the same ground agrees with every other one.
 * White = cleared, black = intact.
 */
export interface ForestMask {
  canvas: HTMLCanvasElement
  size: number
  /** u, v in 0..1 (v = 0 at the bottom of the canvas). */
  sample: (u: number, v: number) => number
}

export function makeForestMask(size = 256, seed = 21): ForestMask {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const rnd = mulberry32(seed)

  g.fillStyle = '#000'
  g.fillRect(0, 0, size, size)
  g.lineCap = 'round'
  g.strokeStyle = '#fff'
  g.fillStyle = '#fff'

  // haul road
  g.lineWidth = size * 0.02
  g.beginPath()
  g.moveTo(size * 0.38, size * 1.03)
  g.bezierCurveTo(size * 0.5, size * 0.72, size * 0.34, size * 0.4, size * 0.46, size * -0.03)
  g.stroke()

  // ribs
  for (let i = 0; i < 24; i++) {
    const t = i / 23
    const y = size * (1.02 - t * 1.04)
    const x = size * (0.4 + Math.sin(t * 3.4) * 0.04)
    const len = size * (0.08 + rnd() * 0.3) * (1 - Math.abs(t - 0.5) * 0.9)
    g.lineWidth = size * (0.005 + rnd() * 0.009)
    for (const dir of [-1, 1]) {
      if (rnd() < 0.2) continue
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + dir * len, y + (rnd() - 0.5) * size * 0.05)
      g.stroke()
    }
  }

  // block cuts
  const blocks = [
    [0.16, 0.58, 0.16, 0.11],
    [0.6, 0.74, 0.19, 0.14],
    [0.68, 0.26, 0.14, 0.15],
    [0.08, 0.16, 0.13, 0.1],
  ]
  for (const b of blocks) {
    g.beginPath()
    g.rect(b[0] * size, b[1] * size, b[2] * size, b[3] * size)
    g.fill()
  }

  const data = g.getImageData(0, 0, size, size).data
  const sample = (u: number, v: number) => {
    const px = Math.min(size - 1, Math.max(0, (clamp01(u) * size) | 0))
    const py = Math.min(size - 1, Math.max(0, ((1 - clamp01(v)) * size) | 0))
    return data[(py * size + px) * 4] / 255
  }
  return { canvas, size, sample }
}

/** Cleared blocks in normalised mask space, for drawing alert boxes. */
export const MASK_BLOCKS = [
  [0.16, 0.58, 0.16, 0.11],
  [0.6, 0.74, 0.19, 0.14],
  [0.68, 0.26, 0.14, 0.15],
]
