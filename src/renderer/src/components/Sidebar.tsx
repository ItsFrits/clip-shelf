import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { useMemo } from 'react'
import { clipStatus, type ClipStatus, EMPTY_CLIP_USER } from '@shared/userLogic'
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

const DATE_MODES: { id: DateMode; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'range', label: 'Range' }
]

export function Sidebar(): React.JSX.Element {
  const clips = useApp((s) => s.clips)
  const user = useApp((s) => s.user)
  const folders = useApp((s) => s.folders)
  const filters = useApp((s) => s.filters)
  const setFilters = useApp((s) => s.setFilters)
  const openSettings = useApp((s) => s.openSettings)
  const updateSettings = useApp((s) => s.updateSettings)
  const settings = useSettings()

  const counts = useMemo(() => {
    const status: Record<ClipStatus, number> = { new: 0, watched: 0, tagged: 0, used: 0 }
    const tags = new Map<string, number>()
    for (const c of clips.values()) {
      const u = user.clips[c.key] ?? EMPTY_CLIP_USER
      status[clipStatus(u)]++
      for (const t of u.tags) tags.set(t, (tags.get(t) ?? 0) + 1)
    }
    return { status, tags }
  }, [clips, user.clips])

  const total = clips.size
  const reviewed = total - counts.status.new
  const sortedTags = useMemo(
    () =>
      [...user.tags]
        .map((t) => ({ ...t, count: counts.tags.get(t.id) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    [user.tags, counts.tags]
  )

  const toggleStatus = (s: ClipStatus): void => {
    const on = filters.statuses.includes(s)
    setFilters({ statuses: on ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s] })
  }
  const toggleTag = (id: string): void => {
    setFilters({
      tagIds: filters.tagIds.includes(id) ? filters.tagIds.filter((x) => x !== id) : [...filters.tagIds, id]
    })
  }
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
        <h2 className="h-label">Status</h2>
        <div className="toggle-row">
          <span style={{ fontSize: 13, lineHeight: 1.3 }}>Hide watched &amp; tagged clips</span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.hideSorted}
            aria-label="Hide watched and tagged clips"
            className={'switch' + (settings.hideSorted ? ' on' : '')}
            onClick={() => updateSettings({ hideSorted: !settings.hideSorted })}
          />
        </div>
        {ALL_STATUSES.map((s) => (
          <label key={s} className="check-row">
            <input type="checkbox" checked={filters.statuses.includes(s)} onChange={() => toggleStatus(s)} />
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
          <div className="seg" style={{ fontSize: 12 }}>
            <button className={filters.tagMode === 'any' ? 'on' : ''} style={{ padding: '3px 10px' }} onClick={() => setFilters({ tagMode: 'any' })}>
              Any
            </button>
            <button className={filters.tagMode === 'all' ? 'on' : ''} style={{ padding: '3px 10px' }} onClick={() => setFilters({ tagMode: 'all' })}>
              All
            </button>
          </div>
        </div>
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
                className={'chip' + (filters.tagIds.includes(t.id) ? ' on' : '')}
                onClick={() => toggleTag(t.id)}
              >
                {t.name}
                <span className="n">{t.count}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="side-sec">
        <h2 className="h-label">Minimum rating</h2>
        <div className="stars" role="radiogroup" aria-label="Minimum rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`At least ${n} stars`}
              onClick={() => setFilters({ minRating: filters.minRating === n ? 0 : n })}
            >
              <Star size={22} strokeWidth={1.75} fill={n <= filters.minRating ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
      </section>

      <section className="side-sec">
        <h2 className="h-label">Date</h2>
        <div className="seg" style={{ display: 'flex' }}>
          {DATE_MODES.map((m) => (
            <button
              key={m.id}
              style={{ flex: 1, padding: '6px 0' }}
              className={filters.dateMode === m.id ? 'on' : ''}
              onClick={() => setDateMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {(filters.dateMode === 'week' || filters.dateMode === 'month' || filters.dateMode === 'year') && (
          <div className="date-nav">
            <button type="button" aria-label="Previous" onClick={() => setFilters({ anchor: shiftAnchor(filters.dateMode, filters.anchor, -1) })}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontWeight: 600, textAlign: 'center' }}>{dateLabel(filters)}</span>
            <button type="button" aria-label="Next" onClick={() => setFilters({ anchor: shiftAnchor(filters.dateMode, filters.anchor, 1) })}>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        {filters.dateMode === 'range' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="muted" style={{ fontSize: 12 }}>
              From
              <input type="date" className="field" style={{ width: '100%', marginTop: 4 }} value={filters.rangeFrom} onChange={(e) => setFilters({ rangeFrom: e.target.value })} />
            </label>
            <label className="muted" style={{ fontSize: 12 }}>
              To
              <input type="date" className="field" style={{ width: '100%', marginTop: 4 }} value={filters.rangeTo} onChange={(e) => setFilters({ rangeTo: e.target.value })} />
            </label>
          </div>
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
            <div key={f.id} className="folder-row" onClick={() => toggleFolder(f.id)} title={f.path}>
              <input type="checkbox" checked={on} readOnly style={{ pointerEvents: 'none' }} />
              <span className="dot" style={{ background: color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{f.name}</div>
                <div className="path">{f.path}</div>
              </div>
              <span style={{ fontSize: 12, color }}>{!f.online ? 'Offline' : f.scanning ? 'Scanning' : 'Live'}</span>
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
