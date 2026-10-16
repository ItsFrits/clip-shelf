import type { ClipBulkPatch, ClipUser, Settings, Tag } from './types'

export const EMPTY_CLIP_USER: ClipUser = {
  tags: [],
  rating: 0,
  watched: false,
  used: false,
  note: '',
  ignoredHints: []
}

export const DEFAULT_SETTINGS: Settings = {
  editorName: '',
  dragIncludeAudio: true,
  autoplayNext: false,
  loop: true,
  showKeyHints: true,
  masterVolume: 1,
  masterMuted: false,
  trackNames: 'names',
  trackVolumes: {},
  trackProfiles: {},
  keymap: {},
  ignorePatterns: ['.sfk', 'thumb_cache', '*.tmp', '*.part'],
  autoBackup: true,
  hideSorted: false,
  thumbSize: 3,
  group: 'day',
  sort: 'oldest'
}

export function isDefaultClipUser(u: ClipUser): boolean {
  return (
    u.tags.length === 0 &&
    u.rating === 0 &&
    !u.watched &&
    !u.used &&
    u.note === '' &&
    u.ignoredHints.length === 0
  )
}

export function applyPatch(u: ClipUser, p: ClipBulkPatch): ClipUser {
  let next: ClipUser = { ...u, tags: [...u.tags], ignoredHints: [...u.ignoredHints] }
  if (p.set) next = { ...next, ...p.set }
  if (p.removeTags?.length) next.tags = next.tags.filter((t) => !p.removeTags!.includes(t))
  if (p.addTags?.length) {
    for (const t of p.addTags) if (!next.tags.includes(t)) next.tags.push(t)
  }
  // Tagging, rating or writing a note means you have seen the clip. An explicit watched value wins.
  if (!next.watched && p.set?.watched === undefined) {
    const addedTag = next.tags.length > u.tags.length
    const rated = next.rating > 0 && next.rating !== u.rating
    const noted = next.note.trim() !== '' && next.note !== u.note
    if (addedTag || rated || noted) next.watched = true
  }
  return next
}

export type ClipStatus = 'new' | 'watched' | 'tagged' | 'used'

/** The single status shown on a clip card. */
export function clipStatus(u: ClipUser): ClipStatus {
  if (u.used) return 'used'
  if (u.tags.length > 0) return 'tagged'
  if (u.watched) return 'watched'
  return 'new'
}

/** The folder a file is in (works for both Windows and other paths). */
export function parentDir(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, '')
}

/**
 * Clips in the same folder with the same audio tracks share their volume and mute settings.
 * The key is the folder plus the track labels in order.
 */
export function trackProfileKey(folder: string, labels: string[]): string {
  return `${folder.replace(/\\/g, '/').toLowerCase()}|${labels.join('/')}`
}

/**
 * The tags to offer for a clip, based on the tags it already has. The tag added last comes first.
 * Tags the clip already has are never offered, and each tag is offered once.
 */
export function suggestedTags(clipTagIds: string[], tags: Tag[]): Tag[] {
  const byId = new Map(tags.map((t) => [t.id, t]))
  const have = new Set(clipTagIds)
  const seen = new Set<string>()
  const out: Tag[] = []
  for (let i = clipTagIds.length - 1; i >= 0; i--) {
    for (const id of byId.get(clipTagIds[i])?.suggests ?? []) {
      const tag = byId.get(id)
      if (!tag || have.has(id) || seen.has(id)) continue
      seen.add(id)
      out.push(tag)
    }
  }
  return out
}

/** Remove or replace tag ids in every suggestion list, for example after a tag is merged or deleted. */
export function cleanSuggestions(tags: Tag[], removed: Set<string>, replacement: string | null): Tag[] {
  return tags.map((t) => {
    if (!t.suggests?.length) return t
    const next: string[] = []
    for (const id of t.suggests) {
      const mapped = removed.has(id) ? replacement : id
      if (mapped && mapped !== t.id && !next.includes(mapped)) next.push(mapped)
    }
    if (next.length === t.suggests.length && next.every((id, i) => id === t.suggests![i])) return t
    const { suggests: _old, ...rest } = t
    return next.length > 0 ? { ...rest, suggests: next } : rest
  })
}
