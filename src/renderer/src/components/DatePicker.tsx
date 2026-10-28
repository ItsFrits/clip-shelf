import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DAY_STATUSES,
  addDays,
  dayKey,
  dayStatusMap,
  describeDay,
  monthGrid,
  orderRange,
  parseDayKey,
  shiftMonth,
  startOfDay,
  weekStart,
  yearsWithClips
} from '@shared/calendar'
import { EMPTY_CLIP_USER, clipStatus } from '@shared/userLogic'
import { STATUS_COLOR, computeVisible } from '../lib/filter'
import { fmtDay } from '../lib/format'
import { useApp, useSettings } from '../lib/store'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WIDTH = 288

type View = 'days' | 'months' | 'years'

/**
 * The calendar that opens from the date filter. The dots under a day show the status of the clips on
 * that day, for the clips that pass all the other filters.
 */
export function DatePicker({ anchorEl, onClose }: { anchorEl: HTMLElement; onClose: () => void }): React.JSX.Element {
  const clips = useApp((s) => s.clips)
  const user = useApp((s) => s.user)
  const folders = useApp((s) => s.folders)
  const filters = useApp((s) => s.filters)
  const setFilters = useApp((s) => s.setFilters)
  const settings = useSettings()
  const mode = filters.dateMode

  const [view, setView] = useState<View>(mode === 'month' ? 'months' : mode === 'year' ? 'years' : 'days')
  // A range that is still empty starts at the month of your newest clip, not at an old anchor.
  const startTs = ((): number => {
    if (mode !== 'range') return filters.anchor
    const from = parseDayKey(filters.rangeFrom)
    if (from) return from
    let newest = 0
    for (const c of clips.values()) if (c.date > newest) newest = c.date
    return newest || filters.anchor
  })()
  const [cursor, setCursor] = useState(startOfDay(startTs))
  const [pending, setPending] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)

  const todayTs = startOfDay(Date.now())
  const todayKey = dayKey(todayTs)

  // Clips that pass every filter except the date: these decide which days get dots.
  const counts = useMemo(() => {
    const visible = computeVisible(
      clips.values(),
      { user, tags: user.tags, folders },
      { ...filters, dateMode: 'all' },
      settings
    )
    return dayStatusMap(visible.map((c) => ({ date: c.date, status: clipStatus(user.clips[c.key] ?? EMPTY_CLIP_USER) })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, user, folders, filters.query, filters.statuses, filters.tagIds, filters.excludeTagIds, filters.tagMode, filters.minRating, filters.maxRating, filters.showUnrated, filters.folderIds])

  const years = useMemo(() => {
    const list = yearsWithClips([...clips.values()].map((c) => c.date))
    const current = new Date(filters.anchor).getFullYear()
    return list.includes(current) ? list : [...list, current].sort((a, b) => b - a)
  }, [clips, filters.anchor])
  const newest = useMemo(() => {
    let n = 0
    for (const c of clips.values()) if (c.date > n) n = c.date
    return n
  }, [clips])

  // Place the calendar next to the sidebar, so the sidebar's edge never cuts it off.
  useLayoutEffect(() => {
    const place = (): void => {
      const a = anchorEl.getBoundingClientRect()
      const side = anchorEl.closest('.sidebar')?.getBoundingClientRect()
      const h = ref.current?.offsetHeight ?? 360
      const left = Math.min((side?.right ?? a.right) + 8, window.innerWidth - WIDTH - 8)
      const top = Math.max(8, Math.min(a.top, window.innerHeight - h - 8))
      setPos({ left, top })
    }
    place()
    // The calendar follows its button when the sidebar scrolls.
    const sidebar = anchorEl.closest('.sidebar')
    window.addEventListener('resize', place)
    sidebar?.addEventListener('scroll', place)
    return () => {
      window.removeEventListener('resize', place)
      sidebar?.removeEventListener('scroll', place)
    }
  }, [anchorEl, view])

  // Close on a click outside and on Escape.
  useEffect(() => {
    const down = (e: MouseEvent): void => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchorEl.contains(t)) return
      onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
      anchorEl.querySelector<HTMLElement>('button')?.focus()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key, true)
    }
  }, [anchorEl, onClose])

  // Keep keyboard focus on the day the cursor is on.
  useEffect(() => {
    if (!refocus.current) return
    ref.current?.querySelector<HTMLElement>(`[data-key="${dayKey(cursor)}"]`)?.focus()
  }, [cursor, view])
  // When the calendar opens, start on the selected day. It can only take focus once it is visible.
  const focused = useRef(false)
  useEffect(() => {
    if (!pos || focused.current) return
    focused.current = true
    ref.current?.querySelector<HTMLElement>(`[data-key="${dayKey(cursor)}"]`)?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos])

  const cursorDate = new Date(cursor)
  const year = cursorDate.getFullYear()
  const month = cursorDate.getMonth()
  const grid = useMemo(() => monthGrid(year, month), [year, month])

  // The days that are selected, as a [from, to] pair of day keys.
  const selection = ((): { from: string; to: string } | null => {
    if (mode === 'day') return { from: dayKey(filters.anchor), to: dayKey(filters.anchor) }
    if (mode === 'week') return { from: dayKey(weekStart(filters.anchor)), to: dayKey(addDays(weekStart(filters.anchor), 6)) }
    if (mode === 'range') {
      if (pending) return orderRange(pending, hover ?? pending)
      const from = filters.rangeFrom || filters.rangeTo
      const to = filters.rangeTo || filters.rangeFrom
      return from ? { from, to } : null
    }
    return null
  })()

  const apply = (patch: Parameters<typeof setFilters>[0]): void => {
    setFilters(patch)
    onClose()
  }
  const pickDay = (ts: number): void => {
    if (mode === 'day') return apply({ dateMode: 'day', anchor: ts })
    if (mode === 'week') return apply({ dateMode: 'week', anchor: ts })
    if (mode === 'range') {
      const key = dayKey(ts)
      if (!pending) {
        setPending(key)
        return
      }
      const r = orderRange(pending, key)
      return apply({ dateMode: 'range', rangeFrom: r.from, rangeTo: r.to })
    }
  }
  const pickMonth = (m: number): void => {
    const ts = new Date(year, m, 1).getTime()
    if (mode === 'month') return apply({ dateMode: 'month', anchor: ts })
    setCursor(ts)
    setView('days')
  }
  const pickYear = (y: number): void => {
    const ts = new Date(y, mode === 'year' ? 0 : month, 1).getTime()
    if (mode === 'year') return apply({ dateMode: 'year', anchor: ts })
    setCursor(ts)
    setView('months')
  }
  // Today and Latest. For a range they only move the calendar, because one day is not a range.
  const jump = (ts: number): void => {
    const day = startOfDay(ts)
    if (mode === 'range') {
      setCursor(day)
      setView('days')
      return
    }
    apply({ dateMode: mode, anchor: day })
  }
  const clear = (): void => apply({ dateMode: 'all', rangeFrom: '', rangeTo: '' })

  const onGridKey = (e: React.KeyboardEvent): void => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    let next: number | null = null
    if (e.key in steps) next = addDays(cursor, steps[e.key])
    else if (e.key === 'PageUp') next = shiftMonth(cursor, e.shiftKey ? -12 : -1)
    else if (e.key === 'PageDown') next = shiftMonth(cursor, e.shiftKey ? 12 : 1)
    else if (e.key === 'Home') next = weekStart(cursor)
    else if (e.key === 'End') next = addDays(weekStart(cursor), 6)
    if (next === null) return
    e.preventDefault()
    refocus.current = true
    setCursor(next)
  }

  const head =
    view === 'days' ? (
      <div className="cal-head">
        <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => setCursor(shiftMonth(cursor, -1))}>
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="cal-title" onClick={() => setView('months')}>
          {MONTHS_LONG[month]} {year}
        </button>
        <button type="button" className="cal-nav" aria-label="Next month" onClick={() => setCursor(shiftMonth(cursor, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>
    ) : view === 'months' ? (
      <div className="cal-head">
        <button type="button" className="cal-nav" aria-label="Previous year" onClick={() => setCursor(new Date(year - 1, month, 1).getTime())}>
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="cal-title" onClick={() => setView('years')}>
          {year}
        </button>
        <button type="button" className="cal-nav" aria-label="Next year" onClick={() => setCursor(new Date(year + 1, month, 1).getTime())}>
          <ChevronRight size={16} />
        </button>
      </div>
    ) : (
      <div className="cal-head">
        <span className="cal-title static">Pick a year</span>
      </div>
    )

  const selMonth = mode === 'month' ? new Date(filters.anchor) : null
  const selYear = mode === 'year' ? new Date(filters.anchor).getFullYear() : null

  return createPortal(
    <div
      ref={ref}
      className="cal"
      role="dialog"
      aria-label="Choose a date"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: WIDTH, visibility: pos ? 'visible' : 'hidden' }}
    >
      {head}

      {view === 'days' && (
        <div className="cal-grid" role="grid" onKeyDown={onGridKey} onMouseLeave={() => setHover(null)}>
          <div className="cal-row cal-weekdays" role="row">
            {WEEKDAYS.map((w) => (
              <span key={w} role="columnheader">
                {w}
              </span>
            ))}
          </div>
          {[0, 1, 2, 3, 4, 5].map((r) => {
            const row = grid.slice(r * 7, r * 7 + 7)
            return (
              <div key={r} className={'cal-row' + (mode === 'week' && hover && hover >= row[0].key && hover <= row[6].key ? ' hover-week' : '')} role="row">
                {row.map((g) => {
                  const c = counts.get(g.key)
                  const isEdge = selection && (g.key === selection.from || g.key === selection.to)
                  const inside = selection && g.key > selection.from && g.key < selection.to
                  const cls =
                    'cal-day' +
                    (g.inMonth ? '' : ' cal-out') +
                    (c ? '' : ' cal-empty') +
                    (g.key === todayKey ? ' cal-today' : '') +
                    (isEdge ? ' cal-sel' : '') +
                    (inside ? ' cal-mid' : '') +
                    (selection && g.key === selection.from ? ' cal-first' : '') +
                    (selection && g.key === selection.to ? ' cal-last' : '')
                  const label = `${fmtDay(g.ts)}. ${describeDay(c)}`
                  return (
                    <button
                      key={g.key}
                      type="button"
                      role="gridcell"
                      data-key={g.key}
                      className={cls}
                      tabIndex={g.key === dayKey(cursor) ? 0 : -1}
                      title={label}
                      aria-label={label}
                      aria-selected={!!isEdge}
                      onMouseEnter={() => setHover(g.key)}
                      onClick={() => pickDay(g.ts)}
                    >
                      <span className="n">{g.day}</span>
                      <span className="dots">
                        {c &&
                          DAY_STATUSES.filter((s) => c[s] > 0).map((s) => (
                            <i key={s} style={{ background: STATUS_COLOR[s] }} />
                          ))}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {view === 'months' && (
        <div className="cal-cells">
          {MONTHS_SHORT.map((m, i) => (
            <button
              key={m}
              type="button"
              className={'cal-cell' + (selMonth && selMonth.getMonth() === i && selMonth.getFullYear() === year ? ' cal-sel' : '')}
              onClick={() => pickMonth(i)}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {view === 'years' && (
        <div className="cal-cells">
          {years.map((y) => (
            <button key={y} type="button" className={'cal-cell' + (selYear === y ? ' cal-sel' : '')} onClick={() => pickYear(y)}>
              {y}
            </button>
          ))}
        </div>
      )}

      <div className="cal-foot">
        {mode === 'range' && pending ? (
          <span className="muted">Now pick the last day</span>
        ) : (
          <>
            <button type="button" className="btn small" onClick={() => jump(Date.now())}>
              Today
            </button>
            <button type="button" className="btn small" disabled={!newest} title="The day of your newest clip" onClick={() => jump(newest)}>
              Latest
            </button>
            <button type="button" className="btn ghost small" style={{ marginLeft: 'auto' }} onClick={clear}>
              Clear
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
