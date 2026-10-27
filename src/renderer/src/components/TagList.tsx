import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { Tag } from '@shared/types'
import { dropIndex, moveItem, sameOrder } from '@shared/tagOrder'
import { motionMs } from '../lib/motion'
import { useApp } from '../lib/store'

interface Props {
  tags: Tag[]
  /** Where the next tag will be inserted, or null for the end. Shown as a small bar. */
  insertAt: number | null
  onReorder: (ids: string[]) => void
  onRemove: (tag: Tag) => void
  onInsertHere: (index: number) => void
}

interface Ghost {
  id: string
  width: number
  height: number
  x: number
  y: number
  grabX: number
  grabY: number
}

const DRAG_START = 4

/**
 * The tags of one clip as pills. Drag a pill to move it (the others slide aside), or focus it and
 * press Alt+Left or Alt+Right. A small + between two pills adds the next tag at that place.
 */
export function TagList({ tags, insertAt, onReorder, onRemove, onInsertHere }: Props): React.JSX.Element {
  const setCapturing = useApp((s) => s.setCapturing)
  const listRef = useRef<HTMLDivElement>(null)
  const slots = useRef(new Map<string, HTMLElement>())
  const lastPos = useRef(new Map<string, { x: number; y: number }>())
  const ghostRef = useRef<HTMLDivElement>(null)
  const focusAfter = useRef<string | null>(null)
  const [order, setOrder] = useState<string[] | null>(null)
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const press = useRef<{ id: string; pointerId: number; startX: number; startY: number; grabX: number; grabY: number } | null>(null)
  const live = useRef<string[] | null>(null)

  const byId = new Map(tags.map((t) => [t.id, t]))
  const baseIds = tags.map((t) => t.id)
  const ids = order ?? baseIds

  // Slide the pills to their new places when the order changes, and give back the keyboard focus.
  useLayoutEffect(() => {
    const ms = motionMs(160)
    for (const id of ids) {
      const el = slots.current.get(id)
      if (!el) continue
      const now = { x: el.offsetLeft, y: el.offsetTop }
      const before = lastPos.current.get(id)
      if (ms > 0 && before && (before.x !== now.x || before.y !== now.y)) {
        el.animate(
          [{ transform: `translate(${before.x - now.x}px, ${before.y - now.y}px)` }, { transform: 'translate(0, 0)' }],
          { duration: ms, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }
        )
      }
      lastPos.current.set(id, now)
    }
    if (focusAfter.current) {
      slots.current.get(focusAfter.current)?.querySelector<HTMLElement>('.tag-pill')?.focus()
      focusAfter.current = null
    }
  })

  const finish = (apply: boolean): void => {
    const final = live.current
    window.removeEventListener('keydown', onEscape, true)
    live.current = null
    press.current = null
    setGhost(null)
    setOrder(null)
    setCapturing(false)
    if (apply && final && !sameOrder(final, baseIds)) onReorder(final)
  }
  const onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    finish(false)
  }

  const onPointerDown = (e: React.PointerEvent, id: string): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button') || tags.length < 2) return
    const slot = slots.current.get(id)
    if (!slot) return
    const rect = slot.getBoundingClientRect()
    press.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, grabX: e.clientX - rect.left, grabY: e.clientY - rect.top }
    listRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const p = press.current
    const list = listRef.current
    if (!p || !list) return
    if (!live.current) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_START) return
      const slot = slots.current.get(p.id)
      if (!slot) return
      const rect = slot.getBoundingClientRect()
      live.current = [...baseIds]
      setOrder([...baseIds])
      setGhost({ id: p.id, width: rect.width, height: rect.height, x: e.clientX - p.grabX, y: e.clientY - p.grabY, grabX: p.grabX, grabY: p.grabY })
      setCapturing(true)
      window.addEventListener('keydown', onEscape, true)
      return
    }
    if (ghostRef.current) ghostRef.current.style.transform = `translate(${e.clientX - p.grabX}px, ${e.clientY - p.grabY}px) scale(1.06)`
    // Where would the pill go? Compare the pointer with the other pills, in the layout (not mid-slide).
    const box = list.getBoundingClientRect()
    const others = live.current.filter((id) => id !== p.id)
    const boxes = others.map((id) => {
      const el = slots.current.get(id)!
      return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight }
    })
    const to = dropIndex(boxes, { x: e.clientX - box.left, y: e.clientY - box.top })
    const next = [...others.slice(0, to), p.id, ...others.slice(to)]
    if (!sameOrder(next, live.current)) {
      live.current = next
      setOrder(next)
    }
  }

  const onPointerUp = (): void => {
    if (live.current) finish(true)
    else press.current = null
  }

  const onKeyDown = (e: React.KeyboardEvent, index: number): void => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    e.stopPropagation()
    const to = index + (e.key === 'ArrowLeft' ? -1 : 1)
    if (to < 0 || to >= baseIds.length) return
    focusAfter.current = baseIds[index]
    onReorder(moveItem(baseIds, index, to))
  }

  return (
    <>
      <div
        ref={listRef}
        className="tag-chips clip-tags"
        role="list"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
      >
        {ids.map((id, i) => {
          const t = byId.get(id)
          if (!t) return null
          const dragging = ghost?.id === id
          return (
            <Fragment key={id}>
              {insertAt === i && <span className="tag-caret" aria-hidden="true" />}
              <span
                ref={(el) => {
                  if (el) slots.current.set(id, el)
                  else slots.current.delete(id)
                }}
                className={'tag-slot' + (dragging ? ' dragging' : '')}
              >
                <button type="button" className="tag-plus" aria-label={`Add the next tag before ${t.name}`} title="Add a tag here" onClick={() => onInsertHere(i)}>
                  +
                </button>
                <span
                  className="pill tag-pill"
                  role="listitem"
                  tabIndex={0}
                  title={tags.length > 1 ? 'Drag to move, or press Alt and an arrow key' : undefined}
                  style={{ fontSize: 13, padding: '3px 6px 3px 10px' }}
                  onPointerDown={(e) => onPointerDown(e, id)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                >
                  {t.name}
                  <button type="button" aria-label={`Remove tag ${t.name}`} onClick={() => onRemove(t)}>
                    ×
                  </button>
                </span>
                {i === ids.length - 1 && (
                  <button type="button" className="tag-plus after" aria-label="Add the next tag at the end" title="Add a tag here" onClick={() => onInsertHere(ids.length)}>
                    +
                  </button>
                )}
              </span>
            </Fragment>
          )
        })}
        {insertAt === ids.length && ids.length > 0 && <span className="tag-caret" aria-hidden="true" />}
      </div>
      {ghost && byId.get(ghost.id) && (
        <div
          ref={ghostRef}
          className="pill tag-ghost"
          style={{ width: ghost.width, height: ghost.height, fontSize: 13, transform: `translate(${ghost.x}px, ${ghost.y}px) scale(1.06)` }}
        >
          {byId.get(ghost.id)!.name}
        </div>
      )}
    </>
  )
}
