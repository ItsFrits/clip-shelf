import type { ClipBulkPatch, ClipUser, Settings } from './types'

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
  masterVolume: 1,
  masterMuted: false,
  trackNames: 'names',
  trackVolumes: {},
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
