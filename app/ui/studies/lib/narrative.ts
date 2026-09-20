import { useEffect, useRef } from 'react'
import Lenis from 'lenis'
import { clamp01, lerp, seg, smoothstep } from './math'

export type FrameFn = (p: number, dt: number, t: number) => void

/** Device tier. Heavy scenes scale their particle budgets off this. */
export function perfTier(): 'low' | 'mid' | 'high' {
  if (typeof window === 'undefined') return 'mid'
  const mobile = window.matchMedia('(max-width: 820px)').matches
  const dpr = window.devicePixelRatio || 1
  const cores = (navigator as any).hardwareConcurrency ?? 4
  if (mobile || cores <= 4) return 'low'
  if (cores >= 8 && dpr <= 2) return 'high'
  return 'mid'
}

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Write text that the frame loop owns.
 *
 * Assigning `textContent` destroys the element's existing text node and makes
 * a new one. React still holds a reference to the original and calls
 * removeChild on it when the route unmounts, which throws NotFoundError and
 * tears down the tree. Mutating nodeValue keeps the same node, so React's
 * bookkeeping stays valid.
 */
export function setText(el: HTMLElement | null | undefined, value: string) {
  if (!el) return
  const first = el.firstChild
  if (first && first.nodeType === 3) {
    if (first.nodeValue !== value) first.nodeValue = value
  } else if (el.textContent !== value) {
    el.textContent = value
  }
}

/**
 * Applies scroll-driven visibility to every `.beat` element under `root`.
 * Each beat declares the global scroll window it lives in via data-a / data-b,
 * and a transform mode. Beats are mutated directly (no React re-render) so
 * typography stays in lockstep with the WebGL/canvas frame.
 */
export function updateBeats(root: HTMLElement, p: number) {
  const els = root.querySelectorAll<HTMLElement>('.beat')
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    const a = +(el.dataset.a ?? 0)
    const b = +(el.dataset.b ?? 1)
    const t = seg(p, a, b)
    const hold = +(el.dataset.hold ?? 0.26)
    const fin = smoothstep(seg(t, 0, hold))
    const fout = 1 - smoothstep(seg(t, 1 - hold, 1))
    const o = Math.min(fin, fout)
    const mode = el.dataset.mode ?? 'up'
    const dist = +(el.dataset.dist ?? 34)

    let transform = ''
    if (mode === 'up') transform = `translate3d(0,${(1 - fin) * dist - (1 - fout) * dist * 0.55}px,0)`
    else if (mode === 'down') transform = `translate3d(0,${-(1 - fin) * dist + (1 - fout) * dist * 0.55}px,0)`
    else if (mode === 'left') transform = `translate3d(${(1 - fin) * dist}px,0,0)`
    else if (mode === 'scale') transform = `scale(${lerp(1.08, 1, fin) * lerp(1, 1.04, 1 - fout)})`
    else if (mode === 'push') transform = `translate3d(0,0,${lerp(-260, 0, fin)}px) scale(${lerp(1, 1.14, 1 - fout)})`
    else if (mode === 'none') transform = ''

    el.style.opacity = o.toFixed(3)
    if (transform) el.style.transform = transform
    const dead = o < 0.004
    el.style.visibility = dead ? 'hidden' : 'visible'
    el.style.pointerEvents = dead ? 'none' : ''
    if (el.dataset.blur === '1') el.style.filter = `blur(${((1 - o) * 12).toFixed(2)}px)`
  }
}

/** Elements marked data-counter animate a number across their beat window. */
export function updateCounters(root: HTMLElement, p: number) {
  const els = root.querySelectorAll<HTMLElement>('[data-counter]')
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    const a = +(el.dataset.ca ?? 0)
    const b = +(el.dataset.cb ?? 1)
    const from = +(el.dataset.from ?? 0)
    const to = +(el.dataset.to ?? 100)
    const dec = +(el.dataset.dec ?? 0)
    const t = smoothstep(seg(p, a, b))
    const v = lerp(from, to, t)
    const txt =
      dec > 0
        ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : new Intl.NumberFormat('en-US').format(Math.round(v))
    setText(el, (el.dataset.prefix ?? '') + txt + (el.dataset.suffix ?? ''))
  }
}

interface NarrativeOpts {
  /** Total scroll length in viewport heights. */
  pages: number
  onFrame: FrameFn
  /** Extra smoothing on top of Lenis. 0 = raw, 0.12 = silky. */
  ease?: number
}

/**
 * Core scroll engine. Owns Lenis, the rAF loop, the normalized progress value
 * and the beat/counter DOM sync. Every concept mounts exactly one of these.
 */
export function useNarrative({ pages, onFrame, ease = 0.1 }: NarrativeOpts) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const progress = useRef(0)
  const target = useRef(0)
  const frameRef = useRef(onFrame)
  frameRef.current = onFrame

  useEffect(() => {
    window.scrollTo(0, 0)
    const rm = reducedMotion()
    const lenis = new Lenis({
      lerp: rm ? 1 : 0.085,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.4,
      smoothWheel: !rm,
    })

    // handy for QA: __lenis.scrollTo(fraction * maxScroll, { immediate: true })
    if (import.meta.env.DEV) (window as any).__lenis = lenis

    let raf = 0
    let last = performance.now()
    const start = last
    let alive = true

    const tick = (now: number) => {
      if (!alive) return
      raf = requestAnimationFrame(tick)
      lenis.raf(now)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      const max = document.documentElement.scrollHeight - window.innerHeight
      target.current = max > 0 ? clamp01(window.scrollY / max) : 0
      const k = rm ? 1 : 1 - Math.pow(1 - clamp01(ease), dt * 60)
      progress.current += (target.current - progress.current) * (rm ? 1 : Math.max(k, 0.02))

      const p = progress.current
      frameRef.current(p, dt, (now - start) / 1000)
      if (rootRef.current) {
        updateBeats(rootRef.current, p)
        updateCounters(rootRef.current, p)
      }
      document.documentElement.style.setProperty('--p', p.toFixed(4))
    }
    raf = requestAnimationFrame(tick)

    // QA hook: drive one frame at an exact progress value. Needed because a
    // backgrounded window throttles rAF to zero and the loop stops advancing.
    if (import.meta.env.DEV) {
      ;(window as any).__frame = (v: number) => {
        progress.current = clamp01(v)
        frameRef.current(progress.current, 1 / 60, performance.now() / 1000)
        if (rootRef.current) {
          updateBeats(rootRef.current, progress.current)
          updateCounters(rootRef.current, progress.current)
        }
        document.documentElement.style.setProperty('--p', progress.current.toFixed(4))
        return progress.current
      }
    }

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      lenis.destroy()
      if (import.meta.env.DEV) delete (window as any).__frame
    }
  }, [ease])

  return { rootRef, progress, pages }
}
