import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Film,
  GripVertical,
  LayoutGrid,
  Plus,
  Repeat2,
  Star,
  X
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { orderTimes, placeInOrder, reverseOrder, stepInOrder, totalLength } from '@shared/projects'
import type { Clip, Project } from '@shared/types'
import { fmtDay, fmtDuration, fmtSeconds, fmtTime, plural } from '../lib/format'
import { motionMs } from '../lib/motion'
import { useApp, useSettings } from '../lib/store'
import { SortMenu } from './SortMenu'
import { TagPills } from './TagPills'

/** How far the pointer has to move before a press becomes a drag. */
const DRAG_START = 4
/** The height of the gap that opens in the list for clips that are dragged in. */
const GAP_H = 64
/** The edge of the list where dragging starts to scroll it, and the fastest scroll per frame. */
const EDGE = 56
const SCROLL_MAX = 16

/** Where the two lists were scrolled to, so coming back from the player lands in the same place. */
let savedScroll: { project: string; grid: number; list: number } | null = null
function remember(project: string, part: 'grid' | 'list', top: number): void {
  const prev = savedScroll?.project === project ? savedScroll : { project, grid: 0, list: 0 }
  savedScroll = { ...prev, [part]: top }
}

/** Scroll a list so the element sits in the middle, but only when it is not fully in view yet. */
function reveal(box: HTMLElement, el: HTMLElement): void {
  const b = box.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  if (r.top >= b.top && r.bottom <= b.bottom) return
  box.scrollTop += r.top - b.top - (box.clientHeight - r.height) / 2
}

/** The two tabs of an open project. */
export function ProjectTabs({ project }: { project: Project }): React.JSX.Element {
  const tab = useApp((s) => s.projectTab)
  const setTab = useApp((s) => s.setProjectTab)
  const clips = useApp((s) => s.clips)
  // Only count the clips that are there, so the numbers match what you see in the lists.
  const total = project.clipKeys.filter((k) => clips.has(k)).length
  const placed = project.order.filter((k) => clips.has(k)).length
  return (
    <div className="seg" role="tablist" aria-label="Project view">
      <button
        role="tab"
        aria-selected={tab === 'clips'}
        className={tab === 'clips' ? 'on' : ''}
        onClick={() => setTab('clips')}
      >
        Clips ({total})
      </button>
      <button
        role="tab"
        aria-selected={tab === 'order'}
        className={tab === 'order' ? 'on' : ''}
        title="Put the clips in the order of your video"
        onClick={() => setTab('order')}
      >
        Order ({placed}/{total})
      </button>
    </div>
  )
}

function Thumb({ clip }: { clip: Clip }): React.JSX.Element {
  return clip.hasThumb ? (
    <img src={`clip://thumb/${clip.key}`} alt="" draggable={false} loading="lazy" />
  ) : (
    <div className="placeholder">
      <Film size={22} strokeWidth={1.5} />
    </div>
  )
}

/** What a press on a clip can turn into: a drag of one or more clips. */
interface Press {
  source: 'row' | 'todo'
  keys: string[]
  pointerId: number
  startX: number
  startY: number
  /** Where inside the dragged thing the pointer holds it. */
  grabX: number
  grabY: number
  width: number
  started: boolean
}

type PressStart = (
  e: React.PointerEvent,
  source: 'row' | 'todo',
  keys: string[],
  el: HTMLElement
) => void

/** A clip that has no place yet. Click to open it, drag it into the list, or select it. */
function TodoCard({
  clip,
  todo,
  onRange,
  onPress,
  wasDrag
}: {
  clip: Clip
  todo: string[]
  onRange: (key: string) => void
  onPress: PressStart
  wasDrag: () => boolean
}): React.JSX.Element {
  const rating = useApp((s) => s.user.clips[clip.key]?.rating ?? 0)
  const selected = useApp((s) => s.selected.has(clip.key))
  const anySelected = useApp((s) => s.selected.size > 0)
  return (
    <div
      data-key={clip.key}
      className={'ord-card' + (selected ? ' selected' : '') + (anySelected ? ' has-selection' : '')}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
        const s = useApp.getState()
        // A selected clip takes the rest of the selection along.
        const keys = s.selected.has(clip.key) ? todo.filter((k) => s.selected.has(k)) : [clip.key]
        onPress(e, 'todo', keys, e.currentTarget)
      }}
      onClick={(e) => {
        if (wasDrag()) return
        const s = useApp.getState()
        if (e.shiftKey) onRange(clip.key)
        else if (e.ctrlKey || e.metaKey || s.selected.size > 0) s.select(clip.key, 'toggle')
        else s.openPlayer(clip.key, todo)
      }}
    >
      <div className="thumb">
        <Thumb clip={clip} />
        <span className="badge tr mono">{fmtDuration(clip.durationMs)}</span>
        <button
          type="button"
          className="check"
          aria-label={selected ? 'Deselect clip' : 'Select clip'}
          onClick={(e) => {
            e.stopPropagation()
            // Let go of the button, so Enter places the selection instead of clicking it again.
            e.currentTarget.blur()
            useApp.getState().select(clip.key, 'toggle')
          }}
        >
          <Check size={14} strokeWidth={3} />
        </button>
      </div>
      <div className="ord-card-meta">
        <span>
          {fmtDay(clip.date)}, {fmtTime(clip.date)}
        </span>
        {rating > 0 && (
          <span className="rating-mini">
            <Star size={13} fill="currentColor" strokeWidth={0} />
            {rating}
          </span>
        )}
      </div>
    </div>
  )
}

/** One place in the order. */
function OrderRow({
  project,
  index,
  clipKey,
  clip,
  start,
  playList,
  held,
  setEl,
  onPress,
  wasDrag
}: {
  project: Project
  index: number
  clipKey: string
  clip: Clip | undefined
  start: number
  playList: string[]
  held: boolean
  setEl: (key: string, el: HTMLElement | null) => void
  onPress: PressStart
  wasDrag: () => boolean
}): React.JSX.Element {
  const user = useApp((s) => s.user.clips[clipKey])
  const tagById = useApp((s) => s.tagById)
  const setOrder = useApp((s) => s.setProjectOrder)
  const openPlayer = useApp((s) => s.openPlayer)
  const rating = user?.rating ?? 0
  const tags = (user?.tags ?? []).map((id) => tagById.get(id)?.name).filter((n): n is string => !!n)
  const note = (user?.note ?? '').trim().replace(/\s+/g, ' ')
  const last = index === project.order.length - 1
  const step = (dir: 1 | -1): void => setOrder(project.id, stepInOrder(project.order, clipKey, dir))
  const removeFromProject = useApp((s) => s.removeFromProject)
  // A clip that is not in the library has nothing left to place, so the cross takes it out of the project.
  const unplace = (): void =>
    clip
      ? setOrder(
          project.id,
          project.order.filter((k) => k !== clipKey)
        )
      : removeFromProject(project.id, [clipKey])
  return (
    <div
      ref={(el) => setEl(clipKey, el)}
      data-key={clipKey}
      className={'ord-row' + (clip ? '' : ' missing') + (held ? ' held' : '')}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
        onPress(e, 'row', [clipKey], e.currentTarget)
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        if (!wasDrag() && clip) openPlayer(clipKey, playList)
      }}
      onKeyDown={(e) => {
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          e.stopPropagation()
          step(e.key === 'ArrowUp' ? -1 : 1)
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          e.stopPropagation()
          unplace()
        } else if (e.key === 'Enter' && clip) {
          e.preventDefault()
          e.stopPropagation()
          openPlayer(clipKey, playList)
        }
      }}
    >
      <span
        className="ord-grip"
        aria-hidden
        title="Drag to move. Alt+Up and Alt+Down also move it."
      >
        <GripVertical size={16} />
      </span>
      <span className="ord-num">{index + 1}</span>
      <div className="ord-thumb">{clip ? <Thumb clip={clip} /> : <Film size={18} />}</div>
      <div className="ord-info">
        {clip ? (
          <>
            <span className="ord-line">
              <b>
                {fmtDay(clip.date)}, {fmtTime(clip.date)}
              </b>
              <span className="muted">{fmtDuration(clip.durationMs)}</span>
              {rating > 0 && (
                <span className="rating-mini">
                  <Star size={12} fill="currentColor" strokeWidth={0} />
                  {rating}
                </span>
              )}
            </span>
            {tags.length > 0 && <TagPills tags={tags} className="ord-tags" />}
            {note && <span className="ord-note">{note}</span>}
          </>
        ) : (
          <>
            <b>Clip not in your library right now</b>
            <span className="muted">Its place is kept (drive offline?)</span>
          </>
        )}
      </div>
      <span className="ord-start mono" title="Where this clip starts in the video">
        {fmtSeconds(start / 1000)}
      </span>
      <div className="ord-arrows">
        <button
          type="button"
          className="ord-arrow"
          aria-label="Move up"
          title="Move up"
          disabled={index === 0}
          onClick={() => step(-1)}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          className="ord-arrow"
          aria-label="Move down"
          title="Move down"
          disabled={last}
          onClick={() => step(1)}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      <button
        type="button"
        className="btn icon ghost small"
        aria-label="Take out of the order"
        title={
          clip
            ? 'Take out of the order (it stays in the project)'
            : 'Remove this missing clip from the project'
        }
        onClick={unplace}
      >
        <X size={14} />
      </button>
    </div>
  )
}

/** The Order tab of a project: clips without a place on the left, the order on the right. */
export function ProjectOrder({ project }: { project: Project }): React.JSX.Element {
  const clips = useApp((s) => s.clips)
  const visible = useApp((s) => s.visible)
  const selected = useApp((s) => s.selected)
  const clearSelection = useApp((s) => s.clearSelection)
  const leaveProject = useApp((s) => s.leaveProject)
  const setOrder = useApp((s) => s.setProjectOrder)
  const startDrag = useApp((s) => s.startDrag)
  const setCapturing = useApp((s) => s.setCapturing)
  const settings = useSettings()
  const editor = settings.editorName.trim() || 'editor'
  const [atText, setAtText] = useState('')

  // Dragging: what is held, the order a row would get, and where clips from the left would go.
  const [held, setHeld] = useState<{
    source: 'row' | 'todo'
    keys: string[]
    /** Where the ghost starts, and how it sits in the hand. The pointer moves it after that. */
    x: number
    y: number
    width: number
  } | null>(null)
  const [liveOrder, setLiveOrder] = useState<string[] | null>(null)
  const [gapAt, setGapAt] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const rowEls = useRef(new Map<string, HTMLElement>())
  const lastTop = useRef(new Map<string, number>())
  const press = useRef<Press | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const live = useRef<{ order: string[] | null; gap: number | null }>({ order: null, gap: null })
  const dragged = useRef(false)
  // The listeners on the window must stay the same functions while the page re-renders, so they call
  // the latest version of the handlers.
  const impl = useRef<{
    onMove: (e: PointerEvent) => void
    onUp: (e: PointerEvent) => void
    onCancel: () => void
    onEscape: (e: KeyboardEvent) => void
  } | null>(null)
  const [listeners] = useState(() => ({
    move: (e: PointerEvent) => impl.current?.onMove(e),
    up: (e: PointerEvent) => impl.current?.onUp(e),
    cancel: () => impl.current?.onCancel(),
    escape: (e: KeyboardEvent) => impl.current?.onEscape(e)
  }))
  const base = project.order
  const shown = liveOrder ?? base

  const placed = useMemo(() => new Set(base), [base])
  // The clips without a place, in the order of the sort menu (and the search box).
  const todo = useMemo(() => visible.filter((c) => !placed.has(c.key)), [visible, placed])
  const todoKeys = useMemo(() => todo.map((c) => c.key), [todo])
  const times = useMemo(() => orderTimes(shown, clips), [shown, clips])
  const playList = useMemo(() => base.filter((k) => clips.has(k)), [base, clips])
  const picked = useMemo(() => todoKeys.filter((k) => selected.has(k)), [todoKeys, selected])
  const unplacedTotal = project.clipKeys.filter((k) => !placed.has(k)).length

  // Coming back from the player: both lists go back to where they were, and the clip you were just
  // watching is brought into view when it is not.
  useLayoutEffect(() => {
    const focus = useApp.getState().focusKey
    useApp.setState({ focusKey: null })
    const grid = gridRef.current
    const list = listRef.current
    // Only when you come back from the player. Opening a project fresh starts at the top.
    const mine = focus && savedScroll?.project === project.id ? savedScroll : null
    if (mine) {
      if (grid) grid.scrollTop = mine.grid
      if (list) list.scrollTop = mine.list
    }
    if (focus) {
      const find = (box: HTMLElement | null): HTMLElement | null =>
        box
          ? ([...box.querySelectorAll<HTMLElement>('[data-key]')].find(
              (el) => el.dataset.key === focus
            ) ?? null)
          : null
      const inList = find(list)
      const inGrid = find(grid)
      if (list && inList) reveal(list, inList)
      else if (grid && inGrid) reveal(grid, inGrid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Make the thumbnails of what is on screen first.
  useEffect(() => {
    const need = project.clipKeys.filter((k) => {
      const c = clips.get(k)
      return c && (!c.hasThumb || !c.durationMs)
    })
    if (need.length > 0) window.api.prioritizeThumbs(need.slice(0, 80))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  // Rows slide to their new place whenever the list changes: a drag, an arrow, Reverse, a drop.
  const listed = useRef(false)
  useLayoutEffect(() => {
    const ms = motionMs(180)
    for (const [key, el] of rowEls.current) {
      const top = el.offsetTop
      const before = lastTop.current.get(key)
      if (ms > 0 && before === undefined && listed.current) {
        // A clip that just got a place pops in.
        el.animate(
          [
            { opacity: 0, transform: 'scale(0.94)' },
            { opacity: 1, transform: 'scale(1)' }
          ],
          { duration: ms, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }
        )
      } else if (ms > 0 && before !== undefined && before !== top) {
        el.animate(
          [{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }],
          { duration: ms, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }
        )
      }
      lastTop.current.set(key, top)
    }
    for (const key of lastTop.current.keys())
      if (!rowEls.current.has(key)) lastTop.current.delete(key)
    listed.current = true
  })

  const setRowEl = (key: string, el: HTMLElement | null): void => {
    if (el) rowEls.current.set(key, el)
    else rowEls.current.delete(key)
  }

  const range = (key: string): void => {
    const s = useApp.getState()
    const a = s.anchorKey ? todoKeys.indexOf(s.anchorKey) : -1
    const b = todoKeys.indexOf(key)
    if (a < 0 || b < 0) return s.select(key, 'only')
    const [from, to] = a < b ? [a, b] : [b, a]
    useApp.setState({ selected: new Set(todoKeys.slice(from, to + 1)) })
  }

  const placeSelected = (at?: number): void => {
    if (picked.length === 0) return
    setOrder(
      project.id,
      placeInOrder(base, picked, at),
      picked.length > 1 ? `Placed ${plural(picked.length, 'clip')}.` : undefined
    )
    clearSelection()
    setAtText('')
  }

  // Enter puts the selected clips at the end of the order.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' || picked.length === 0) return
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(t.tagName)) return
      if (useApp.getState().confirm) return
      e.preventDefault()
      placeSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---- Dragging with the pointer. Everything that happens while dragging is worked out from the
  // layout of the list (not from mid-slide positions), like the tags and the sort rules.
  const heldKeys = held?.keys ?? null

  /** Where in the list (counting the clips that stay in it) the pointer is. */
  const indexAtPointer = (skip: ReadonlySet<string>): number => {
    const list = listRef.current
    if (!list) return 0
    const y = pointer.current.y - list.getBoundingClientRect().top + list.scrollTop
    let n = 0
    for (const key of live.current.order ?? base) {
      if (skip.has(key)) continue
      const el = rowEls.current.get(key)
      if (el && el.offsetTop + el.offsetHeight / 2 < y) n++
    }
    return n
  }

  const updateTarget = (): void => {
    const p = press.current
    const list = listRef.current
    if (!p || !p.started || !list) return
    if (p.source === 'row') {
      const key = p.keys[0]
      const others = (live.current.order ?? base).filter((k) => k !== key)
      const to = indexAtPointer(new Set([key]))
      const next = [...others.slice(0, to), key, ...others.slice(to)]
      const cur = live.current.order ?? base
      if (next.some((k, i) => k !== cur[i])) {
        live.current.order = next
        setLiveOrder(next)
      }
    } else {
      const box = list.getBoundingClientRect()
      const inside =
        pointer.current.x >= box.left &&
        pointer.current.x <= box.right &&
        pointer.current.y >= box.top &&
        pointer.current.y <= box.bottom
      const to = inside ? indexAtPointer(new Set()) : null
      if (to !== live.current.gap) {
        live.current.gap = to
        setGapAt(to)
      }
    }
  }

  const endDrag = (apply: boolean): void => {
    const p = press.current
    window.removeEventListener('pointermove', listeners.move)
    window.removeEventListener('pointerup', listeners.up)
    window.removeEventListener('pointercancel', listeners.cancel)
    window.removeEventListener('keydown', listeners.escape, true)
    press.current = null
    document.body.classList.remove('ord-dragging')
    if (p?.started) {
      setCapturing(false)
      // The click that follows the release belongs to the drag.
      dragged.current = true
      setTimeout(() => (dragged.current = false), 0)
      const { order, gap } = live.current
      if (apply && p.source === 'row' && order) setOrder(project.id, order)
      if (apply && p.source === 'todo' && gap !== null) {
        setOrder(
          project.id,
          placeInOrder(base, p.keys, gap),
          p.keys.length > 1 ? `Placed ${plural(p.keys.length, 'clip')}.` : undefined
        )
        clearSelection()
      }
    }
    live.current = { order: null, gap: null }
    setHeld(null)
    setLiveOrder(null)
    setGapAt(null)
  }

  const onMove = (e: PointerEvent): void => {
    const p = press.current
    if (!p || e.pointerId !== p.pointerId) return
    pointer.current = { x: e.clientX, y: e.clientY }
    if (!p.started) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_START) return
      p.started = true
      live.current = { order: null, gap: null }
      setHeld({
        source: p.source,
        keys: p.keys,
        x: e.clientX - p.grabX,
        y: e.clientY - p.grabY,
        width: Math.min(p.width, 280)
      })
      setCapturing(true)
      document.body.classList.add('ord-dragging')
      window.addEventListener('keydown', listeners.escape, true)
    }
    if (ghostRef.current)
      ghostRef.current.style.transform = `translate(${e.clientX - p.grabX}px, ${e.clientY - p.grabY}px) scale(1.04)`
    updateTarget()
  }
  const onUp = (e: PointerEvent): void => {
    const p = press.current
    if (!p || e.pointerId !== p.pointerId) return
    endDrag(true)
  }
  const onCancel = (): void => endDrag(false)
  const onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    endDrag(false)
  }

  useLayoutEffect(() => {
    impl.current = { onMove, onUp, onCancel, onEscape }
  })

  const startPress: PressStart = (e, source, keys, el) => {
    if (press.current) return
    const r = el.getBoundingClientRect()
    pointer.current = { x: e.clientX, y: e.clientY }
    press.current = {
      source,
      keys,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - r.left,
      grabY: e.clientY - r.top,
      width: r.width,
      started: false
    }
    window.addEventListener('pointermove', listeners.move)
    window.addEventListener('pointerup', listeners.up)
    window.addEventListener('pointercancel', listeners.cancel)
  }

  // Near the top or bottom edge of the list, dragging scrolls it.
  useEffect(() => {
    if (!held) return
    let frame = 0
    const tick = (): void => {
      const list = listRef.current
      if (list) {
        const box = list.getBoundingClientRect()
        const { x, y } = pointer.current
        if (x >= box.left - 40 && x <= box.right + 40) {
          let speed = 0
          if (y < box.top + EDGE) speed = -Math.min(1, (box.top + EDGE - y) / EDGE) * SCROLL_MAX
          else if (y > box.bottom - EDGE)
            speed = Math.min(1, (y - (box.bottom - EDGE)) / EDGE) * SCROLL_MAX
          if (speed !== 0) {
            list.scrollTop += speed
            updateTarget()
          }
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held])

  // A drag stops when the tab goes away.
  useEffect(
    () => () => {
      if (press.current) endDrag(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const wasDrag = (): boolean => dragged.current
  const firstHeld = heldKeys ? clips.get(heldKeys[0]) : undefined

  // The list with the gap for clips that are dragged in from the left.
  const rows: ({ gap: true } | { gap?: false; key: string; index: number })[] = []
  shown.forEach((key, index) => {
    if (gapAt === index) rows.push({ gap: true })
    rows.push({ key, index })
  })
  if (gapAt !== null && gapAt >= shown.length) rows.push({ gap: true })

  return (
    <div className="lib">
      <div className="lib-head">
        <div className="lib-title-row">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="btn icon"
                aria-label="Back to all projects"
                title="Back to all projects (Esc)"
                onClick={leaveProject}
              >
                <ArrowLeft size={18} />
              </button>
              <h1 className="lib-title">{project.name}</h1>
              <ProjectTabs project={project} />
            </div>
            <span className="muted">
              {plural(base.length, 'clip')} in order
              {times.totalMs > 0 || times.unknown < base.length
                ? ` · ${totalLength(times.totalMs)} long`
                : ''}
              {' · '}
              {unplacedTotal} still to place
            </span>
          </div>
          <div className="lib-tools">
            <button
              className="btn"
              disabled={base.length < 2}
              title="Turn the order around, for example after sorting from worst to best"
              onClick={() => setOrder(project.id, reverseOrder(base), 'Turned the order around.')}
            >
              <Repeat2 size={16} />
              Reverse
            </button>
            <button
              className="btn primary grab"
              draggable
              disabled={playList.length === 0}
              title="Drag the clips in the order into your video editor"
              onDragStart={(e) => {
                e.preventDefault()
                startDrag(playList)
              }}
            >
              <Download size={18} strokeWidth={2} />
              Drag order to {editor}
            </button>
          </div>
        </div>
      </div>

      {project.clipKeys.length === 0 ? (
        <div className="empty">
          <LayoutGrid size={48} strokeWidth={1.25} />
          <h2>This project is empty</h2>
          <span>Add clips from your library first, then put them in order here.</span>
          <button className="btn lg" onClick={() => useApp.setState({ projectId: null })}>
            Browse the library
          </button>
        </div>
      ) : (
        <div className="ord-cols">
          <section className="ord-col ord-todo" aria-label="Clips to place">
            <div className="ord-col-head">
              <h2>
                To place <span className="muted">({todo.length})</span>
              </h2>
              <SortMenu />
            </div>
            {todo.length === 0 ? (
              <div className="ord-hint">
                {unplacedTotal === 0
                  ? 'Every clip in the project has a place.'
                  : 'No clips match your search.'}
              </div>
            ) : (
              <div
                ref={gridRef}
                className="ord-grid"
                onScroll={(e) => remember(project.id, 'grid', e.currentTarget.scrollTop)}
              >
                {todo.map((c) => (
                  <TodoCard
                    key={c.key}
                    clip={c}
                    todo={todoKeys}
                    onRange={range}
                    onPress={startPress}
                    wasDrag={wasDrag}
                  />
                ))}
              </div>
            )}
            {picked.length > 0 && (
              <div className="ord-pick">
                <span style={{ fontWeight: 600 }}>{plural(picked.length, 'clip')} selected</span>
                <div className="ord-pick-actions">
                  <button className="btn primary small" onClick={() => placeSelected()}>
                    <Plus size={14} />
                    Place at end
                  </button>
                  <form
                    className="ord-at"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const n = Number.parseInt(atText, 10)
                      if (Number.isFinite(n) && n >= 1) placeSelected(n - 1)
                    }}
                  >
                    <input
                      className="field"
                      inputMode="numeric"
                      placeholder="#"
                      aria-label="Place at this number"
                      value={atText}
                      maxLength={4}
                      onChange={(e) => setAtText(e.target.value.replace(/\D/g, ''))}
                    />
                    <button className="btn small" type="submit" disabled={!atText}>
                      Place at #
                    </button>
                  </form>
                  <button className="btn ghost small" onClick={clearSelection}>
                    Clear
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="ord-col ord-order" aria-label="Order">
            <div className="ord-col-head">
              <h2>
                In order <span className="muted">({base.length})</span>
              </h2>
            </div>
            <div
              ref={listRef}
              className="ord-list"
              onScroll={(e) => remember(project.id, 'list', e.currentTarget.scrollTop)}
            >
              {shown.length === 0 && gapAt === null && (
                <div className="ord-hint ord-empty">
                  Drag clips here, or select clips on the left and press Enter.
                </div>
              )}
              {rows.map((r) =>
                r.gap ? (
                  <div key="gap" className="ord-gap" style={{ height: GAP_H }}>
                    {heldKeys && heldKeys.length > 1 ? `${heldKeys.length} clips` : 'Drop here'}
                  </div>
                ) : (
                  <OrderRow
                    key={r.key}
                    project={project}
                    index={r.index}
                    clipKey={r.key}
                    clip={clips.get(r.key)}
                    start={times.starts[r.index]}
                    playList={playList}
                    held={held?.source === 'row' && held.keys[0] === r.key}
                    setEl={setRowEl}
                    onPress={startPress}
                    wasDrag={wasDrag}
                  />
                )
              )}
            </div>
          </section>
        </div>
      )}
      {held && (
        <div
          ref={ghostRef}
          className="ord-ghost"
          style={{
            width: held.width,
            transform: `translate(${held.x}px, ${held.y}px) scale(1.04)`
          }}
        >
          <div className="ord-thumb">
            {firstHeld ? <Thumb clip={firstHeld} /> : <Film size={18} />}
          </div>
          <span className="ord-ghost-text">
            {firstHeld ? `${fmtDay(firstHeld.date)}, ${fmtTime(firstHeld.date)}` : 'Clip'}
          </span>
          {held.keys.length > 1 && <span className="ord-ghost-count">{held.keys.length}</span>}
        </div>
      )}
    </div>
  )
}
