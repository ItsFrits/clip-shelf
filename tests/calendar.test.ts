import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayKey,
  dayStatusMap,
  describeDay,
  monthGrid,
  orderRange,
  parseDayKey,
  rangePreset,
  shiftMonth,
  weekStart,
  yearsWithClips
} from '../src/shared/calendar'

const d = (y: number, m: number, day: number, h = 12): number => new Date(y, m - 1, day, h).getTime()

describe('monthGrid', () => {
  it('starts on a Monday and always has six full weeks', () => {
    const g = monthGrid(2026, 9) // October 2026 starts on a Thursday
    expect(g).toHaveLength(42)
    expect(g[0].key).toBe('2026-09-28')
    expect(new Date(g[0].ts).getDay()).toBe(1)
    expect(g[41].key).toBe('2026-11-08')
  })
  it('marks which days belong to the month', () => {
    const g = monthGrid(2026, 9)
    expect(g.filter((x) => x.inMonth)).toHaveLength(31)
    expect(g[0].inMonth).toBe(false)
    expect(g[3]).toMatchObject({ key: '2026-10-01', day: 1, inMonth: true })
  })
  it('works when the month starts on a Monday', () => {
    expect(monthGrid(2026, 5)[0].key).toBe('2026-06-01')
  })
  it('works for February in a leap year', () => {
    expect(monthGrid(2024, 1).filter((x) => x.inMonth)).toHaveLength(29)
  })
})

describe('days and weeks', () => {
  it('finds the Monday of a week, also for a Sunday', () => {
    expect(dayKey(weekStart(d(2026, 10, 25)))).toBe('2026-10-19')
    expect(dayKey(weekStart(d(2026, 10, 19)))).toBe('2026-10-19')
  })
  it('adds days across a clock change', () => {
    expect(dayKey(addDays(d(2026, 10, 24, 0), 2))).toBe('2026-10-26')
    expect(dayKey(addDays(d(2026, 3, 28, 0), 2))).toBe('2026-03-30')
  })
  it('parses day keys and refuses impossible dates', () => {
    expect(parseDayKey('2026-10-08')).toBe(new Date(2026, 9, 8).getTime())
    expect(parseDayKey('2026-02-30')).toBeNull()
    expect(parseDayKey('8-10-2026')).toBeNull()
  })
  it('moves a month and keeps the day when it can', () => {
    expect(dayKey(shiftMonth(d(2026, 1, 31), 1))).toBe('2026-02-28')
    expect(dayKey(shiftMonth(d(2026, 10, 15), -1))).toBe('2026-09-15')
    expect(dayKey(shiftMonth(d(2026, 12, 5), 1))).toBe('2027-01-05')
  })
})

describe('ranges', () => {
  it('puts two days in order', () => {
    expect(orderRange('2026-10-09', '2026-10-03')).toEqual({ from: '2026-10-03', to: '2026-10-09' })
    expect(orderRange('2026-10-03', '2026-10-03')).toEqual({ from: '2026-10-03', to: '2026-10-03' })
  })
  it('gives the quick choices, ending today', () => {
    const now = d(2026, 10, 26, 15)
    expect(rangePreset('last7', now)).toEqual({ from: '2026-10-20', to: '2026-10-26' })
    expect(rangePreset('last30', now)).toEqual({ from: '2026-09-27', to: '2026-10-26' })
    expect(rangePreset('thisYear', now)).toEqual({ from: '2026-01-01', to: '2026-10-26' })
  })
})

describe('day counts', () => {
  const map = dayStatusMap([
    { date: d(2026, 10, 8, 9), status: 'new' },
    { date: d(2026, 10, 8, 23), status: 'new' },
    { date: d(2026, 10, 8, 12), status: 'tagged' },
    { date: d(2026, 10, 9, 0), status: 'used' }
  ])
  it('counts per day and status, by local day', () => {
    expect(map.get('2026-10-08')).toEqual({ new: 2, watched: 0, tagged: 1, used: 0, total: 3 })
    expect(map.get('2026-10-09')?.total).toBe(1)
    expect(map.get('2026-10-10')).toBeUndefined()
  })
  it('describes a day for the hover text', () => {
    expect(describeDay(map.get('2026-10-08'))).toBe('3 clips: 2 new, 1 tagged')
    expect(describeDay(map.get('2026-10-09'))).toBe('1 clip: 1 used')
    expect(describeDay(undefined)).toBe('No clips')
  })
})

describe('yearsWithClips', () => {
  it('lists each year once, newest first', () => {
    expect(yearsWithClips([d(2024, 5, 1), d(2026, 1, 1), d(2024, 12, 31), d(2025, 6, 6)])).toEqual([2026, 2025, 2024])
  })
})
