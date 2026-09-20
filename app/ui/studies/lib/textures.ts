import * as THREE from 'three'
import { mulberry32 } from './math'

/**
 * Procedural leaf sprite. Generated in-canvas so the prototypes ship with no
 * binary assets; replace with an authored alpha atlas for production.
 */
export function makeLeafTexture(size = 192, seed = 7): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const rnd = mulberry32(seed)
  const S = size

  g.clearRect(0, 0, S, S)
  g.translate(S / 2, S / 2)

  // blade
  const grad = g.createLinearGradient(0, -S * 0.46, 0, S * 0.46)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.45, '#e6e6e6')
  grad.addColorStop(1, '#bfbfbf')
  g.fillStyle = grad
  g.beginPath()
  g.moveTo(0, -S * 0.46)
  g.bezierCurveTo(S * 0.3, -S * 0.3, S * 0.27, S * 0.2, 0, S * 0.45)
  g.bezierCurveTo(-S * 0.27, S * 0.2, -S * 0.3, -S * 0.3, 0, -S * 0.46)
  g.closePath()
  g.fill()

  // midrib + laterals, cut out of the blade so veins read at small sizes
  g.globalCompositeOperation = 'destination-out'
  g.strokeStyle = 'rgba(0,0,0,0.55)'
  g.lineWidth = Math.max(1, S * 0.012)
  g.beginPath()
  g.moveTo(0, -S * 0.44)
  g.lineTo(0, S * 0.44)
  g.stroke()
  g.lineWidth = Math.max(1, S * 0.006)
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const y = -S * 0.38 + t * S * 0.74
    const spread = Math.sin(t * Math.PI) * S * 0.24
    for (const dir of [-1, 1]) {
      g.beginPath()
      g.moveTo(0, y)
      g.quadraticCurveTo(dir * spread * 0.6, y + S * 0.03, dir * spread, y + S * 0.09 + rnd() * S * 0.02)
      g.stroke()
    }
  }
  g.globalCompositeOperation = 'source-over'

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Radial soft particle used for embers and light motes. */
export function makeGlowTexture(size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Bark-ish vertical streak texture for trunks and the ring concept. */
export function makeBarkCanvas(w = 256, h = 512, seed = 3): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const rnd = mulberry32(seed)
  g.fillStyle = '#2a1f17'
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 420; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const len = 40 + rnd() * 260
    const v = 20 + rnd() * 60
    g.strokeStyle = `rgba(${v + 30},${v + 18},${v + 8},${0.12 + rnd() * 0.3})`
    g.lineWidth = 0.6 + rnd() * 3.2
    g.beginPath()
    g.moveTo(x, y)
    g.bezierCurveTo(x + (rnd() - 0.5) * 12, y + len * 0.4, x + (rnd() - 0.5) * 16, y + len * 0.7, x + (rnd() - 0.5) * 10, y + len)
    g.stroke()
  }
  return c
}
