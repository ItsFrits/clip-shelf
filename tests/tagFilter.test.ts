import { describe, expect, it } from 'vitest'
import { cycleTag, describeTagFilter } from '../src/shared/tagFilter'

describe('cycleTag', () => {
  it('goes from off to shown to hidden to off', () => {
    let s = { include: [] as string[], exclude: [] as string[] }
    s = cycleTag('a', s.include, s.exclude)
    expect(s).toEqual({ include: ['a'], exclude: [] })
    s = cycleTag('a', s.include, s.exclude)
    expect(s).toEqual({ include: [], exclude: ['a'] })
    s = cycleTag('a', s.include, s.exclude)
    expect(s).toEqual({ include: [], exclude: [] })
  })

  it('leaves other tags alone', () => {
    expect(cycleTag('b', ['a'], ['c'])).toEqual({ include: ['a', 'b'], exclude: ['c'] })
    expect(cycleTag('a', ['a', 'b'], ['c'])).toEqual({ include: ['b'], exclude: ['c', 'a'] })
  })
})

describe('describeTagFilter', () => {
  it('says nothing without tags', () => {
    expect(describeTagFilter([], [], 'any')).toBe('')
  })
  it('spells out OR and AND', () => {
    expect(describeTagFilter(['Air dribble', 'Sidewall'], [], 'any')).toBe('Showing clips tagged Air dribble OR Sidewall')
    expect(describeTagFilter(['Air dribble', 'Sidewall'], [], 'all')).toBe('Showing clips tagged Air dribble AND Sidewall')
    expect(describeTagFilter(['Air dribble'], [], 'all')).toBe('Showing clips tagged Air dribble')
  })
  it('adds hidden tags', () => {
    expect(describeTagFilter([], ['Flip reset'], 'any')).toBe('Showing clips without Flip reset')
    expect(describeTagFilter([], ['A', 'B', 'C'], 'any')).toBe('Showing clips without A, B or C')
    expect(describeTagFilter(['Air dribble'], ['Flip reset', 'Fail'], 'any')).toBe(
      'Showing clips tagged Air dribble, without Flip reset or Fail'
    )
  })
})
