import { FULL_RATING_RANGE, isRatingFiltered, ratingMatches } from '@shared/rating'
import type { Clip, FolderInfo, Settings, Tag, UserData } from '@shared/types'
import { sortClips } from '@shared/sort'
import { type ClipStatus, EMPTY_CLIP_USER, clipStatus } from '@shared/userLogic'
import { fmtDay, fmtMonth, fmtShortDate, startOfDay, startOfMonth, startOfWeek } from './format'

export type DateMode = 'all' | 'day' | 'week' | 'month' | 'year' | 'range'

export interface Filters {
  query: string
  /** Statuses that are shown. */
  statuses: ClipStatus[]
  tagIds: string[]
  /** Clips with any of these tags are hidden. This wins over tagIds. */
  excludeTagIds: string[]
  tagMode: 'any' | 'all'
  minRating: number
  maxRating: number
  /** Unrated clips are shown or hidden by this, whatever the range is. */
  showUnrated: boolean
  dateMode: DateMode
  /** Any time inside the week, month or year that is shown. */
  anchor: number
  /** yyyy-mm-dd, for the custom range. */
  rangeFrom: string
  rangeTo: string
  /** Empty means every folder. */
  folderIds: string[]
}

export const ALL_STATUSES: ClipStatus[] = ['new', 'watched', 'tagged', 'used']

export const DEFAULT_FILTERS: Filters = {
  query: '',
  statuses: ALL_STATUSES,
  tagIds: [],
  excludeTagIds: [],
  tagMode: 'any',
  ...FULL_RATING_RANGE,
  dateMode: 'all',
  anchor: Date.now(),
  rangeFrom: '',
  rangeTo: '',
  folderIds: []
}

export const STATUS_LABEL: Record<ClipStatus, string> = {
  new: 'New',
  watched: 'Watched',
  tagged: 'Tagged',
  used: 'Used'
}

export const STATUS_COLOR: Record<ClipStatus, string> = {
  new: 'var(--s-new)',
  watched: 'var(--s-watched)',
  tagged: 'var(--s-tagged)',
  used: 'var(--s-used)'
}

/** [from, to) of the date filter in ms, or null when there is none. */
export function dateWindow(f: Filters): [number, number] | null {
  const a = new Date(f.anchor)
  switch (f.dateMode) {
    case 'day': {
      const from = startOfDay(f.anchor)
      const to = new Date(from)
      to.setDate(to.getDate() + 1)
      return [from, to.getTime()]
    }
    case 'week': {
      const from = startOfWeek(f.anchor)
      const to = new Date(from)
      to.setDate(to.getDate() + 7)
      return [from, to.getTime()]
    }
    case 'month':
      return [startOfMonth(f.anchor), new Date(a.getFullYear(), a.getMonth() + 1, 1).getTime()]
    case 'year':
      return [new Date(a.getFullYear(), 0, 1).getTime(), new Date(a.getFullYear() + 1, 0, 1).getTime()]
    case 'range': {
      const from = f.rangeFrom ? startOfDay(new Date(f.rangeFrom + 'T00:00:00').getTime()) : -Infinity
      let to = Infinity
      if (f.rangeTo) {
        const d = new Date(f.rangeTo + 'T00:00:00')
        d.setDate(d.getDate() + 1)
        to = d.getTime()
      }
      return [from, to]
    }
    default:
      return null
  }
}

export function dateLabel(f: Filters): string {
  const w = dateWindow(f)
  if (!w) return 'All clips'
  const a = new Date(f.anchor)
  switch (f.dateMode) {
    case 'day':
      return fmtDay(f.anchor)
    case 'week':
      return `Week of ${fmtShortDate(w[0])}`
    case 'month':
      return fmtMonth(f.anchor)
    case 'year':
      return String(a.getFullYear())
    default: {
      if (!Number.isFinite(w[0]) && !Number.isFinite(w[1])) return 'All clips'
      const from = Number.isFinite(w[0]) ? fmtShortDate(w[0]) : 'the start'
      const to = Number.isFinite(w[1]) ? fmtShortDate(w[1] - 1) : 'now'
      return `${from} to ${to}`
    }
  }
}

export function shiftAnchor(mode: DateMode, anchor: number, dir: 1 | -1): number {
  const d = new Date(anchor)
  if (mode === 'day') d.setDate(d.getDate() + dir)
  else if (mode === 'week') d.setDate(d.getDate() + 7 * dir)
  else if (mode === 'month') d.setMonth(d.getMonth() + dir, 1)
  else if (mode === 'year') d.setFullYear(d.getFullYear() + dir, 0, 1)
  return d.getTime()
}

export interface FilterContext {
  user: UserData
  tags: Tag[]
  folders: FolderInfo[]
}

export function isFiltered(f: Filters, hideSorted: boolean): boolean {
  return (
    f.query.trim() !== '' ||
    f.statuses.length !== ALL_STATUSES.length ||
    f.tagIds.length > 0 ||
    f.excludeTagIds.length > 0 ||
    isRatingFiltered(f) ||
    (f.dateMode !== 'all' && !(f.dateMode === 'range' && !f.rangeFrom && !f.rangeTo)) ||
    f.folderIds.length > 0 ||
    hideSorted
  )
}

/** Apply every filter, then sort. */
export function computeVisible(
  clips: Iterable<Clip>,
  ctx: FilterContext,
  f: Filters,
  settings: Pick<Settings, 'hideSorted' | 'sortRules' | 'randomSeed'>
): Clip[] {
  const window = dateWindow(f)
  const tokens = f.query.toLowerCase().split(/\s+/).filter(Boolean)
  const tagName = new Map(ctx.tags.map((t) => [t.id, t.name.toLowerCase()]))
  const statusSet = new Set(f.statuses)
  const folderSet = new Set(f.folderIds)
  const excludeSet = new Set(f.excludeTagIds)
  const out: Clip[] = []

  for (const c of clips) {
    const u = ctx.user.clips[c.key] ?? EMPTY_CLIP_USER
    const status = clipStatus(u)
    if (settings.hideSorted && status !== 'new') continue
    if (!statusSet.has(status)) continue
    if (!ratingMatches(u.rating, f)) continue
    if (window && (c.date < window[0] || c.date >= window[1])) continue
    if (folderSet.size > 0 && !c.files.some((x) => folderSet.has(x.folderId))) continue
    if (excludeSet.size > 0 && u.tags.some((t) => excludeSet.has(t))) continue
    if (f.tagIds.length > 0) {
      const has = (id: string): boolean => u.tags.includes(id)
      if (f.tagMode === 'all' ? !f.tagIds.every(has) : !f.tagIds.some(has)) continue
    }
    if (tokens.length > 0) {
      const hay = [c.name, u.note, ...u.tags.map((t) => tagName.get(t) ?? ''), ...c.hints].join(' ').toLowerCase()
      if (!tokens.every((t) => hay.includes(t))) continue
    }
    out.push(c)
  }
  return sortClips(out, (key) => ctx.user.clips[key]?.rating ?? 0, settings.sortRules, settings.randomSeed)
}

export interface ClipGroup {
  id: string
  label: string
  clips: Clip[]
}

export function groupClips(clips: Clip[], mode: Settings['group']): ClipGroup[] {
  if (mode === 'none') return [{ id: 'all', label: '', clips }]
  const groups: ClipGroup[] = []
  let current: ClipGroup | null = null
  for (const c of clips) {
    let id: string
    let label: string
    if (mode === 'day') {
      id = String(startOfDay(c.date))
      label = fmtDay(c.date)
    } else if (mode === 'week') {
      const s = startOfWeek(c.date)
      id = String(s)
      label = `Week of ${fmtShortDate(s)}`
    } else {
      id = String(startOfMonth(c.date))
      label = fmtMonth(c.date)
    }
    if (!current || current.id !== id) {
      current = { id, label, clips: [] }
      groups.push(current)
    }
    current.clips.push(c)
  }
  return groups
}
