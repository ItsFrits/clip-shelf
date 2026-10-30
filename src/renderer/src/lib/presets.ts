import { useMemo } from 'react'
import { isRatingFiltered, ratingChipLabel } from '@shared/rating'
import { isDefaultFilters, isPresetModified, scopedFilters } from '@shared/presets'
import { sanitizeSavedFilters, toSavedFilters } from '@shared/savedFilters'
import { sortButtonLabel } from '@shared/sort'
import type { Preset } from '@shared/types'
import { STATUS_LABEL, DEFAULT_FILTERS, dateLabel } from './filter'
import { type Filters } from './filter'
import { useApp, useSettings } from './store'

/** A preset with the tags and folders that no longer exist taken out, so it can be compared and applied. */
export function resolvePreset(p: Preset, tagIds: string[], folderIds: string[]): Preset {
  return { ...p, filters: scopedFilters(sanitizeSavedFilters(p.filters, tagIds, folderIds, 0), p.parts) }
}

/** The filters of a preset as short labels for a list, for example ["New", "Flip reset", "3 to 5 stars"]. */
export function presetSummary(p: Preset, tagName: (id: string) => string | undefined, folderName: (id: string) => string | undefined): string[] {
  const f = p.filters
  const out: string[] = []
  if (f.statuses.length !== 4) out.push(...f.statuses.map((s) => STATUS_LABEL[s]))
  for (const id of f.tagIds) out.push(tagName(id) ?? '?')
  for (const id of f.excludeTagIds) out.push('not ' + (tagName(id) ?? '?'))
  const rating = ratingChipLabel(f)
  if (rating && isRatingFiltered(f)) out.push(rating)
  if (p.parts.date && f.dateMode !== 'all') out.push(dateLabel({ ...DEFAULT_FILTERS, ...f } as Filters))
  if (p.parts.folders) out.push(...f.folderIds.map((id) => folderName(id) ?? '?'))
  if (p.parts.sort) out.push(sortButtonLabel(p.sortRules))
  return out
}

export type PresetKind = 'all' | 'custom' | 'preset'

export interface PresetState {
  presets: Preset[]
  /** The active preset, with tags and folders that are gone taken out. */
  active: Preset | null
  /** The active preset as it is saved. */
  activeSaved: Preset | null
  modified: boolean
  kind: PresetKind
}

/** Which preset is in use, and whether the filters have been changed since. */
export function usePresetState(): PresetState {
  const settings = useSettings()
  const filters = useApp((s) => s.filters)
  const tags = useApp((s) => s.user.tags)
  const folders = useApp((s) => s.user.folders)
  return useMemo(() => {
    const presets = settings.presets ?? []
    const activeSaved = presets.find((p) => p.id === settings.activePresetId) ?? null
    const active = activeSaved ? resolvePreset(activeSaved, tags.map((t) => t.id), folders.map((f) => f.id)) : null
    const current = toSavedFilters(filters)
    if (!active) return { presets, active, activeSaved, modified: false, kind: isDefaultFilters(current) ? 'all' : 'custom' }
    return { presets, active, activeSaved, modified: isPresetModified(active, current, settings.sortRules), kind: 'preset' }
  }, [settings.presets, settings.activePresetId, settings.sortRules, filters, tags, folders])
}
