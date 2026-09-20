import { clamp01, lerp, mulberry32 } from '../lib/math'

/**
 * Concept 08 treats the monitoring cell as a patient.
 *
 * A closed tropical canopy has a small, regular seasonal swing in greenness.
 * Degradation shows up first as a change in the *shape* of that rhythm — wider,
 * later, more erratic — and only afterwards as a change in cover. That is the
 * argument this concept makes, and these generators encode it.
 */

export const START_YEAR = 1984
export const END_YEAR = 2026.7

export interface Cell {
  id: string
  name: string
  areaHa: number
  /** year the rhythm starts to destabilise */
  stress: number
  /** year the canopy is removed, or null if it is still standing */
  death: number | null
  seed: number
  /** vertical offset of this cell's trace, 0..1 */
  lane: number
}

export const CELLS: Cell[] = [
  { id: 'C-01', name: 'Jaci ridge north', areaHa: 94_200, stress: 2019.1, death: null, seed: 3, lane: 0 },
  { id: 'C-02', name: 'Igarapé corridor', areaHa: 88_400, stress: 2003.4, death: 2008.7, seed: 11, lane: 1 },
  { id: 'C-03', name: 'BR-364 margin', areaHa: 132_900, stress: 1998.2, death: 2004.1, seed: 19, lane: 2 },
  { id: 'C-04', name: 'Upper terrace', areaHa: 76_100, stress: 2021.6, death: null, seed: 27, lane: 3 },
  { id: 'C-05', name: 'Rio bend east', areaHa: 118_700, stress: 2011.8, death: 2016.3, seed: 35, lane: 4 },
  { id: 'C-06', name: 'Serra flank', areaHa: 64_800, stress: 2028.0, death: null, seed: 43, lane: 5 },
  { id: 'C-07', name: 'Fishbone block 7', areaHa: 103_500, stress: 2013.9, death: 2019.6, seed: 51, lane: 6 },
  { id: 'C-08', name: 'Interfluve', areaHa: 141_300, stress: 2024.2, death: null, seed: 59, lane: 7 },
  { id: 'C-09', name: 'Estrada spur', areaHa: 71_900, stress: 2006.5, death: 2012.4, seed: 67, lane: 8 },
  { id: 'C-10', name: 'Headwater basin', areaHa: 96_600, stress: 2027.4, death: null, seed: 75, lane: 9 },
  { id: 'C-11', name: 'South escarpment', areaHa: 85_200, stress: 2009.7, death: 2023.8, seed: 83, lane: 10 },
  { id: 'C-12', name: 'Reserve core', areaHa: 111_000, stress: 2029.1, death: null, seed: 91, lane: 11 },
]

const jitter = (seed: number) => {
  const r = mulberry32(seed)
  const a = r()
  const b = r()
  const c = r()
  return (y: number) => Math.sin(y * 5.31 + a * 9) * 0.008 + Math.sin(y * 1.77 + b * 9) * 0.011 + (c - 0.5) * 0.004
}
const noiseCache = new Map<number, (y: number) => number>()
const noiseFor = (seed: number) => {
  let f = noiseCache.get(seed)
  if (!f) {
    f = jitter(seed)
    noiseCache.set(seed, f)
  }
  return f
}

/** Greenness of a cell at a decimal year, 0..1. */
export function ndvi(cell: Cell, year: number): number {
  const n = noiseFor(cell.seed)
  const dead = cell.death !== null && year >= cell.death
  const stressT = clamp01((year - cell.stress) / 5.5)

  // healthy baseline slowly drifts down with regional drying
  let base = 0.83 - clamp01((year - 1990) / 40) * 0.05
  // the seasonal swing widens and the phase slips as the stand is stressed
  let amp = lerp(0.062, 0.215, stressT)
  const phase = year + lerp(0, 0.22, stressT)
  const wobble = lerp(0, 0.055, stressT) * Math.sin(year * 2.7 + cell.seed)

  base -= stressT * 0.1

  if (dead) {
    const since = clamp01((year - (cell.death as number)) / 0.7)
    base = lerp(base, 0.215, since)
    amp = lerp(amp, 0.012, since)
  }

  return clamp01(base + amp * Math.sin(phase * Math.PI * 2) + wobble + n(year))
}

/** Rhythm irregularity — what a monitor would actually alarm on. */
export function instability(cell: Cell, year: number): number {
  const stressT = clamp01((year - cell.stress) / 5.5)
  const dead = cell.death !== null && year >= cell.death
  return dead ? 0.05 : stressT
}

export function statusOf(cell: Cell, year: number): 'nominal' | 'stressed' | 'lost' {
  if (cell.death !== null && year >= cell.death) return 'lost'
  if (year >= cell.stress) return 'stressed'
  return 'nominal'
}

/** Health of a cell for the 3D canopy: 1 = closed, 0 = cleared. */
export function health(cell: Cell, year: number): number {
  const dead = cell.death !== null && year >= cell.death
  if (dead) return clamp01(1 - (year - (cell.death as number)) / 0.6) * 0.06
  return clamp01(1 - clamp01((year - cell.stress) / 6) * 0.42)
}

/** Decimal year for a scroll position, with the opening held on one season. */
export function yearForScroll(p: number): number {
  const KEYS: [number, number][] = [
    [0.0, 1984.0],
    [0.06, 1984.2],
    [0.2, 1985.4],
    [0.42, 2004.0],
    [0.58, 2019.0],
    [0.72, 2026.0],
    [1.0, 2026.7],
  ]
  const t = clamp01(p)
  let i = 0
  while (i < KEYS.length - 2 && KEYS[i + 1][0] < t) i++
  const [pa, ya] = KEYS[i]
  const [pb, yb] = KEYS[i + 1]
  const k = pb === pa ? 0 : clamp01((t - pa) / (pb - pa))
  return lerp(ya, yb, k * k * (3 - 2 * k))
}

export const fmtYear = (y: number) => {
  const year = Math.floor(y)
  const month = Math.min(12, Math.max(1, Math.floor((y - year) * 12) + 1))
  return `${year}-${String(month).padStart(2, '0')}`
}
