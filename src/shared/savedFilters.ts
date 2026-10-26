import { FULL_RATING_RANGE, sanitizeRatingRange } from './rating'
import type { SavedFilters } from './types'

const STATUSES: SavedFilters['statuses'] = ['new', 'watched', 'tagged', 'used']
const DATE_MODES: SavedFilters['dateMode'][] = ['all', 'day', 'week', 'month', 'year', 'range']
const DAY = /^\d{4}-\d{2}-\d{2}$/

export const DEFAULT_SAVED_FILTERS: SavedFilters = {
  statuses: STATUSES,
  tagIds: [],
  excludeTagIds: [],
  tagMode: 'any',
  ...FULL_RATING_RANGE,
  dateMode: 'all',
  anchor: 0,
  rangeFrom: '',
  rangeTo: '',
  folderIds: []
}

/**
 * Turn whatever was saved into filters that are safe to use. Anything unknown or broken falls back to
 * "no filter", tags and folders that no longer exist are dropped, and a week, month or year that
 * was not chosen starts at today instead of at an old date.
 */
export function sanitizeSavedFilters(
  raw: unknown,
  tagIds: Iterable<string>,
  folderIds: Iterable<string>,
  now: number
): SavedFilters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof SavedFilters, unknown>>
  const tags = new Set(tagIds)
  const folders = new Set(folderIds)
  const list = (v: unknown, ok: (s: string) => boolean): string[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ok(x)))] : []

  const statuses = list(r.statuses, (s) => (STATUSES as string[]).includes(s)) as SavedFilters['statuses']
  const dateMode = DATE_MODES.includes(r.dateMode as SavedFilters['dateMode']) ? (r.dateMode as SavedFilters['dateMode']) : 'all'
  const anchor = typeof r.anchor === 'number' && Number.isFinite(r.anchor) && r.anchor > 0 ? r.anchor : now

  // A tag that is both shown and hidden is hidden: hiding always wins.
  const excluded = list(r.excludeTagIds, (id) => tags.has(id))

  return {
    statuses: statuses.length > 0 ? STATUSES.filter((s) => statuses.includes(s)) : STATUSES,
    tagIds: list(r.tagIds, (id) => tags.has(id) && !excluded.includes(id)),
    excludeTagIds: excluded,
    tagMode: r.tagMode === 'all' ? 'all' : 'any',
    ...sanitizeRatingRange(r),
    dateMode,
    anchor: dateMode === 'day' || dateMode === 'week' || dateMode === 'month' || dateMode === 'year' ? anchor : now,
    rangeFrom: typeof r.rangeFrom === 'string' && DAY.test(r.rangeFrom) ? r.rangeFrom : '',
    rangeTo: typeof r.rangeTo === 'string' && DAY.test(r.rangeTo) ? r.rangeTo : '',
    folderIds: list(r.folderIds, (id) => folders.has(id))
  }
}

/** The part of the current filters that is saved. The anchor only matters for week, month and year. */
export function toSavedFilters(f: SavedFilters): SavedFilters {
  const keepsAnchor = f.dateMode === 'day' || f.dateMode === 'week' || f.dateMode === 'month' || f.dateMode === 'year'
  return {
    statuses: [...f.statuses],
    tagIds: [...f.tagIds],
    excludeTagIds: [...f.excludeTagIds],
    tagMode: f.tagMode,
    minRating: f.minRating,
    maxRating: f.maxRating,
    showUnrated: f.showUnrated,
    dateMode: f.dateMode,
    anchor: keepsAnchor ? f.anchor : 0,
    rangeFrom: f.rangeFrom,
    rangeTo: f.rangeTo,
    folderIds: [...f.folderIds]
  }
}
