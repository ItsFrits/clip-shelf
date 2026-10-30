import { describe, expect, it } from 'vitest'
import type { Clip, SortRule } from '../src/shared/types'
import {
  DEFAULT_SORT,
  addRule,
  availableFields,
  canGroup,
  flipRule,
  migrateSortSettings,
  moveRule,
  removeRule,
  sanitizeSortRules,
  setRuleField,
  sortButtonLabel,
  sortClips
} from '../src/shared/sort'

const clip = (key: string, o: Partial<Clip> = {}): Clip =>
  ({
    key,
    name: key,
    date: 100,
    size: 10,
    durationMs: 1000,
    width: 1,
    height: 1,
    fps: 60,
    files: [],
    hints: [],
    ...o
  }) as unknown as Clip
const keys = (cs: Clip[]): string[] => cs.map((c) => c.key)
const asc = (field: SortRule['field']): SortRule => ({ field, dir: 'asc' })
const desc = (field: SortRule['field']): SortRule => ({ field, dir: 'desc' })

describe('sortClips', () => {
  const clips = [
    clip('a', { date: 3, size: 5, durationMs: 9000 }),
    clip('b', { date: 1, size: 50, durationMs: 1000 }),
    clip('c', { date: 2, size: 20, durationMs: 4000 })
  ]
  const none = (): number => 0
  it('sorts by one field in either direction', () => {
    expect(keys(sortClips(clips, none, [asc('date')], 1))).toEqual(['b', 'c', 'a'])
    expect(keys(sortClips(clips, none, [desc('date')], 1))).toEqual(['a', 'c', 'b'])
    expect(keys(sortClips(clips, none, [desc('size')], 1))).toEqual(['b', 'c', 'a'])
    expect(keys(sortClips(clips, none, [asc('length')], 1))).toEqual(['b', 'c', 'a'])
    expect(keys(sortClips(clips, none, [desc('name')], 1))).toEqual(['c', 'b', 'a'])
  })
  it('falls through to the next rule when values are equal', () => {
    const r = { a: 5, b: 3, c: 5 } as Record<string, number>
    expect(keys(sortClips(clips, (k) => r[k], [desc('rating'), asc('date')], 1))).toEqual([
      'c',
      'a',
      'b'
    ])
    expect(keys(sortClips(clips, (k) => r[k], [desc('rating'), desc('date')], 1))).toEqual([
      'a',
      'c',
      'b'
    ])
  })
  it('counts unrated as the lowest rating', () => {
    const r = { a: 1 } as Record<string, number>
    expect(keys(sortClips(clips, (k) => r[k] ?? 0, [desc('rating')], 1))[0]).toBe('a')
  })
  it('treats a clip without a length as zero', () => {
    const list = [clip('x', { durationMs: undefined }), clip('y', { durationMs: 5 })]
    expect(keys(sortClips(list, none, [asc('length')], 1))).toEqual(['x', 'y'])
  })
  it('shuffles the same way for the same seed, and differently for another', () => {
    const many = Array.from({ length: 30 }, (_, i) => clip(`k${i}`, { date: i }))
    const one = keys(sortClips(many, none, [asc('random')], 1))
    expect(keys(sortClips(many, none, [asc('random')], 1))).toEqual(one)
    expect(keys(sortClips(many, none, [asc('random')], 2))).not.toEqual(one)
    expect([...one].sort()).toEqual(keys(many).sort())
  })
  it('does not change the list it is given', () => {
    const copy = [...clips]
    sortClips(clips, none, [desc('date')], 1)
    expect(clips).toEqual(copy)
  })
})

describe('sanitizeSortRules', () => {
  it('falls back to newest first', () => {
    expect(sanitizeSortRules(undefined)).toEqual([desc('date')])
    expect(sanitizeSortRules([])).toEqual([desc('date')])
    expect(sanitizeSortRules([{ field: 'nope', dir: 'asc' }])).toEqual([desc('date')])
  })
  it('drops duplicates and rules after random', () => {
    expect(sanitizeSortRules([asc('name'), asc('name'), desc('size')])).toEqual([
      asc('name'),
      desc('size')
    ])
    expect(sanitizeSortRules([asc('random'), asc('name')])).toEqual([asc('random')])
    const all = [asc('date'), asc('rating'), asc('length'), asc('size'), asc('name'), asc('random')]
    expect(sanitizeSortRules(all)).toEqual(all)
  })
  it('fills in a missing direction', () => {
    expect(sanitizeSortRules([{ field: 'rating' }])).toEqual([desc('rating')])
  })
})

describe('migrateSortSettings', () => {
  it('turns the old choice into rules', () => {
    expect(migrateSortSettings({ sort: 'newest' }).sortRules).toEqual([desc('date')])
    expect(migrateSortSettings({ sort: 'oldest' }).sortRules).toEqual([asc('date')])
    expect(migrateSortSettings({}).sortRules).toEqual([desc('date')])
  })
  it('keeps rules that are already there, and the seed', () => {
    const m = migrateSortSettings({ sortRules: [desc('rating')], randomSeed: 7.9, sort: 'newest' })
    expect(m).toEqual({ sortRules: [desc('rating')], randomSeed: 7 })
    expect(migrateSortSettings({ randomSeed: 'x' }).randomSeed).toBe(1)
  })
})

describe('editing rules', () => {
  it('only groups when date comes first', () => {
    expect(canGroup([asc('date'), desc('rating')])).toBe(true)
    expect(canGroup([desc('rating'), asc('date')])).toBe(false)
  })
  it('adds rules with a sensible direction, keeping random last', () => {
    expect(addRule([asc('date')], 'rating')).toEqual([asc('date'), desc('rating')])
    expect(addRule([asc('date'), asc('random')], 'name')).toEqual([
      asc('date'),
      asc('name'),
      asc('random')
    ])
    expect(addRule([asc('date')], 'date')).toEqual([asc('date')])
  })
  it('offers the fields that are not used yet', () => {
    expect(availableFields([asc('date')])).toContain('rating')
    expect(availableFields([asc('date')])).not.toContain('date')
    const all = [
      asc('date'),
      desc('rating'),
      desc('length'),
      desc('size'),
      asc('name'),
      asc('random')
    ]
    expect(availableFields(all)).toEqual([])
    expect(addRule(all, 'random')).toEqual(all)
  })
  it('never removes the last rule', () => {
    expect(removeRule([asc('date')], 0)).toEqual([asc('date')])
    expect(removeRule([asc('date'), asc('name')], 0)).toEqual([asc('name')])
  })
  it('moves rules, and random stays last', () => {
    const r = [asc('date'), desc('rating'), asc('random')]
    expect(moveRule(r, 1, 0)).toEqual([desc('rating'), asc('date'), asc('random')])
    expect(moveRule(r, 0, 2)).toEqual([desc('rating'), asc('date'), asc('random')])
    expect(moveRule(r, 2, 0)).toEqual(r)
  })
  it('flips a direction but not for random', () => {
    expect(flipRule([asc('date')], 0)).toEqual([desc('date')])
    expect(flipRule([asc('random')], 0)).toEqual([asc('random')])
  })
  it('changes the field of a rule', () => {
    expect(setRuleField([asc('date'), asc('name')], 1, 'size')).toEqual([asc('date'), desc('size')])
    expect(setRuleField([asc('date'), asc('name')], 1, 'date')).toEqual([asc('date'), asc('name')])
    expect(setRuleField([asc('date'), asc('name'), asc('size')], 1, 'random')).toEqual([
      asc('date'),
      asc('random')
    ])
    expect(setRuleField([asc('date'), asc('name')], 0, 'date')).toEqual([asc('date'), asc('name')])
  })
})

describe('sortButtonLabel', () => {
  it('names the first rule and counts the others', () => {
    expect(sortButtonLabel([asc('date')])).toBe('Oldest first')
    expect(sortButtonLabel(DEFAULT_SORT)).toBe('Newest first')
    expect(sortButtonLabel([desc('rating'), asc('date')])).toBe('Highest rated first +1')
    expect(sortButtonLabel([asc('random')])).toBe('Random order')
  })
})
