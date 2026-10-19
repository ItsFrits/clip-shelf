import { describe, expect, it } from 'vitest'
import { DEFAULT_SAVED_FILTERS, sanitizeSavedFilters, toSavedFilters } from '../src/shared/savedFilters'

const NOW = new Date(2026, 9, 19).getTime()
const WEEK = new Date(2026, 8, 7).getTime()

describe('sanitizeSavedFilters', () => {
  it('gives no filters when nothing was saved', () => {
    expect(sanitizeSavedFilters(null, [], [], NOW)).toEqual({ ...DEFAULT_SAVED_FILTERS, anchor: NOW })
    expect(sanitizeSavedFilters('nonsense', [], [], NOW)).toEqual({ ...DEFAULT_SAVED_FILTERS, anchor: NOW })
  })

  it('keeps valid filters, including the chosen week', () => {
    const saved = {
      statuses: ['new', 'tagged'],
      tagIds: ['t1', 't2'],
      excludeTagIds: ['t3'],
      tagMode: 'all',
      minRating: 4,
      dateMode: 'week',
      anchor: WEEK,
      rangeFrom: '',
      rangeTo: '',
      folderIds: ['f1']
    }
    expect(sanitizeSavedFilters(saved, ['t1', 't2', 't3'], ['f1'], NOW)).toEqual(saved)
  })

  it('drops tags and folders that no longer exist', () => {
    const out = sanitizeSavedFilters({ tagIds: ['t1', 'gone'], folderIds: ['gone', 'f1'] }, ['t1'], ['f1'], NOW)
    expect(out.tagIds).toEqual(['t1'])
    expect(out.folderIds).toEqual(['f1'])
  })

  it('hiding a tag wins when it is in both lists, and unknown hidden tags are dropped', () => {
    const out = sanitizeSavedFilters({ tagIds: ['t1', 't2'], excludeTagIds: ['t2', 'gone'] }, ['t1', 't2'], [], NOW)
    expect(out.tagIds).toEqual(['t1'])
    expect(out.excludeTagIds).toEqual(['t2'])
  })

  it('opens filters saved before hiding tags existed', () => {
    expect(sanitizeSavedFilters({ tagIds: ['t1'], tagMode: 'any' }, ['t1'], [], NOW).excludeTagIds).toEqual([])
  })

  it('never ends up with no statuses at all', () => {
    expect(sanitizeSavedFilters({ statuses: [] }, [], [], NOW).statuses).toEqual(['new', 'watched', 'tagged', 'used'])
    expect(sanitizeSavedFilters({ statuses: ['bogus'] }, [], [], NOW).statuses).toEqual(['new', 'watched', 'tagged', 'used'])
  })

  it('ignores broken values', () => {
    const out = sanitizeSavedFilters(
      { minRating: 9, dateMode: 'decade', tagMode: 'x', rangeFrom: '2026-1-1', rangeTo: 5, anchor: 'yesterday' },
      [],
      [],
      NOW
    )
    expect(out).toMatchObject({ minRating: 0, dateMode: 'all', tagMode: 'any', rangeFrom: '', rangeTo: '', anchor: NOW })
  })

  it('starts at today when no week, month or year was chosen', () => {
    expect(sanitizeSavedFilters({ dateMode: 'all', anchor: WEEK }, [], [], NOW).anchor).toBe(NOW)
    expect(sanitizeSavedFilters({ dateMode: 'range', anchor: WEEK, rangeFrom: '2026-01-01' }, [], [], NOW).anchor).toBe(NOW)
    expect(sanitizeSavedFilters({ dateMode: 'month', anchor: WEEK }, [], [], NOW).anchor).toBe(WEEK)
  })
})

describe('toSavedFilters', () => {
  it('only keeps the anchor when the date filter needs it', () => {
    const base = { ...DEFAULT_SAVED_FILTERS, anchor: WEEK }
    expect(toSavedFilters(base).anchor).toBe(0)
    expect(toSavedFilters({ ...base, dateMode: 'week' }).anchor).toBe(WEEK)
  })

  it('is the same after a round trip through the sanitizer', () => {
    const f = toSavedFilters({ ...DEFAULT_SAVED_FILTERS, dateMode: 'month', anchor: WEEK, tagIds: ['t1'], minRating: 3 })
    expect(toSavedFilters(sanitizeSavedFilters(f, ['t1'], [], NOW))).toEqual(f)
  })
})
