import { clamp01, seg, smoothstep } from './math'

/**
 * Plumbing for the merged concepts.
 *
 * Every concept scene exposes the same three methods, so a merge is a list of
 * acts, each owning a window of the global scroll and mapping it onto a slice
 * of its own timeline. Scenes are built lazily the first time the scroll comes
 * near them — two WebGL contexts is fine, two built on page load is not.
 */

export interface SceneLike {
  update: (p: number, dt: number, t: number) => void
  resize: () => void
  dispose: () => void
}

export interface Act {
  key: string
  create: (canvas: HTMLCanvasElement) => SceneLike
  /** global scroll window this act is on screen for */
  a: number
  b: number
  /** the act's own timeline at `a` and at `b` (defaults to its whole arc) */
  from?: number
  to?: number
  /** crossfade length in global scroll units */
  fade?: number
  /** keep rendering (but hidden) instead of stopping at zero opacity */
  alwaysRender?: boolean
}

export class ActRunner {
  private scenes = new Map<string, SceneLike>()
  private live = new Set<string>()

  constructor(
    private canvases: Map<string, HTMLCanvasElement>,
    private acts: Act[],
  ) {}

  /** local progress for an act at global position p */
  localOf(act: Act, p: number) {
    const from = act.from ?? 0
    const to = act.to ?? 1
    return from + (to - from) * seg(p, act.a, act.b)
  }

  opacityOf(act: Act, p: number, index: number) {
    const fade = act.fade ?? 0.045
    const first = index === 0
    const last = index === this.acts.length - 1
    const inT = first ? 1 : smoothstep(seg(p, act.a, act.a + fade))
    const outT = last ? 1 : 1 - smoothstep(seg(p, act.b - fade, act.b))
    return clamp01(Math.min(inT, outT))
  }

  update(p: number, dt: number, t: number) {
    this.acts.forEach((act, i) => {
      const canvas = this.canvases.get(act.key)
      if (!canvas) return
      const near = p >= act.a - 0.12 && p <= act.b + 0.12
      const op = this.opacityOf(act, p, i)

      if (near && !this.scenes.has(act.key)) {
        this.scenes.set(act.key, act.create(canvas))
        this.live.add(act.key)
      }
      const scene = this.scenes.get(act.key)
      if (!scene) return

      const visible = op > 0.004
      canvas.style.opacity = op.toFixed(3)
      canvas.style.visibility = visible ? 'visible' : 'hidden'
      // a hidden scene still needs one more frame so it is correct when it
      // reappears, but not every frame
      if (visible || act.alwaysRender) scene.update(this.localOf(act, p), dt, t)
    })
  }

  /** the live scene for an act, once it has been built */
  get<T extends SceneLike>(key: string): T | undefined {
    return this.scenes.get(key) as T | undefined
  }

  resize() {
    for (const s of this.scenes.values()) s.resize()
  }

  dispose() {
    for (const s of this.scenes.values()) s.dispose()
    this.scenes.clear()
    this.live.clear()
  }
}
