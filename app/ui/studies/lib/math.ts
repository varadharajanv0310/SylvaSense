/** Small math / easing kit shared by every concept. */

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const clamp01 = (v: number) => clamp(v, 0, 1)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const inv = (v: number, a: number, b: number) => (b === a ? 0 : (v - a) / (b - a))

/** Local 0..1 progress of a global scroll value inside a range. */
export const seg = (p: number, a: number, b: number) => clamp01(inv(p, a, b))

export const smoothstep = (t: number) => {
  t = clamp01(t)
  return t * t * (3 - 2 * t)
}
export const smootherstep = (t: number) => {
  t = clamp01(t)
  return t * t * t * (t * (t * 6 - 15) + 10)
}
/** 0 -> 1 -> 0 across a range. Useful for beats that swell and recede. */
export const arc = (p: number, a: number, b: number) => Math.sin(seg(p, a, b) * Math.PI)

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)
export const easeInCubic = (t: number) => Math.pow(clamp01(t), 3)
export const easeInOutCubic = (t: number) => {
  t = clamp01(t)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(t)))

/** Deterministic PRNG so every reload renders the same forest. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Cheap value noise, good enough for terrain/canopy variation. */
export function makeNoise2D(seed = 1) {
  const rnd = mulberry32(seed)
  const perm = new Uint8Array(512)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const grad = (h: number, x: number, y: number) => {
    const u = h & 1 ? x : -x
    const v = h & 2 ? y : -y
    return u + v
  }
  return (x: number, y: number) => {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    const u = fade(x)
    const v = fade(y)
    const A = perm[X] + Y
    const B = perm[X + 1] + Y
    return (
      lerp(
        lerp(grad(perm[A], x, y), grad(perm[B], x - 1, y), u),
        lerp(grad(perm[A + 1], x, y - 1), grad(perm[B + 1], x - 1, y - 1), u),
        v,
      ) * 0.7
    )
  }
}

export const nf = new Intl.NumberFormat('en-US')
export const fmtInt = (n: number) => nf.format(Math.round(n))
export const fmtFixed = (n: number, d = 1) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

/** Pad a counter so digits do not jitter as they tick. */
export const pad = (n: number, w: number) => String(Math.round(n)).padStart(w, '0')
