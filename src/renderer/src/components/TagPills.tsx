import { useLayoutEffect, useMemo, useRef, useState } from 'react'

/**
 * A row of tag pills that fills the width it has. When not all tags fit, the rest is a "+N" pill
 * and a tooltip on it lists the hidden tags under each other. `children` (for example a suggested
 * tag) sit after the pills and keep their room.
 */
export function TagPills({
  tags,
  className,
  children
}: {
  tags: string[]
  className: string
  children?: React.ReactNode
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const extra = useRef<HTMLSpanElement>(null)
  const measure = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [shown, setShown] = useState(tags.length)
  const sig = useMemo(() => tags.join('\u0000'), [tags])
  const hasExtra = children !== undefined && children !== null && children !== false

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = box.current
    const layer = measure.current
    if (!el || !layer || width === 0) return
    const pills = [...layer.querySelectorAll<HTMLElement>('[data-pill]')].map((p) => p.offsetWidth)
    const more = layer.querySelector<HTMLElement>('[data-more]')?.offsetWidth ?? 0
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0
    const extraW = hasExtra ? (extra.current?.offsetWidth ?? 0) : 0
    const avail = width - (extraW > 0 ? extraW + gap : 0)
    const all = pills.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, pills.length - 1)
    let n = pills.length
    if (all > avail) {
      // Leave room for the +N pill after the last tag that fits.
      let used = 0
      n = 0
      for (let i = 0; i < pills.length; i++) {
        const next = used + (i > 0 ? gap : 0) + pills[i]
        if (next + gap + more > avail) break
        used = next
        n = i + 1
      }
      n = Math.max(n, 1)
    }
    setShown(n)
  }, [sig, width, hasExtra])

  const count = Math.min(shown, tags.length)
  const rest = tags.slice(count)
  return (
    <div ref={box} className={className + ' tp'}>
      {tags.slice(0, count).map((t) => (
        <span key={t} className="pill">
          {t}
        </span>
      ))}
      {rest.length > 0 && (
        <span className="pill tp-more" data-tip={rest.join('\n')}>
          +{rest.length}
        </span>
      )}
      {hasExtra && (
        <span ref={extra} className="tp-extra">
          {children}
        </span>
      )}
      {tags.length > 0 && (
        <div ref={measure} className="tp-measure" aria-hidden>
          {tags.map((t) => (
            <span key={t} data-pill className="pill">
              {t}
            </span>
          ))}
          <span data-more className="pill">
            +{tags.length}
          </span>
        </div>
      )}
    </div>
  )
}
