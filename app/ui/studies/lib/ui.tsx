'use client'

import { CSSProperties, ReactNode, useEffect, useRef } from 'react'
import Link from 'next/link'
import { setText } from './narrative'

type BeatMode = 'up' | 'down' | 'left' | 'scale' | 'push' | 'none'

interface BeatProps {
  /** Global scroll window this block occupies, 0..1. */
  a: number
  b: number
  children: ReactNode
  className?: string
  style?: CSSProperties
  mode?: BeatMode
  /** Fraction of the window spent fading in / out. */
  hold?: number
  dist?: number
  blur?: boolean
}

/**
 * A block of typography pinned to a slice of the scroll timeline.
 * Opacity + transform are written by the narrative loop, never by React.
 */
export function Beat({ a, b, children, className = '', style, mode = 'up', hold = 0.26, dist = 34, blur }: BeatProps) {
  // Layout lives on the outer element, animation on the inner one, so the
  // narrative loop can overwrite `transform` without destroying positioning.
  return (
    <div className={`beat-pos ${className}`} style={style}>
      <div
        className="beat"
        data-a={a}
        data-b={b}
        data-mode={mode}
        data-hold={hold}
        data-dist={dist}
        data-blur={blur ? '1' : '0'}
      >
        {children}
      </div>
    </div>
  )
}

interface CounterProps {
  from: number
  to: number
  a: number
  b: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
}

/** A number that interpolates across its own scroll window. */
export function Counter({ from, to, a, b, decimals = 0, prefix, suffix, className }: CounterProps) {
  return (
    <span
      className={className}
      data-counter="1"
      data-ca={a}
      data-cb={b}
      data-from={from}
      data-to={to}
      data-dec={decimals}
      data-prefix={prefix ?? ''}
      data-suffix={suffix ?? ''}
    >
      {/* one child, not three: updateCounters writes textContent, and React
          cannot reconcile away text nodes that have been collapsed underneath
          it — that throws NotFoundError on removeChild at unmount */}
      {`${prefix ?? ''}${from}${suffix ?? ''}`}
    </span>
  )
}

/** Fixed chrome shared by all five concepts: index, title, progress rail. */
export function ConceptChrome({
  index,
  title,
  chapters,
  accent = '#ffffff',
}: {
  index: string
  title: string
  chapters: { at: number; label: string }[]
  accent?: string
}) {
  const fillRef = useRef<HTMLDivElement>(null)
  const chapRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let current = ''
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const p = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--p')) || 0
      if (fillRef.current) fillRef.current.style.height = `${(p * 100).toFixed(2)}%`
      if (hintRef.current) hintRef.current.style.opacity = p > 0.015 ? '0' : '1'
      let label = chapters[0]?.label ?? ''
      for (const c of chapters) if (p >= c.at) label = c.label
      if (chapRef.current && label !== current) {
        current = label
        setText(chapRef.current, label)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [chapters])

  return (
    <>
      <div className="chrome chrome-tl">
        <Link href="/studies" className="micro" style={{ opacity: 0.85 }}>
          ← All studies
        </Link>
      </div>
      <div className="chrome chrome-tr">
        <div className="micro" style={{ opacity: 0.85 }}>
          {index} · {title}
        </div>
      </div>
      <div className="chrome chrome-bl">
        {/* seeded with a text child so the loop's textContent writes replace a
            node React already knows about */}
        <div ref={chapRef} className="micro" style={{ opacity: 0.85 }}>
          {chapters[0]?.label ?? ''}
        </div>
      </div>
      <div className="rail">
        <div ref={fillRef} className="rail-fill" style={{ background: accent }} />
      </div>
      <div ref={hintRef} className="hint">
        <div className="micro" style={{ textAlign: 'center' }}>
          Scroll
        </div>
        <div className="hint-line" />
      </div>
    </>
  )
}

/** The invisible column that produces scroll distance for a fixed stage. */
export function ScrollTrack({ pages }: { pages: number }) {
  return <div className="scroll-track" style={{ height: `${pages * 100}vh` }} />
}
