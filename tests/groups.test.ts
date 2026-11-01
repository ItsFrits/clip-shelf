import { describe, expect, it } from 'vitest'
import { groupClipsByField, groupField } from '../src/shared/groups'
import { sortClips } from '../src/shared/sort'
import type { Clip, SortRule } from '../src/shared/types'

const MB = 1024 * 1024
const clip = (key: string, o: Partial<Clip> = {}): Clip => ({
  key,
  name: key,
  date: 1,
  size: MB,
  files: [],
  hints: [],
  hasThumb: false,
  ...o
})
const labels = (groups: { label: string; clips: Clip[] }[]): string[] =>
  groups.map((g) => `${g.label}:${g.clips.map((c) => c.key).join('')}`)

describe('groupField', () => {
  const rule = (field: SortRule['field']): SortRule[] => [{ field, dir: 'asc' }]
  it('follows the first rule', () => {
    expect(groupField(rule('rating'))).toBe('rating')
    expect(groupField(rule('length'))).toBe('length')
    expect(groupField(rule('size'))).toBe('size')
    expect(groupField(rule('name'))).toBe('name')
  })
  it('has nothing for date (it has its own groups) and random', () => {
    expect(groupField(rule('date'))).toBeNull()
    expect(groupField(rule('random'))).toBeNull()
    expect(groupField([])).toBeNull()
  })
  it('only looks at the first rule', () => {
    expect(groupField([...rule('date'), ...rule('rating')])).toBeNull()
    expect(groupField([...rule('rating'), ...rule('date')])).toBe('rating')
  })
})

describe('groupClipsByField', () => {
  it('groups by rating, with unrated last when sorted high to low', () => {
    const ratings: Record<string, number> = { a: 5, b: 5, c: 3, d: 1, e: 0 }
    const clips = ['a', 'b', 'c', 'd', 'e'].map((k) => clip(k))
    const g = groupClipsByField(clips, 'rating', (k) => ratings[k])
    expect(labels(g)).toEqual(['5 stars:ab', '3 stars:c', '1 star:d', 'Unrated:e'])
  })

  it('groups by length into bands, and keeps clips without a length together', () => {
    const clips = [
      clip('a', { durationMs: 4000 }),
      clip('b', { durationMs: 5000 }),
      clip('c', { durationMs: 9999 }),
      clip('d', { durationMs: 61_000 }),
      clip('e', { durationMs: 400_000 }),
      clip('f')
    ]
    const g = groupClipsByField(clips, 'length', () => 0)
    expect(labels(g)).toEqual([
      'Under 5 s:a',
      '5 to 10 s:bc',
      '1 to 2 min:d',
      '5 min or longer:e',
      'Length unknown:f'
    ])
  })

  it('groups by size into bands', () => {
    const clips = [
      clip('a', { size: 3 * MB }),
      clip('b', { size: 10 * MB }),
      clip('c', { size: 99 * MB }),
      clip('d', { size: 2048 * MB })
    ]
    expect(labels(groupClipsByField(clips, 'size', () => 0))).toEqual([
      'Under 10 MB:a',
      '10 to 50 MB:b',
      '50 to 100 MB:c',
      '1 GB or more:d'
    ])
  })

  it('groups by the first letter, with digits and symbols apart', () => {
    const clips = ['1 clip', 'alpha', 'Apple', 'beta', 'Zed'].map((n) => clip(n, { name: n }))
    const g = groupClipsByField(clips, 'name', () => 0)
    expect(g.map((x) => x.label)).toEqual(['0 to 9', 'A', 'B', 'Z'])
    expect(g[1].clips.map((c) => c.name)).toEqual(['alpha', 'Apple'])
    expect(groupClipsByField([clip('_x', { name: '_x' })], 'name', () => 0)[0].label).toBe('#')
  })

  it('works on clips sorted by the rule, in both directions', () => {
    const ratings: Record<string, number> = { a: 2, b: 4, c: 2, d: 5 }
    const clips = ['a', 'b', 'c', 'd'].map((k) => clip(k))
    const rules: SortRule[] = [{ field: 'rating', dir: 'asc' }]
    const sorted = sortClips(clips, (k) => ratings[k], rules, 1)
    expect(labels(groupClipsByField(sorted, 'rating', (k) => ratings[k]))).toEqual([
      '2 stars:ac',
      '4 stars:b',
      '5 stars:d'
    ])
    const desc = sortClips(clips, (k) => ratings[k], [{ field: 'rating', dir: 'desc' }], 1)
    expect(groupClipsByField(desc, 'rating', (k) => ratings[k]).map((g) => g.label)).toEqual([
      '5 stars',
      '4 stars',
      '2 stars'
    ])
  })

  it('gives every group its own id, also when a group comes back', () => {
    const clips = ['_a', 'b', '_c'].map((n) => clip(n, { name: n }))
    const g = groupClipsByField(clips, 'name', () => 0)
    expect(g).toHaveLength(3)
    expect(new Set(g.map((x) => x.id)).size).toBe(3)
  })

  it('gives no groups for no clips', () => {
    expect(groupClipsByField([], 'size', () => 0)).toEqual([])
  })
})
