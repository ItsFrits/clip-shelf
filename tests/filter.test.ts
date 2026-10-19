import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, computeVisible, dateWindow, groupClips } from '../src/renderer/src/lib/filter'
import type { Clip, UserData } from '../src/shared/types'
import { DEFAULT_SETTINGS, EMPTY_CLIP_USER } from '../src/shared/userLogic'

function clip(key: string, name: string, date: Date): Clip {
  return { key, name, date: date.getTime(), size: 1, files: [], hints: [], hasThumb: false }
}

const clips = [
  clip('a', 'Replay A', new Date(2025, 7, 2, 11, 26)),
  clip('b', 'Replay B', new Date(2025, 7, 2, 15, 28)),
  clip('c', 'Replay C', new Date(2025, 7, 3, 9, 10)),
  clip('d', 'Replay D', new Date(2025, 8, 1, 12, 0))
]

const user: UserData = {
  v: 1,
  folders: [],
  tags: [
    { id: 't1', name: 'Flick' },
    { id: 't2', name: 'Ceiling shot' }
  ],
  clips: {
    a: { ...EMPTY_CLIP_USER, tags: ['t1'], rating: 4 },
    b: { ...EMPTY_CLIP_USER, watched: true },
    c: { ...EMPTY_CLIP_USER, tags: ['t1', 't2'], note: 'clean wall pinch' }
  },
  projects: [],
  settings: { ...DEFAULT_SETTINGS },
  lastBackupAt: null
}
const ctx = { user, tags: user.tags, folders: [] }
const run = (f: Partial<typeof DEFAULT_FILTERS>, s: Partial<typeof DEFAULT_SETTINGS> = {}): string[] =>
  computeVisible(clips, ctx, { ...DEFAULT_FILTERS, ...f }, { ...DEFAULT_SETTINGS, ...s }).map((c) => c.key)

describe('computeVisible', () => {
  it('shows everything by default, oldest first', () => {
    expect(run({})).toEqual(['a', 'b', 'c', 'd'])
    expect(run({}, { sort: 'newest' })).toEqual(['d', 'c', 'b', 'a'])
  })
  it('filters by status, and "watched" means watched without a tag', () => {
    expect(run({ statuses: ['watched'] })).toEqual(['b'])
    expect(run({ statuses: ['new'] })).toEqual(['d'])
    expect(run({}, { hideSorted: true })).toEqual(['d'])
  })
  it('filters by tags with any / all', () => {
    expect(run({ tagIds: ['t1', 't2'], tagMode: 'any' })).toEqual(['a', 'c'])
    expect(run({ tagIds: ['t1', 't2'], tagMode: 'all' })).toEqual(['c'])
  })
  it('hides clips with an excluded tag, and hiding wins over showing', () => {
    expect(run({ excludeTagIds: ['t2'] })).toEqual(['a', 'b', 'd'])
    expect(run({ tagIds: ['t1'], excludeTagIds: ['t2'] })).toEqual(['a'])
    expect(run({ tagIds: ['t2'], excludeTagIds: ['t2'] })).toEqual([])
    expect(run({ excludeTagIds: ['t1', 't2'], tagMode: 'all' })).toEqual(['b', 'd'])
  })
  it('filters by rating', () => {
    expect(run({ minRating: 4 })).toEqual(['a'])
  })
  it('searches names, notes and tag names', () => {
    expect(run({ query: 'pinch' })).toEqual(['c'])
    expect(run({ query: 'ceiling' })).toEqual(['c'])
    expect(run({ query: 'replay d' })).toEqual(['d'])
  })
  it('filters by month and by range', () => {
    expect(run({ dateMode: 'month', anchor: new Date(2025, 7, 15).getTime() })).toEqual(['a', 'b', 'c'])
    expect(run({ dateMode: 'range', rangeFrom: '2025-08-03', rangeTo: '2025-08-03' })).toEqual(['c'])
    expect(dateWindow({ ...DEFAULT_FILTERS, dateMode: 'all' })).toBeNull()
  })
})

describe('groupClips', () => {
  it('groups by day', () => {
    const g = groupClips(clips, 'day')
    expect(g.map((x) => x.clips.length)).toEqual([2, 1, 1])
    expect(g[0].label).toBe('Sat 2 Aug 2025')
  })
  it('groups by month and not at all', () => {
    expect(groupClips(clips, 'month').map((x) => x.clips.length)).toEqual([3, 1])
    expect(groupClips(clips, 'none')).toHaveLength(1)
  })
})
