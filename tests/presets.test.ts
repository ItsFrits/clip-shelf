import { describe, expect, it } from 'vitest'
import {
  NO_PARTS,
  PRESET_KEYS,
  capturePreset,
  defaultPresets,
  filtersWithPreset,
  freeKey,
  isDefaultFilters,
  isPresetModified,
  presetForKey,
  presetsUsingTags,
  replaceTagsInPresets,
  sanitizePresets,
  scopedFilters,
  setPresetPart,
  uniqueName
} from '../src/shared/presets'
import { DEFAULT_SAVED_FILTERS } from '../src/shared/savedFilters'
import type { Preset, SavedFilters } from '../src/shared/types'

const NOW = Date.UTC(2026, 9, 28)
const WEEK = Date.UTC(2026, 9, 12)
const f = (o: Partial<SavedFilters> = {}): SavedFilters => ({ ...DEFAULT_SAVED_FILTERS, ...o })
const desc = [{ field: 'date' as const, dir: 'desc' as const }]
const asc = [{ field: 'date' as const, dir: 'asc' as const }]
const preset = (filters: SavedFilters, parts = NO_PARTS, extra: Partial<Preset> = {}): Preset =>
  capturePreset({ id: 'p1', name: 'Test', hotkey: null, ...extra }, filters, parts, desc)

describe('isDefaultFilters', () => {
  it('is true when nothing is filtered', () => {
    expect(isDefaultFilters(f())).toBe(true)
    expect(isDefaultFilters(f({ dateMode: 'range' }))).toBe(true)
  })
  it('is false for any filter', () => {
    expect(isDefaultFilters(f({ statuses: ['new'] }))).toBe(false)
    expect(isDefaultFilters(f({ tagIds: ['a'] }))).toBe(false)
    expect(isDefaultFilters(f({ excludeTagIds: ['a'] }))).toBe(false)
    expect(isDefaultFilters(f({ minRating: 3 }))).toBe(false)
    expect(isDefaultFilters(f({ dateMode: 'week', anchor: WEEK }))).toBe(false)
    expect(isDefaultFilters(f({ folderIds: ['x'] }))).toBe(false)
  })
})

describe('isPresetModified', () => {
  it('is not modified right after saving, whatever the order', () => {
    const p = preset(f({ statuses: ['watched', 'new'], tagIds: ['b', 'a'], tagMode: 'all' }))
    expect(isPresetModified(p, f({ statuses: ['new', 'watched'], tagIds: ['a', 'b'], tagMode: 'all' }), desc)).toBe(false)
  })
  it('is modified when a status, tag or rating changes', () => {
    const p = preset(f({ statuses: ['new'], tagIds: ['a'] }))
    expect(isPresetModified(p, f({ statuses: ['new', 'tagged'], tagIds: ['a'] }), desc)).toBe(true)
    expect(isPresetModified(p, f({ statuses: ['new'], tagIds: ['a', 'b'] }), desc)).toBe(true)
    expect(isPresetModified(p, f({ statuses: ['new'], tagIds: ['a'], minRating: 2 }), desc)).toBe(true)
    expect(isPresetModified(p, f({ statuses: ['new'], tagIds: ['a'], showUnrated: false }), desc)).toBe(true)
    expect(isPresetModified(p, f({ statuses: ['new'], tagIds: ['a'], excludeTagIds: ['z'] }), desc)).toBe(true)
  })
  it('ignores the tag mode until there are two tags', () => {
    const p = preset(f({ tagIds: ['a'], tagMode: 'any' }))
    expect(isPresetModified(p, f({ tagIds: ['a'], tagMode: 'all' }), desc)).toBe(false)
    const two = preset(f({ tagIds: ['a', 'b'], tagMode: 'any' }))
    expect(isPresetModified(two, f({ tagIds: ['a', 'b'], tagMode: 'all' }), desc)).toBe(true)
  })
  it('ignores date and folders when the preset does not keep them', () => {
    const p = preset(f({ statuses: ['new'] }))
    expect(isPresetModified(p, f({ statuses: ['new'], dateMode: 'week', anchor: WEEK, folderIds: ['x'] }), desc)).toBe(false)
  })
  it('compares date and folders when the preset keeps them', () => {
    const p = preset(f({ dateMode: 'week', anchor: WEEK, folderIds: ['x'] }), { date: true, folders: true, sort: false })
    expect(isPresetModified(p, f({ dateMode: 'week', anchor: WEEK, folderIds: ['x'] }), desc)).toBe(false)
    expect(isPresetModified(p, f({ dateMode: 'month', anchor: WEEK, folderIds: ['x'] }), desc)).toBe(true)
    expect(isPresetModified(p, f({ dateMode: 'week', anchor: WEEK, folderIds: [] }), desc)).toBe(true)
  })
  it('compares the sort order only when the preset keeps it', () => {
    expect(isPresetModified(preset(f()), f(), asc)).toBe(false)
    const kept = preset(f(), { date: false, folders: false, sort: true })
    expect(isPresetModified(kept, f(), desc)).toBe(false)
    expect(isPresetModified(kept, f(), asc)).toBe(true)
  })
})

describe('filtersWithPreset', () => {
  it('keeps the current date and folders when the preset does not keep them', () => {
    const cur = f({ dateMode: 'week', anchor: WEEK, folderIds: ['x'], statuses: ['used'] })
    const out = filtersWithPreset(preset(f({ statuses: ['new'], tagIds: ['a'] })), cur)
    expect(out).toMatchObject({ statuses: ['new'], tagIds: ['a'], dateMode: 'week', anchor: WEEK, folderIds: ['x'] })
  })
  it('uses the date and folders of the preset when it keeps them', () => {
    const p = preset(f({ dateMode: 'month', anchor: WEEK, folderIds: ['y'] }), { date: true, folders: true, sort: false })
    const out = filtersWithPreset(p, f({ dateMode: 'week', anchor: 5, folderIds: ['x'] }))
    expect(out).toMatchObject({ dateMode: 'month', anchor: WEEK, folderIds: ['y'] })
  })
  it('gives a view that is not modified', () => {
    const p = preset(f({ statuses: ['new', 'watched'], tagIds: ['a'], minRating: 3 }))
    expect(isPresetModified(p, filtersWithPreset(p, f({ dateMode: 'week', anchor: WEEK })), desc)).toBe(false)
  })
})

describe('keys', () => {
  it('gives the first free key', () => {
    expect(freeKey([])).toBe('Alt+1')
    expect(freeKey([preset(f(), NO_PARTS, { hotkey: 'Alt+1' })])).toBe('Alt+2')
    expect(freeKey([], ['Alt+1', 'Alt+2'])).toBe('Alt+3')
  })
  it('ends with Alt+0, then runs out', () => {
    const all = PRESET_KEYS.map((k, i) => preset(f(), NO_PARTS, { id: 'p' + i, hotkey: k }))
    expect(freeKey(all.slice(0, 9))).toBe('Alt+0')
    expect(freeKey(all)).toBeNull()
  })
  it('finds the preset for a key', () => {
    const p = preset(f(), NO_PARTS, { hotkey: 'Alt+4' })
    expect(presetForKey([p], 'Alt+4')).toBe(p)
    expect(presetForKey([p], 'Alt+5')).toBeUndefined()
  })
})

describe('defaultPresets', () => {
  it('are Unwatched and To tag', () => {
    let n = 0
    const d = defaultPresets(() => 'id' + n++)
    expect(d.map((p) => p.name)).toEqual(['Unwatched', 'To tag'])
    expect(d[0].filters.statuses).toEqual(['new'])
    expect(d[1].filters.statuses).toEqual(['new', 'watched'])
    expect(d.map((p) => p.hotkey)).toEqual(['Alt+1', 'Alt+2'])
    expect(d.map((p) => p.id)).toEqual(['id0', 'id1'])
  })
})

describe('sanitizePresets', () => {
  it('returns nothing for rubbish', () => {
    expect(sanitizePresets(null, [], [], NOW)).toEqual([])
    expect(sanitizePresets([null, 3, {}, { id: 'a' }, { name: 'x' }], [], [], NOW)).toEqual([])
  })
  it('drops unknown tags and folders, and double ids and keys', () => {
    const raw = [
      { id: 'a', name: ' One ', filters: { tagIds: ['t1', 'gone'], folderIds: ['gone'] }, parts: { folders: true }, hotkey: 'Alt+1' },
      { id: 'a', name: 'Same id' },
      { id: 'b', name: 'Two', hotkey: 'Alt+1' }
    ]
    const out = sanitizePresets(raw, ['t1'], [], NOW)
    expect(out.map((p) => p.name)).toEqual(['One', 'Two'])
    expect(out[0].filters.tagIds).toEqual(['t1'])
    expect(out[0].filters.folderIds).toEqual([])
    expect(out.map((p) => p.hotkey)).toEqual(['Alt+1', null])
  })
  it('keeps a good preset as it was', () => {
    const p = preset(f({ statuses: ['new'], tagIds: ['a'], minRating: 3 }), { date: false, folders: false, sort: true }, { hotkey: 'Alt+3' })
    expect(sanitizePresets([p], ['a'], [], NOW)).toEqual([p])
  })
})

describe('replaceTagsInPresets', () => {
  const p = preset(f({ tagIds: ['a', 'b'], excludeTagIds: ['c'] }))
  it('removes tags', () => {
    const out = replaceTagsInPresets([p], new Set(['a', 'c']), null)[0]
    expect(out.filters.tagIds).toEqual(['b'])
    expect(out.filters.excludeTagIds).toEqual([])
  })
  it('swaps merged tags for the target, once', () => {
    const out = replaceTagsInPresets([p], new Set(['a', 'b']), 't')[0]
    expect(out.filters.tagIds).toEqual(['t'])
  })
})

describe('presetsUsingTags', () => {
  it('finds presets that include or exclude the tag', () => {
    const a = preset(f({ tagIds: ['a'] }), NO_PARTS, { id: 'a' })
    const b = preset(f({ excludeTagIds: ['a'] }), NO_PARTS, { id: 'b' })
    const c = preset(f({ tagIds: ['z'] }), NO_PARTS, { id: 'c' })
    expect(presetsUsingTags([a, b, c], new Set(['a'])).map((p) => p.id)).toEqual(['a', 'b'])
    expect(presetsUsingTags([a, b, c], new Set(['q']))).toEqual([])
  })
})

describe('setPresetPart', () => {
  const view = f({ statuses: ['used'], dateMode: 'week', anchor: WEEK, folderIds: ['x', 'y'] })
  const rules = [{ field: 'rating' as const, dir: 'desc' as const }]
  const base = preset(f({ statuses: ['new'] }))

  it('takes the date from the view and leaves the other filters alone', () => {
    const out = setPresetPart(base, 'date', true, view, rules)
    expect(out.parts).toEqual({ date: true, folders: false, sort: false })
    expect(out.filters.dateMode).toBe('week')
    expect(out.filters.anchor).toBe(WEEK)
    expect(out.filters.statuses).toEqual(['new'])
    expect(out.filters.folderIds).toEqual([])
    expect(out.sortRules).toEqual(base.sortRules)
  })
  it('takes the folders from the view', () => {
    const out = setPresetPart(base, 'folders', true, view, rules)
    expect(out.filters.folderIds).toEqual(['x', 'y'])
    expect(out.filters.dateMode).toBe('all')
  })
  it('takes the sort order from the view', () => {
    const out = setPresetPart(base, 'sort', true, view, rules)
    expect(out.parts.sort).toBe(true)
    expect(out.sortRules).toEqual(rules)
    expect(out.filters).toEqual(base.filters)
  })
  it('forgets a part when it is switched off', () => {
    const on = setPresetPart(setPresetPart(base, 'date', true, view, rules), 'folders', true, view, rules)
    const off = setPresetPart(on, 'date', false, view, rules)
    expect(off.parts).toEqual({ date: false, folders: true, sort: false })
    expect(off.filters.dateMode).toBe('all')
    expect(off.filters.folderIds).toEqual(['x', 'y'])
  })
  it('does not change a preset that is not modified by the view afterwards', () => {
    const on = setPresetPart(base, 'date', true, view, rules)
    expect(isPresetModified(on, view, rules)).toBe(true)
    expect(isPresetModified(on, { ...f({ statuses: ['new'] }), dateMode: 'week', anchor: WEEK }, rules)).toBe(false)
  })
})

describe('uniqueName', () => {
  it('numbers a name that is taken', () => {
    const ps = [preset(f(), NO_PARTS, { name: 'Best' })]
    expect(uniqueName('Other', ps)).toBe('Other')
    expect(uniqueName('best', ps)).toBe('best 2')
    expect(uniqueName('  ', ps)).toBe('New preset')
    expect(uniqueName('Best', ps, 'p1')).toBe('Best')
  })
})

describe('scopedFilters', () => {
  it('treats an empty range as no date', () => {
    expect(scopedFilters(f({ dateMode: 'range' }), { date: true, folders: false, sort: false }).dateMode).toBe('all')
  })
})
