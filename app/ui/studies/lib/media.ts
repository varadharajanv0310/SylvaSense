import { clamp01 } from './math'

/**
 * Media layer for the concepts.
 *
 * Everything in public/media/ is public-domain source (NASA SVS, NASA GSFC,
 * US Forest Service) trimmed and re-encoded for the web, plus four synthesised
 * ambience beds. See public/media/CREDITS.md. Replacing any file with licensed
 * footage of the same name needs no code change.
 */

export const MEDIA = {
  /** NASA SVS — flying through airborne LiDAR canopy data */
  canopy: '/media/canopy.mp4',
  /** NASA SVS — the survey aircraft and its scanning cone */
  lidar: '/media/lidar-scan.mp4',
  /** US Forest Service — Kaiser Canyon fire */
  fire: '/media/fire.mp4',
  /** NASA GSFC — Landsat time-lapse of Rondônia, 1977 → 2003 */
  rondonia: '/media/rondonia.mp4',
  /** stills pulled from the same Landsat sequence */
  tile: '/media/tile-rgb.jpg',
  tile1977: '/media/tile-rgb-1977.jpg',
  audio: {
    forest: '/media/amb-forest.mp3',
    fire: '/media/amb-fire.mp3',
    wind: '/media/amb-wind.mp3',
    data: '/media/amb-data.mp3',
  },
} as const

export type BedName = keyof typeof MEDIA.audio

/* ------------------------------------------------------------------ */
/* video                                                               */
/* ------------------------------------------------------------------ */

interface VideoOpts {
  loop?: boolean
  /** play continuously instead of being driven by scroll */
  autoplay?: boolean
}

export function createVideo(src: string, opts: VideoOpts = {}): HTMLVideoElement {
  const v = document.createElement('video')
  v.src = src
  v.crossOrigin = 'anonymous'
  v.muted = true
  v.defaultMuted = true
  v.playsInline = true
  v.loop = opts.loop ?? true
  v.preload = 'auto'
  // keep it out of layout but still decodable
  v.setAttribute('aria-hidden', 'true')
  if (opts.autoplay) {
    const go = () => v.play().catch(() => undefined)
    v.addEventListener('canplay', go, { once: true })
    go()
  }
  return v
}

/**
 * A video whose playhead is a function of scroll rather than of time.
 *
 * The clips are encoded with a short GOP so seeking is cheap, and we only
 * issue a seek when the target has moved far enough to matter — otherwise a
 * per-frame currentTime write stalls the decoder.
 */
export class ScrubVideo {
  readonly el: HTMLVideoElement
  ready = false
  private want = 0
  private last = -1

  /** Pass an existing element when the video lives in the React tree. */
  constructor(source: string | HTMLVideoElement) {
    if (typeof source === 'string') {
      this.el = createVideo(source, { loop: false })
    } else {
      this.el = source
      this.el.muted = true
      this.el.playsInline = true
      this.el.loop = false
      this.el.preload = 'auto'
    }
    const mark = () => {
      this.ready = Number.isFinite(this.el.duration) && this.el.duration > 0
    }
    this.el.addEventListener('loadedmetadata', mark)
    this.el.addEventListener('canplay', mark)
    // a paused video still needs one decode pass to show a first frame
    this.el.addEventListener(
      'loadeddata',
      () => {
        this.el.currentTime = 0.001
      },
      { once: true },
    )
  }

  /** target position, 0..1 through the clip */
  seek(t: number) {
    this.want = clamp01(t)
  }

  update() {
    if (!this.ready) return
    const target = this.want * (this.el.duration - 0.05)
    if (this.last < 0 || Math.abs(target - this.last) > 0.035) {
      this.last = target
      try {
        this.el.currentTime = target
      } catch {
        /* seeking before the buffer is ready throws on some builds */
      }
    }
  }

  dispose() {
    this.el.pause()
  }
}

export function loadImage(src: string): HTMLImageElement {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  return img
}

/* ------------------------------------------------------------------ */
/* audio                                                               */
/* ------------------------------------------------------------------ */

/**
 * Four looping ambience beds on one graph, crossfaded by scroll position.
 * Browsers will not start an AudioContext without a gesture, so nothing is
 * constructed until enable() is called from a click.
 */
export class AudioMixer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private beds = new Map<BedName, GainNode>()
  private targets = new Map<BedName, number>()
  enabled = false
  loading = false

  async enable(): Promise<boolean> {
    if (this.enabled || this.loading) return this.enabled
    this.loading = true
    try {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      const ctx: AudioContext = new Ctor()
      await ctx.resume()
      const master = ctx.createGain()
      master.gain.value = 0
      master.connect(ctx.destination)

      const names = Object.keys(MEDIA.audio) as BedName[]
      const buffers = await Promise.all(
        names.map(async (n) => {
          const res = await fetch(MEDIA.audio[n])
          return ctx.decodeAudioData(await res.arrayBuffer())
        }),
      )

      names.forEach((n, i) => {
        const src = ctx.createBufferSource()
        src.buffer = buffers[i]
        src.loop = true
        const g = ctx.createGain()
        g.gain.value = 0
        src.connect(g).connect(master)
        src.start(0, Math.random() * buffers[i].duration)
        this.beds.set(n, g)
        this.targets.set(n, 0)
      })

      this.ctx = ctx
      this.master = master
      master.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.8)
      this.enabled = true
    } catch {
      this.enabled = false
    }
    this.loading = false
    return this.enabled
  }

  /** Called every frame with the mix for the current scroll position. */
  set(levels: Partial<Record<BedName, number>>) {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    for (const [name, gain] of this.beds) {
      const v = clamp01(levels[name] ?? 0)
      if (Math.abs(v - (this.targets.get(name) ?? 0)) < 0.004) continue
      this.targets.set(name, v)
      gain.gain.cancelScheduledValues(now)
      gain.gain.setTargetAtTime(v, now, 0.18)
    }
  }

  mute(on: boolean) {
    if (!this.ctx || !this.master) return
    this.master.gain.cancelScheduledValues(this.ctx.currentTime)
    this.master.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, 0.2)
  }

  dispose() {
    this.beds.clear()
    this.ctx?.close().catch(() => undefined)
    this.ctx = null
    this.master = null
    this.enabled = false
  }
}
