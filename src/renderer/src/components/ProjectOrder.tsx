import {
  ArrowLeft,
  Check,
  Download,
  Film,
  GripVertical,
  LayoutGrid,
  Plus,
  Repeat2,
  Star,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { orderTimes, placeInOrder, reverseOrder, stepInOrder, totalLength } from '@shared/projects'
import type { Clip, Project } from '@shared/types'
import { plural, fmtDay, fmtDuration, fmtSeconds, fmtTime } from '../lib/format'
import { useApp, useSettings } from '../lib/store'
import { SortMenu } from './SortMenu'

const DRAG_TYPE = 'application/x-clipshelf-keys'

/** The two tabs of an open project. */
export function ProjectTabs({ project }: { project: Project }): React.JSX.Element {
  const tab = useApp((s) => s.projectTab)
  const setTab = useApp((s) => s.setProjectTab)
  return (
    <div className="seg" role="tablist" aria-label="Project view">
      <button
        role="tab"
        aria-selected={tab === 'clips'}
        className={tab === 'clips' ? 'on' : ''}
        onClick={() => setTab('clips')}
      >
        Clips ({project.clipKeys.length})
      </button>
      <button
        role="tab"
        aria-selected={tab === 'order'}
        className={tab === 'order' ? 'on' : ''}
        title="Put the clips in the order of your video"
        onClick={() => setTab('order')}
      >
        Order ({project.order.length}/{project.clipKeys.length})
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

/** A clip that has no place yet. Click to open it, drag it into the list, or select it. */
function TodoCard({
  clip,
  todo,
  onRange
}: {
  clip: Clip
  todo: string[]
  onRange: (key: string) => void
}): React.JSX.Element {
  const rating = useApp((s) => s.user.clips[clip.key]?.rating ?? 0)
  const selected = useApp((s) => s.selected.has(clip.key))
  const anySelected = useApp((s) => s.selected.size > 0)
  return (
    <div
      className={'ord-card' + (selected ? ' selected' : '') + (anySelected ? ' has-selection' : '')}
      draggable
      onClick={(e) => {
        const s = useApp.getState()
        if (e.shiftKey) onRange(clip.key)
        else if (e.ctrlKey || e.metaKey || s.selected.size > 0) s.select(clip.key, 'toggle')
        else s.openPlayer(clip.key, todo)
      }}
      onDragStart={(e) => {
        const s = useApp.getState()
        const keys = s.selected.has(clip.key) ? todo.filter((k) => s.selected.has(k)) : [clip.key]
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(keys))
        e.dataTransfer.effectAllowed = 'move'
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
  dropBefore
}: {
  project: Project
  index: number
  clipKey: string
  clip: Clip | undefined
  start: number
  playList: string[]
  dropBefore: boolean
}): React.JSX.Element {
  const rating = useApp((s) => s.user.clips[clipKey]?.rating ?? 0)
  const setOrder = useApp((s) => s.setProjectOrder)
  const openPlayer = useApp((s) => s.openPlayer)
  const unplace = (): void =>
    setOrder(
      project.id,
      project.order.filter((k) => k !== clipKey)
    )
  return (
    <div
      className={'ord-row' + (clip ? '' : ' missing') + (dropBefore ? ' drop-before' : '')}
      data-key={clipKey}
      data-index={index}
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify([clipKey]))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => clip && openPlayer(clipKey, playList)}
      onKeyDown={(e) => {
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          e.stopPropagation()
          setOrder(project.id, stepInOrder(project.order, clipKey, e.key === 'ArrowUp' ? -1 : 1))
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
            <b>
              {fmtDay(clip.date)}, {fmtTime(clip.date)}
            </b>
            <span className="muted">
              {fmtDuration(clip.durationMs)}
              {rating > 0 && (
                <span className="rating-mini" style={{ marginLeft: 10 }}>
                  <Star size={12} fill="currentColor" strokeWidth={0} />
                  {rating}
                </span>
              )}
            </span>
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
      <button
        type="button"
        className="btn icon ghost small"
        aria-label="Take out of the order"
        title="Take out of the order (it stays in the project)"
        onClick={(e) => {
          e.stopPropagation()
          unplace()
        }}
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
  const settings = useSettings()
  const editor = settings.editorName.trim() || 'editor'
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [atText, setAtText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const placed = useMemo(() => new Set(project.order), [project.order])
  // The clips without a place, in the order of the sort menu (and the search box).
  const todo = useMemo(() => visible.filter((c) => !placed.has(c.key)), [visible, placed])
  const todoKeys = useMemo(() => todo.map((c) => c.key), [todo])
  const times = useMemo(() => orderTimes(project.order, clips), [project.order, clips])
  const playList = useMemo(() => project.order.filter((k) => clips.has(k)), [project.order, clips])
  const picked = useMemo(() => todoKeys.filter((k) => selected.has(k)), [todoKeys, selected])
  const unplacedTotal = project.clipKeys.filter((k) => !placed.has(k)).length

  // Make the thumbnails of what is on screen first.
  useEffect(() => {
    const need = project.clipKeys.filter((k) => {
      const c = clips.get(k)
      return c && (!c.hasThumb || !c.durationMs)
    })
    if (need.length > 0) window.api.prioritizeThumbs(need.slice(0, 80))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

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
      placeInOrder(project.order, picked, at),
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

  // Where in the list a drop would land, from the mouse height.
  const indexAt = (y: number): number => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('.ord-row') ?? [])]
    for (const row of rows) {
      const r = row.getBoundingClientRect()
      if (y < r.top + r.height / 2) return Number(row.dataset.index)
    }
    return rows.length
  }
  const hasKeys = (e: React.DragEvent): boolean => e.dataTransfer.types.includes(DRAG_TYPE)

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
              {plural(project.order.length, 'clip')} in order
              {times.totalMs > 0 || times.unknown < project.order.length
                ? ` · ${totalLength(times.totalMs)} long`
                : ''}
              {' · '}
              {unplacedTotal} still to place
            </span>
          </div>
          <div className="lib-tools">
            <button
              className="btn"
              disabled={project.order.length < 2}
              title="Turn the order around, for example after sorting from worst to best"
              onClick={() =>
                setOrder(project.id, reverseOrder(project.order), 'Turned the order around.')
              }
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
                To place <span className="muted">{todo.length}</span>
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
              <div className="ord-grid">
                {todo.map((c) => (
                  <TodoCard key={c.key} clip={c} todo={todoKeys} onRange={range} />
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
                In order <span className="muted">{project.order.length}</span>
              </h2>
            </div>
            <div
              ref={listRef}
              className={'ord-list' + (dropAt === project.order.length ? ' drop-end' : '')}
              onDragOver={(e) => {
                if (!hasKeys(e)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDropAt(indexAt(e.clientY))
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null)
              }}
              onDrop={(e) => {
                if (!hasKeys(e)) return
                e.preventDefault()
                const at = indexAt(e.clientY)
                setDropAt(null)
                try {
                  const keys = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as string[]
                  const own = keys.filter((k) => project.clipKeys.includes(k))
                  if (own.length > 0) {
                    setOrder(project.id, placeInOrder(project.order, own, at))
                    clearSelection()
                  }
                } catch {
                  /* not ours */
                }
              }}
              onDragEnd={() => setDropAt(null)}
            >
              {project.order.length === 0 ? (
                <div className="ord-hint ord-empty">
                  Drag clips here, or select clips on the left and press Enter.
                </div>
              ) : (
                project.order.map((key, i) => (
                  <OrderRow
                    key={key}
                    project={project}
                    index={i}
                    clipKey={key}
                    clip={clips.get(key)}
                    start={times.starts[i]}
                    playList={playList}
                    dropBefore={dropAt === i}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
