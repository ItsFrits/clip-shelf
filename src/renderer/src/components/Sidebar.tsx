import { ChevronLeft, ChevronRight, CircleHelp, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { type RangePreset, rangePreset } from '@shared/calendar'
import { pickMaxRating, pickMinRating } from '@shared/rating'
import { cycleTag, describeTagFilter } from '@shared/tagFilter'
import { clipStatus, type ClipStatus, EMPTY_CLIP_USER, sortTags } from '@shared/userLogic'
import {
  ALL_STATUSES,
  type DateMode,
  STATUS_COLOR,
  STATUS_LABEL,
  dateLabel,
  shiftAnchor
} from '../lib/filter'
import { fmtCount } from '../lib/format'
import { useApp, useSettings } from '../lib/store'
import { DatePicker } from './DatePicker'
import { PresetPicker } from './PresetPicker'
import { TagSortControl } from './TagSortControl'

const DATE_MODES: { id: DateMode; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'range', label: 'Range' }
]

function StarRow({
  label,
  value,
  ariaPrefix,
  onPick
}: {
  label: string
  value: number
  ariaPrefix: string
  onPick: (n: number) => void
}): React.JSX.Element {
  return (
    <div className="rating-row">
      <span className="muted">{label}</span>
      <div className="stars" role="radiogroup" aria-label={`${ariaPrefix} stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${ariaPrefix} ${n} ${n === 1 ? 'star' : 'stars'}`}
            onClick={() => onPick(n)}
          >
            <Star size={22} strokeWidth={1.75} fill={n <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </div>
  )
}

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'thisYear', label: 'This year' }
]

export function Sidebar(): React.JSX.Element {
  const clips = useApp((s) => s.clips)
  const user = useApp((s) => s.user)
  const folders = useApp((s) => s.folders)
  const filters = useApp((s) => s.filters)
  const setFilters = useApp((s) => s.setFilters)
  const openSettings = useApp((s) => s.openSettings)
  const settings = useSettings()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [navEl, setNavEl] = useState<HTMLElement | null>(null)

  const counts = useMemo(() => {
    const status: Record<ClipStatus, number> = { new: 0, watched: 0, tagged: 0, used: 0 }
    const tags = new Map<string, number>()
    let unrated = 0
    for (const c of clips.values()) {
      const u = user.clips[c.key] ?? EMPTY_CLIP_USER
      status[clipStatus(u)]++
      if (u.rating <= 0) unrated++
      for (const t of u.tags) tags.set(t, (tags.get(t) ?? 0) + 1)
    }
    return { status, tags, unrated }
  }, [clips, user.clips])

  const total = clips.size
  const reviewed = total - counts.status.new
  const sortedTags = useMemo(
    () =>
      sortTags(user.tags, counts.tags, settings.tagSort).map((t) => ({
        ...t,
        count: counts.tags.get(t.id) ?? 0
      })),
    [user.tags, counts.tags, settings.tagSort]
  )

  const toggleStatus = (s: ClipStatus): void => {
    const on = filters.statuses.includes(s)
    setFilters({
      statuses: on ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s]
    })
  }
  // One click shows a tag, a second click hides it, a third clears it.
  const clickTag = (id: string): void => {
    const next = cycleTag(id, filters.tagIds, filters.excludeTagIds)
    setFilters({ tagIds: next.include, excludeTagIds: next.exclude })
  }
  const tagName = (id: string): string => user.tags.find((t) => t.id === id)?.name ?? '?'
  const tagSentence = describeTagFilter(
    filters.tagIds.map(tagName),
    filters.excludeTagIds.map(tagName),
    filters.tagMode
  )
  const toggleFolder = (id: string): void => {
    setFilters({
      folderIds: filters.folderIds.includes(id)
        ? filters.folderIds.filter((x) => x !== id)
        : [...filters.folderIds, id]
    })
  }
  const setDateMode = (mode: DateMode): void => {
    // Jump to the newest clip when switching from "all" so the first view is not empty.
    let anchor = filters.anchor
    if (filters.dateMode === 'all' && mode !== 'all' && mode !== 'range') {
      let newest = 0
      for (const c of clips.values()) if (c.date > newest) newest = c.date
      if (newest) anchor = newest
    }
    setFilters({ dateMode: mode, anchor })
    // A range has nothing to show until you pick days, so the calendar opens right away.
    setPickerOpen(mode === 'range')
  }

  return (
    <aside className="sidebar">
      <section className="side-sec">
        <div className="side-sec-head">
          <h2 className="h-label">Sorting progress</h2>
          <span className="mono muted" style={{ fontSize: 12 }}>
            {fmtCount(reviewed)} / {fmtCount(total)}
          </span>
        </div>
        <div className="bar">
          <span style={{ width: total ? `${(reviewed / total) * 100}%` : 0 }} />
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {fmtCount(counts.status.new)} clips still new
        </span>
      </section>

      <section className="side-sec">
        <h2 className="h-label">Preset</h2>
        <PresetPicker />
      </section>

      <section className="side-sec">
        <h2 className="h-label">Status</h2>
        {ALL_STATUSES.map((s) => (
          <label key={s} className="check-row">
            <input
              type="checkbox"
              checked={filters.statuses.includes(s)}
              onChange={() => toggleStatus(s)}
            />
            <span className="dot" style={{ background: STATUS_COLOR[s] }} />
            <span className="label">{STATUS_LABEL[s]}</span>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {fmtCount(counts.status[s])}
            </span>
          </label>
        ))}
        <span className="muted" style={{ fontSize: 12 }}>
          “Watched” means played to the end and still without a tag.
        </span>
      </section>

      <section className="side-sec">
        <div className="side-sec-head">
          <h2 className="h-label">Tags</h2>
          <span
            className="help"
            tabIndex={0}
            role="img"
            aria-label="How tag filters work"
            data-tip="Click a tag once to show only clips with it. Click it again to hide clips with it (red). A third click clears it. A hidden tag always wins over a shown one."
          >
            <CircleHelp size={14} />
          </span>
        </div>
        {sortedTags.length > 0 && (
          <div
            className={'seg tag-sort tag-mode' + (filters.tagIds.length > 1 ? '' : ' dim')}
            role="radiogroup"
            aria-label="How several shown tags combine"
            title={
              filters.tagIds.length > 1
                ? undefined
                : 'This only matters when you show two or more tags.'
            }
          >
            <button
              type="button"
              role="radio"
              aria-checked={filters.tagMode === 'any'}
              className={filters.tagMode === 'any' ? 'on' : ''}
              onClick={() => setFilters({ tagMode: 'any' })}
            >
              Match any (OR)
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={filters.tagMode === 'all'}
              className={filters.tagMode === 'all' ? 'on' : ''}
              onClick={() => setFilters({ tagMode: 'all' })}
            >
              Match all (AND)
            </button>
          </div>
        )}
        {sortedTags.length > 1 && <TagSortControl />}
        {sortedTags.length === 0 ? (
          <span className="muted" style={{ fontSize: 13 }}>
            No tags yet. Open a clip and add one.
          </span>
        ) : (
          <div className="tag-chips">
            {sortedTags.map((t) => (
              <button
                key={t.id}
                type="button"
                className={
                  'chip' +
                  (filters.tagIds.includes(t.id) ? ' on' : '') +
                  (filters.excludeTagIds.includes(t.id) ? ' out' : '')
                }
                title={
                  filters.tagIds.includes(t.id)
                    ? 'Showing clips with this tag. Click to hide them instead.'
                    : filters.excludeTagIds.includes(t.id)
                      ? 'Hiding clips with this tag. Click to clear.'
                      : 'Click to show only clips with this tag.'
                }
                onClick={() => clickTag(t.id)}
              >
                {t.name}
                <span className="n">{t.count}</span>
              </button>
            ))}
          </div>
        )}
        {tagSentence && (
          <span className="muted" style={{ fontSize: 12 }}>
            {tagSentence}
          </span>
        )}
      </section>

      <section className="side-sec">
        <h2 className="h-label">Rating</h2>
        <StarRow
          label="From"
          value={filters.minRating}
          ariaPrefix="From"
          onPick={(n) => setFilters(pickMinRating(filters, n))}
        />
        <StarRow
          label="To"
          value={filters.maxRating}
          ariaPrefix="Up to"
          onPick={(n) => setFilters(pickMaxRating(filters, n))}
        />
        <label className="check-row">
          <input
            type="checkbox"
            checked={filters.showUnrated}
            onChange={() => setFilters({ showUnrated: !filters.showUnrated })}
          />
          <span className="label">Show unrated clips</span>
          <span className="mono muted" style={{ fontSize: 12 }}>
            {fmtCount(counts.unrated)}
          </span>
        </label>
      </section>

      <section className="side-sec">
        <h2 className="h-label">Date</h2>
        <div className="seg" style={{ display: 'flex' }}>
          {DATE_MODES.map((m) => (
            <button
              key={m.id}
              style={{ flex: 1, padding: '6px 0', fontSize: 12 }}
              className={filters.dateMode === m.id ? 'on' : ''}
              onClick={() => setDateMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {(filters.dateMode === 'day' ||
          filters.dateMode === 'week' ||
          filters.dateMode === 'month' ||
          filters.dateMode === 'year') && (
          <div className="date-nav" ref={setNavEl}>
            <button
              type="button"
              aria-label="Previous"
              onClick={() =>
                setFilters({ anchor: shiftAnchor(filters.dateMode, filters.anchor, -1) })
              }
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="date-label"
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
              title="Open the calendar"
              onClick={() => setPickerOpen((o) => !o)}
            >
              {dateLabel(filters)}
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() =>
                setFilters({ anchor: shiftAnchor(filters.dateMode, filters.anchor, 1) })
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        {filters.dateMode === 'range' && (
          <>
            <div className="date-nav" ref={setNavEl}>
              <button
                type="button"
                className="date-label"
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                title="Open the calendar"
                onClick={() => setPickerOpen((o) => !o)}
              >
                {filters.rangeFrom || filters.rangeTo ? dateLabel(filters) : 'Pick a range'}
              </button>
            </div>
            <div className="presets">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn small"
                  onClick={() => {
                    const r = rangePreset(p.id, Date.now())
                    setFilters({ rangeFrom: r.from, rangeTo: r.to })
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}
        {pickerOpen && filters.dateMode !== 'all' && navEl && (
          <DatePicker
            key={filters.dateMode}
            anchorEl={navEl}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </section>

      <section className="side-sec">
        <h2 className="h-label">Source folders</h2>
        {folders.length === 0 && (
          <button className="btn small" onClick={() => openSettings('folders')}>
            Add a folder
          </button>
        )}
        {folders.map((f) => {
          const on = filters.folderIds.includes(f.id)
          const color = !f.online ? '#e0b052' : 'var(--s-tagged)'
          return (
            <div
              key={f.id}
              className="folder-row"
              onClick={() => toggleFolder(f.id)}
              title={f.path}
            >
              <input type="checkbox" checked={on} readOnly style={{ pointerEvents: 'none' }} />
              <span className="dot" style={{ background: color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{f.name}</div>
                <div className="path">{f.path}</div>
              </div>
              <span style={{ fontSize: 12, color }}>
                {!f.online ? 'Offline' : f.scanning ? 'Scanning' : 'Live'}
              </span>
            </div>
          )
        })}
        {filters.folderIds.length > 0 && (
          <button className="link-btn" onClick={() => setFilters({ folderIds: [] })}>
            Show all folders
          </button>
        )}
      </section>
    </aside>
  )
}
