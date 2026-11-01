import type { Clip, SortField, SortRule } from './types'

export interface ClipGroup {
  id: string
  label: string
  clips: Clip[]
}

/** The sort fields (besides Date) that clips can be grouped by. */
export type GroupField = 'rating' | 'length' | 'size' | 'name'

const GROUP_FIELDS: SortField[] = ['rating', 'length', 'size', 'name']

/**
 * What the clips can be grouped by: the field of the first sort rule. Date has its own groups (day,
 * week, month) and Random has none, so those give null.
 */
export function groupField(rules: readonly SortRule[]): GroupField | null {
  const first = rules[0]?.field
  return first && GROUP_FIELDS.includes(first) ? (first as GroupField) : null
}

interface Bucket {
  /** Same for clips in the same group. */
  id: string
  label: string
}

const SEC = 1000
const MB = 1024 * 1024

/** Where a value falls between the limits: 0 below the first limit, limits.length above the last. */
function band(value: number, limits: readonly number[]): number {
  let i = 0
  while (i < limits.length && value >= limits[i]) i++
  return i
}

const LENGTH_LIMITS = [5, 10, 20, 30, 60, 120, 300].map((s) => s * SEC)
const LENGTH_LABELS = [
  'Under 5 s',
  '5 to 10 s',
  '10 to 20 s',
  '20 to 30 s',
  '30 to 60 s',
  '1 to 2 min',
  '2 to 5 min',
  '5 min or longer'
]

const SIZE_LIMITS = [10, 50, 100, 250, 500, 1024].map((m) => m * MB)
const SIZE_LABELS = [
  'Under 10 MB',
  '10 to 50 MB',
  '50 to 100 MB',
  '100 to 250 MB',
  '250 to 500 MB',
  '500 MB to 1 GB',
  '1 GB or more'
]

/** The first letter of a name in capitals, "0 to 9" for digits and "#" for anything else. */
function nameBucket(name: string): Bucket {
  const first = [...name][0] ?? ''
  if (/[0-9]/.test(first)) return { id: 'digit', label: '0 to 9' }
  if (/\p{L}/u.test(first)) {
    const letter = [...first.toLocaleUpperCase()][0]
    return { id: letter, label: letter }
  }
  return { id: 'other', label: '#' }
}

function bucketOf(field: GroupField, clip: Clip, rating: number): Bucket {
  switch (field) {
    case 'rating': {
      const stars = Math.min(5, Math.max(0, Math.round(rating)))
      return {
        id: String(stars),
        label: stars === 0 ? 'Unrated' : `${stars} ${stars === 1 ? 'star' : 'stars'}`
      }
    }
    case 'length': {
      if (clip.durationMs === undefined) return { id: 'unknown', label: 'Length unknown' }
      const i = band(clip.durationMs, LENGTH_LIMITS)
      return { id: String(i), label: LENGTH_LABELS[i] }
    }
    case 'size': {
      const i = band(clip.size, SIZE_LIMITS)
      return { id: String(i), label: SIZE_LABELS[i] }
    }
    case 'name':
      return nameBucket(clip.name)
  }
}

/**
 * Cut clips that are already sorted by `field` into groups: every time the group changes, a new one
 * starts. The order of the clips (and so the direction of the sort) is kept. Ids are numbered, so
 * the rare group that shows up twice (names that start with a symbol) still has its own id.
 */
export function groupClipsByField(
  clips: Clip[],
  field: GroupField,
  ratingOf: (key: string) => number
): ClipGroup[] {
  const groups: ClipGroup[] = []
  let currentId = ''
  for (const c of clips) {
    const b = bucketOf(field, c, ratingOf(c.key))
    if (groups.length === 0 || currentId !== b.id) {
      currentId = b.id
      groups.push({ id: `${field}:${b.id}:${groups.length}`, label: b.label, clips: [] })
    }
    groups[groups.length - 1].clips.push(c)
  }
  return groups
}
