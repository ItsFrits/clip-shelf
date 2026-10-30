import { DEFAULT_SAVED_FILTERS, sanitizeSavedFilters, toSavedFilters } from './savedFilters'
import { sanitizeSortRules } from './sort'
import type { Preset, PresetParts, SavedFilters, SortRule } from './types'

/** The keys that new presets get, in this order. */
export const PRESET_KEYS = [
  'Alt+1',
  'Alt+2',
  'Alt+3',
  'Alt+4',
  'Alt+5',
  'Alt+6',
  'Alt+7',
  'Alt+8',
  'Alt+9',
  'Alt+0'
]

export const NO_PARTS: PresetParts = { date: false, folders: false, sort: false }

const STATUS_ORDER: SavedFilters['statuses'] = ['new', 'watched', 'tagged', 'used']

/**
 * The filters of a preset in one fixed form, so two sets of filters can be compared. Only what the
 * preset keeps counts: the date and the folders are left out when the preset does not keep them.
 * Order does not matter, and a tag mode only matters with two or more tags.
 */
export function scopedFilters(f: SavedFilters, parts: PresetParts): SavedFilters {
  const s = toSavedFilters(f)
  const dateOn =
    parts.date && !(s.dateMode === 'range' && !s.rangeFrom && !s.rangeTo) && s.dateMode !== 'all'
  return {
    statuses: STATUS_ORDER.filter((x) => s.statuses.includes(x)),
    tagIds: [...s.tagIds].sort(),
    excludeTagIds: [...s.excludeTagIds].sort(),
    tagMode: s.tagIds.length > 1 ? s.tagMode : 'any',
    minRating: s.minRating,
    maxRating: s.maxRating,
    showUnrated: s.showUnrated,
    dateMode: dateOn ? s.dateMode : 'all',
    anchor: dateOn ? s.anchor : 0,
    rangeFrom: dateOn && s.dateMode === 'range' ? s.rangeFrom : '',
    rangeTo: dateOn && s.dateMode === 'range' ? s.rangeTo : '',
    folderIds: parts.folders ? [...s.folderIds].sort() : []
  }
}

/** True when nothing is filtered (the search text is not counted). */
export function isDefaultFilters(f: SavedFilters): boolean {
  return (
    JSON.stringify(scopedFilters(f, { date: true, folders: true, sort: false })) ===
    JSON.stringify(scopedFilters(DEFAULT_SAVED_FILTERS, { date: true, folders: true, sort: false }))
  )
}

const sortKey = (rules: readonly SortRule[]): string =>
  JSON.stringify(rules.map((r) => (r.field === 'random' ? ['random'] : [r.field, r.dir])))

/** Has the view been changed since the preset was saved? Only what the preset keeps is compared. */
export function isPresetModified(
  preset: Preset,
  filters: SavedFilters,
  sortRules: readonly SortRule[]
): boolean {
  if (
    JSON.stringify(scopedFilters(preset.filters, preset.parts)) !==
    JSON.stringify(scopedFilters(filters, preset.parts))
  )
    return true
  return preset.parts.sort && sortKey(preset.sortRules) !== sortKey(sortRules)
}

/** What a preset keeps, taken from the current view. */
export function capturePreset(
  base: Pick<Preset, 'id' | 'name' | 'hotkey'>,
  filters: SavedFilters,
  parts: PresetParts,
  sortRules: readonly SortRule[]
): Preset {
  return {
    ...base,
    filters: scopedFilters(filters, parts),
    parts: { ...parts },
    sortRules: sanitizeSortRules(sortRules),
    hotkey: base.hotkey
  }
}

/**
 * Start or stop keeping the date, the folders or the sort order in a preset. Switching a part on takes
 * it from the current view, switching it off forgets it. The other parts stay as they are.
 */
export function setPresetPart(
  preset: Preset,
  part: keyof PresetParts,
  on: boolean,
  filters: SavedFilters,
  sortRules: readonly SortRule[]
): Preset {
  const parts: PresetParts = { ...preset.parts, [part]: on }
  const f = { ...preset.filters }
  if (on && part === 'date')
    Object.assign(f, {
      dateMode: filters.dateMode,
      anchor: filters.anchor,
      rangeFrom: filters.rangeFrom,
      rangeTo: filters.rangeTo
    })
  if (on && part === 'folders') f.folderIds = [...filters.folderIds]
  return {
    ...preset,
    parts,
    filters: scopedFilters(f, parts),
    sortRules: on && part === 'sort' ? sanitizeSortRules(sortRules) : preset.sortRules
  }
}

/** The filters you get when switching to a preset: the preset's own, and the rest as it was. */
export function filtersWithPreset(preset: Preset, current: SavedFilters): SavedFilters {
  const p = preset.filters
  const date = preset.parts.date
  const folders = preset.parts.folders
  return {
    ...p,
    dateMode: date ? p.dateMode : current.dateMode,
    anchor: date ? p.anchor : current.anchor,
    rangeFrom: date ? p.rangeFrom : current.rangeFrom,
    rangeTo: date ? p.rangeTo : current.rangeTo,
    folderIds: folders ? p.folderIds : current.folderIds
  }
}

/** The first of the preset keys that nothing uses yet, or null. `taken` are keys used elsewhere. */
export function freeKey(presets: readonly Preset[], taken: Iterable<string> = []): string | null {
  const used = new Set([...presets.map((p) => p.hotkey).filter((k): k is string => !!k), ...taken])
  return PRESET_KEYS.find((k) => !used.has(k)) ?? null
}

/** The preset that uses this key, if any. */
export function presetForKey(presets: readonly Preset[], chord: string): Preset | undefined {
  return presets.find((p) => p.hotkey === chord)
}

/** The presets that are there the first time, and after "Add the default presets again". */
export function defaultPresets(makeId: () => string): Preset[] {
  const make = (name: string, statuses: SavedFilters['statuses'], hotkey: string): Preset => ({
    id: makeId(),
    name,
    filters: { ...DEFAULT_SAVED_FILTERS, statuses },
    parts: { ...NO_PARTS },
    sortRules: sanitizeSortRules(undefined),
    hotkey
  })
  return [
    make('Unwatched', ['new'], PRESET_KEYS[0]),
    make('To tag', ['new', 'watched'], PRESET_KEYS[1])
  ]
}

/**
 * Turn whatever was saved into presets that are safe to use. Broken ones are dropped, tags and folders
 * that no longer exist are removed from them, and a key can only belong to one preset.
 */
export function sanitizePresets(
  raw: unknown,
  tagIds: Iterable<string>,
  folderIds: Iterable<string>,
  now: number
): Preset[] {
  if (!Array.isArray(raw)) return []
  const tags = [...tagIds]
  const folders = [...folderIds]
  const ids = new Set<string>()
  const keys = new Set<string>()
  const out: Preset[] = []
  for (const item of raw) {
    const r = (item && typeof item === 'object' ? item : {}) as Partial<
      Record<keyof Preset, unknown>
    >
    const id = typeof r.id === 'string' && r.id ? r.id : ''
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    if (!id || !name || ids.has(id)) continue
    ids.add(id)
    const p = (r.parts && typeof r.parts === 'object' ? r.parts : {}) as Partial<
      Record<keyof PresetParts, unknown>
    >
    const parts: PresetParts = {
      date: p.date === true,
      folders: p.folders === true,
      sort: p.sort === true
    }
    const hotkey = typeof r.hotkey === 'string' && r.hotkey && !keys.has(r.hotkey) ? r.hotkey : null
    if (hotkey) keys.add(hotkey)
    out.push({
      id,
      name,
      filters: scopedFilters(sanitizeSavedFilters(r.filters, tags, folders, now), parts),
      parts,
      sortRules: sanitizeSortRules(r.sortRules),
      hotkey
    })
  }
  return out
}

/** The presets that use one of these tags, to include it or to leave it out. */
export function presetsUsingTags(presets: readonly Preset[], ids: ReadonlySet<string>): Preset[] {
  return presets.filter((p) =>
    [...p.filters.tagIds, ...p.filters.excludeTagIds].some((id) => ids.has(id))
  )
}

/** Remove tags from the presets, or swap them for another tag (when tags are merged). */
export function replaceTagsInPresets(
  presets: readonly Preset[],
  from: ReadonlySet<string>,
  to: string | null
): Preset[] {
  const swap = (ids: string[]): string[] => {
    const out: string[] = []
    for (const id of ids) {
      const next = from.has(id) ? to : id
      if (next && !out.includes(next)) out.push(next)
    }
    return out
  }
  return presets.map((p) => {
    const exclude = swap(p.filters.excludeTagIds)
    return {
      ...p,
      filters: {
        ...p.filters,
        tagIds: swap(p.filters.tagIds).filter((id) => !exclude.includes(id)),
        excludeTagIds: exclude
      }
    }
  })
}

/** Names can repeat, but two presets with the same name are confusing. Gives "Name 2" when it is taken. */
export function uniqueName(name: string, presets: readonly Preset[], exceptId?: string): string {
  const base = name.trim() || 'New preset'
  const taken = new Set(presets.filter((p) => p.id !== exceptId).map((p) => p.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}
