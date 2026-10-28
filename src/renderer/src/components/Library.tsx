import { useVirtualizer } from '@tanstack/react-virtual'
import { Film, FolderPlus, Grid3x3 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FULL_RATING_RANGE, ratingChipLabel } from '@shared/rating'
import type { Clip } from '@shared/types'
import { STATUS_LABEL, dateLabel, groupClips, isFiltered } from '../lib/filter'
import { plural } from '../lib/format'
import { useApp, useSettings } from '../lib/store'
import { canGroup } from '@shared/sort'
import { clipStatus, EMPTY_CLIP_USER } from '@shared/userLogic'
import { ClipCard } from './ClipCard'
import { SelectionBar } from './SelectionBar'
import { SortMenu } from './SortMenu'

const GAP = 14
const HEADER_H = 52
const CARD_CHROME = 104
const MIN_CARD_WIDTH = [150, 180, 208, 260, 340]

/** Where the library was scrolled to when it was last on screen (the player and settings replace it). */
let savedScroll = 0

type Row =
  | { kind: 'header'; id: string; label: string; count: number }
  | { kind: 'cards'; id: string; clips: Clip[] }

export function Library(): React.JSX.Element {
  const visible = useApp((s) => s.visible)
  const clips = useApp((s) => s.clips)
  const user = useApp((s) => s.user)
  const folders = useApp((s) => s.folders)
  const filters = useApp((s) => s.filters)
  const setFilters = useApp((s) => s.setFilters)
  const resetFilters = useApp((s) => s.resetFilters)
  const updateSettings = useApp((s) => s.updateSettings)
  const openSettings = useApp((s) => s.openSettings)
  const tagById = useApp((s) => s.tagById)
  const selectionActive = useApp((s) => s.selected.size > 0)
  const settings = useSettings()

  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  const [ready, setReady] = useState(false)
  // Where to scroll back to: the clip that was just open, else the old scroll position.
  const restore = useRef<{ key: string | null; offset: number; done: boolean }>({
    key: useApp.getState().focusKey,
    offset: savedScroll,
    done: false
  })
  const firstFilterRun = useRef(true)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    setReady(true)
    useApp.setState({ focusKey: null })
    return () => ro.disconnect()
  }, [])

  const minW = MIN_CARD_WIDTH[Math.min(4, Math.max(0, settings.thumbSize - 1))]
  const cols = Math.max(1, Math.floor((width + GAP) / (minW + GAP)))
  const cardW = (width - GAP * (cols - 1)) / cols
  const cardH = Math.ceil(((cardW - 14) * 9) / 16) + CARD_CHROME

  // Day, week and month groups only make sense when the clips are in date order.
  const groupable = canGroup(settings.sortRules)
  const group = groupable ? settings.group : 'none'
  const groups = useMemo(() => groupClips(visible, group), [visible, group])
  const rows = useMemo(() => {
    const out: Row[] = []
    for (const g of groups) {
      if (g.label) out.push({ kind: 'header', id: 'h' + g.id, label: g.label, count: g.clips.length })
      for (let i = 0; i < g.clips.length; i += cols) {
        out.push({ kind: 'cards', id: `${g.id}:${i}`, clips: g.clips.slice(i, i + cols) })
      }
    }
    return out
  }, [groups, cols])

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].kind === 'header' ? HEADER_H : cardH + GAP),
    getItemKey: (i) => rows[i].id,
    overscan: 4
  })
  useEffect(() => {
    virt.measure()
  }, [cardH, rows, virt])

  // Back to the top when the filters change.
  const filterSig = JSON.stringify([filters, settings.sortRules, settings.randomSeed, group])
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false
      return
    }
    scrollRef.current?.scrollTo({ top: 0 })
  }, [filterSig])

  // Coming back from the player or settings: scroll to the clip you were just watching.
  useEffect(() => {
    const r = restore.current
    if (!ready || r.done || rows.length === 0) return
    r.done = true
    const target = r.key ? rows.findIndex((row) => row.kind === 'cards' && row.clips.some((c) => c.key === r.key)) : -1
    if (target >= 0) virt.scrollToIndex(target, { align: 'center' })
    else if (r.offset > 0) scrollRef.current?.scrollTo({ top: r.offset })
  }, [ready, rows, virt])

  // Tell the main process which thumbnails are on screen so it makes those first.
  const items = virt.getVirtualItems()
  const wanted = useMemo(() => {
    const keys: string[] = []
    for (const it of items) {
      const row = rows[it.index]
      if (row?.kind === 'cards') for (const c of row.clips) if (!c.hasThumb || !c.durationMs) keys.push(c.key)
    }
    return keys
  }, [items, rows])
  const wantedSig = wanted.join(',')
  useEffect(() => {
    if (!wantedSig) return
    const t = setTimeout(() => window.api.prioritizeThumbs(wantedSig.split(',')), 80)
    return () => clearTimeout(t)
  }, [wantedSig])

  const counts = useMemo(() => {
    let fresh = 0
    for (const c of visible) if (clipStatus(user.clips[c.key] ?? EMPTY_CLIP_USER) === 'new') fresh++
    return { fresh, reviewed: visible.length - fresh }
  }, [visible, user.clips])

  const anyOnline = folders.some((f) => f.online)
  const filtered = isFiltered(filters)
  const chips: { id: string; label: string; remove: () => void }[] = []
  if (filters.statuses.length !== 4) {
    chips.push({
      id: 'status',
      label: 'Status: ' + (filters.statuses.map((s) => STATUS_LABEL[s]).join(', ') || 'none'),
      remove: () => setFilters({ statuses: ['new', 'watched', 'tagged', 'used'] })
    })
  }
  for (const id of filters.tagIds) {
    chips.push({
      id: 'tag' + id,
      label: 'Tag: ' + (tagById.get(id)?.name ?? '?'),
      remove: () => setFilters({ tagIds: filters.tagIds.filter((t) => t !== id) })
    })
  }
  for (const id of filters.excludeTagIds) {
    chips.push({
      id: 'notag' + id,
      label: 'Not: ' + (tagById.get(id)?.name ?? '?'),
      remove: () => setFilters({ excludeTagIds: filters.excludeTagIds.filter((t) => t !== id) })
    })
  }
  const ratingLabel = ratingChipLabel(filters)
  if (ratingLabel) chips.push({ id: 'rating', label: ratingLabel, remove: () => setFilters({ ...FULL_RATING_RANGE }) })
  if (filters.dateMode !== 'all' && (filters.dateMode !== 'range' || filters.rangeFrom || filters.rangeTo)) chips.push({ id: 'date', label: dateLabel(filters), remove: () => setFilters({ dateMode: 'all' }) })
  for (const id of filters.folderIds) {
    chips.push({
      id: 'folder' + id,
      label: 'Folder: ' + (folders.find((f) => f.id === id)?.name ?? '?'),
      remove: () => setFilters({ folderIds: filters.folderIds.filter((f) => f !== id) })
    })
  }

  const noFolders = folders.length === 0
  const loading = !noFolders && clips.size === 0
  const noMatch = clips.size > 0 && visible.length === 0

  return (
    <div className="lib">
      <div className="lib-head">
        <div className="lib-title-row">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 className="lib-title">{dateLabel(filters)}</h1>
              {anyOnline && (
                <span className="live" title="New clips in your folders show up automatically">
                  <span className="dot" />
                  Live
                </span>
              )}
            </div>
            <span className="muted">
              {plural(visible.length, 'clip')} in this view · {counts.fresh.toLocaleString('en-US')} still new ·{' '}
              {counts.reviewed.toLocaleString('en-US')} reviewed
            </span>
          </div>
          <div className="lib-tools">
            <span className="muted" style={{ fontSize: 13 }}>
              Group by
            </span>
            <div
              className={'seg' + (groupable ? '' : ' disabled')}
              role="group"
              aria-label="Group by"
              title={groupable ? undefined : 'Groups follow the date. Put Date first in the sort menu to use them.'}
            >
              {(['day', 'week', 'month', 'none'] as const).map((g) => (
                <button
                  key={g}
                  className={group === g ? 'on' : ''}
                  disabled={!groupable}
                  onClick={() => updateSettings({ group: g })}
                >
                  {g === 'none' ? 'No groups' : g[0].toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
            <SortMenu />
            <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <Grid3x3 size={14} />
              Size
              <input
                type="range"
                min={1}
                max={5}
                value={settings.thumbSize}
                aria-label="Thumbnail size"
                style={{ width: 96 }}
                onChange={(e) => updateSettings({ thumbSize: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>
        {(chips.length > 0 || filtered) && (
          <div className="active-filters">
            {chips.map((c) => (
              <span key={c.id} className="fchip">
                {c.label}
                <button type="button" aria-label={`Remove filter ${c.label}`} onClick={c.remove}>
                  ×
                </button>
              </span>
            ))}
            {filtered && (
              <button className="btn ghost small" onClick={resetFilters}>
                Reset all
              </button>
            )}
          </div>
        )}
      </div>

      {noFolders && (
        <div className="empty">
          <Film size={48} strokeWidth={1.25} />
          <h2>Add your first clips folder</h2>
          <span>Clip Shelf watches the folders you choose. Your files are never changed or moved.</span>
          <button className="btn primary lg" onClick={() => openSettings('folders')}>
            <FolderPlus size={18} />
            Add a folder
          </button>
        </div>
      )}
      {loading && (
        <div className="empty">
          <Film size={48} strokeWidth={1.25} />
          <h2>Looking for clips…</h2>
          <span>Big folders can take a minute the first time.</span>
        </div>
      )}
      {noMatch && (
        <div className="empty">
          <h2>No clips match</h2>
          <span>Nothing in your library fits the current filters.</span>
          <button className="btn lg" onClick={resetFilters}>
            Reset all filters
          </button>
        </div>
      )}

      <div
        className="lib-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          savedScroll = e.currentTarget.scrollTop
        }}
        style={{ display: noFolders || loading || noMatch ? 'none' : undefined }}>
        <div ref={innerRef} className={'grid-inner' + (selectionActive ? ' has-selection' : '')} style={{ height: virt.getTotalSize() + (selectionActive ? 90 : 0) }}>
          {items.map((it) => {
            const row = rows[it.index]
            if (!row) return null
            return (
              <div
                key={row.id}
                className="row-abs"
                style={{ transform: `translateY(${it.start}px)`, height: row.kind === 'header' ? HEADER_H : cardH }}
              >
                {row.kind === 'header' ? (
                  <div className="group-head">
                    <h2>{row.label}</h2>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {plural(row.count, 'clip')}
                    </span>
                  </div>
                ) : (
                  <div className="cards-row" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, height: '100%' }}>
                    {row.clips.map((c) => (
                      <ClipCard key={c.key} clip={c} showDate={group !== 'day'} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <SelectionBar />
    </div>
  )
}
