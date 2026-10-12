import { useEffect, useRef } from 'react'
import { fmtDb } from '../lib/format'
import type { Mixer } from '../lib/mixer'

interface Props {
  mixer: Mixer | null
  index: number
  muted: boolean
}

const SEGMENTS = [-45, -30, -18, -9, -3]

/** Five-step level meter and peak text for one audio track. Updates without re-rendering React. */
export function Meter({ mixer, index, muted }: Props): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    let hold = -60
    let holdUntil = 0
    const tick = (): void => {
      const now = performance.now()
      const db = mixer && !muted ? mixer.level(index) : -60
      if (db >= hold || now > holdUntil) {
        hold = db
        holdUntil = now + 800
      }
      const bar = barRef.current
      if (bar) {
        SEGMENTS.forEach((threshold, i) => {
          const el = bar.children[i] as HTMLElement
          const lit = db >= threshold
          el.className = lit ? (i === 4 ? 'clip' : i === 3 ? 'hot' : 'lit') : ''
          el.style.height = `${40 + i * 15}%`
        })
      }
      if (textRef.current) textRef.current.textContent = fmtDb(hold)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mixer, index, muted])

  return (
    <>
      <div className="meter" ref={barRef} aria-hidden="true">
        {SEGMENTS.map((s) => (
          <span key={s} />
        ))}
      </div>
      <span
        ref={textRef}
        className="mono"
        title="Peak level"
        style={{ flex: 'none', width: 62, textAlign: 'right', fontSize: 12, color: 'var(--s-tagged)' }}
      >
        -∞ dB
      </span>
    </>
  )
}
