import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const SHOW_DELAY = 450
/** After one tooltip was shown, the next one in this time appears at once. */
const WARM_MS = 400
const GAP = 8
const MARGIN = 8
const SELECTOR = '[data-tip],[title],[data-tip-title]'

interface Tip {
  text: string
  rect: DOMRect
}

/**
 * The tooltips of the whole app. Any element with a `title` or `data-tip` attribute gets one, so a
 * button only needs a title. While the pointer is on an element its `title` is taken away (otherwise
 * the system would show its own tooltip too) and put back when the pointer leaves.
 */
export function Tooltips(): React.JSX.Element | null {
  const [tip, setTip] = useState<Tip | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let target: HTMLElement | null = null
    let timer = 0
    let lastShown = 0
    let watch = 0

    const textOf = (el: HTMLElement): string => (el.getAttribute('data-tip') ?? el.getAttribute('data-tip-title') ?? el.getAttribute('title') ?? '').trim()

    // Take the title away while the tooltip belongs to this element, put it back afterwards.
    const stash = (el: HTMLElement): void => {
      const title = el.getAttribute('title')
      if (title === null) return
      el.setAttribute('data-tip-title', title)
      el.removeAttribute('title')
    }
    const restore = (el: HTMLElement | null): void => {
      if (!el) return
      const title = el.getAttribute('data-tip-title')
      if (title === null) return
      el.removeAttribute('data-tip-title')
      if (!el.hasAttribute('title')) el.setAttribute('title', title)
    }

    const hide = (): void => {
      window.clearTimeout(timer)
      window.clearInterval(watch)
      setTip(null)
      setPos(null)
    }
    const show = (): void => {
      if (!target || !target.isConnected) return
      const text = textOf(target)
      if (!text) return
      setTip({ text, rect: target.getBoundingClientRect() })
      lastShown = Date.now()
      // Close it when the element goes away or the pointer has left without us noticing.
      window.clearInterval(watch)
      watch = window.setInterval(() => {
        if (!target || !target.isConnected || (!target.matches(':hover') && !target.matches(':focus-visible'))) {
          restore(target)
          target = null
          hide()
        }
      }, 300)
    }
    const schedule = (immediate: boolean): void => {
      window.clearTimeout(timer)
      if (immediate || Date.now() - lastShown < WARM_MS) show()
      else timer = window.setTimeout(show, SHOW_DELAY)
    }
    const leave = (): void => {
      restore(target)
      target = null
      hide()
    }

    const onOver = (e: MouseEvent): void => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(SELECTOR) ?? null
      if (el === target) return
      leave()
      if (!el) return
      target = el
      if (!textOf(el)) {
        target = null
        return
      }
      stash(el)
      schedule(false)
    }
    const onOut = (e: MouseEvent): void => {
      if (!e.relatedTarget) leave()
    }
    // A click, a key, a scroll or a drag ends the tooltip. It comes back when the pointer enters again.
    const onDismiss = (): void => {
      window.clearTimeout(timer)
      hide()
    }
    const onFocusIn = (e: FocusEvent): void => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(SELECTOR) ?? null
      if (!el || !el.matches(':focus-visible')) return
      leave()
      target = el
      stash(el)
      schedule(true)
    }
    const onFocusOut = (): void => leave()

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('mousedown', onDismiss, true)
    document.addEventListener('keydown', onDismiss, true)
    document.addEventListener('wheel', onDismiss, { capture: true, passive: true })
    document.addEventListener('scroll', onDismiss, true)
    document.addEventListener('dragstart', onDismiss, true)
    document.addEventListener('contextmenu', onDismiss, true)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('blur', leave)
    return () => {
      leave()
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('mousedown', onDismiss, true)
      document.removeEventListener('keydown', onDismiss, true)
      document.removeEventListener('wheel', onDismiss, true)
      document.removeEventListener('scroll', onDismiss, true)
      document.removeEventListener('dragstart', onDismiss, true)
      document.removeEventListener('contextmenu', onDismiss, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('blur', leave)
    }
  }, [])

  // Place it below the element, or above when there is no room, and keep it inside the window.
  useLayoutEffect(() => {
    if (!tip || !boxRef.current) return
    const w = boxRef.current.offsetWidth
    const h = boxRef.current.offsetHeight
    const r = tip.rect
    const below = r.bottom + GAP + h <= window.innerHeight - MARGIN || r.top - GAP - h < MARGIN
    const top = below ? r.bottom + GAP : r.top - GAP - h
    const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, MARGIN), window.innerWidth - w - MARGIN)
    setPos({ left, top, below })
  }, [tip])

  if (!tip) return null
  return (
    <div
      ref={boxRef}
      className={'tip' + (pos ? (pos.below ? ' below' : ' above') : '')}
      role="tooltip"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      {tip.text}
    </div>
  )
}
