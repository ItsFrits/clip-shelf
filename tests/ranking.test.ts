import { describe, expect, it } from 'vitest'
import {
  answerRank,
  canUndoRank,
  currentMatch,
  questionsLeft,
  type RankAnswer,
  type RankInput,
  type RankState,
  searchRange,
  setUseRatings,
  skipRank,
  startRanking,
  undoRank
} from '../src/shared/ranking'

function start(
  input: Partial<RankInput> & { ratings?: Record<string, number>; missing?: string[] } = {}
): RankState {
  const { ratings = {}, missing = [], ...rest } = input
  return startRanking({
    order: [],
    queue: [],
    ratingOf: (k) => ratings[k] ?? 0,
    canCompare: (k) => !missing.includes(k),
    useRatings: true,
    ...rest
  })
}

/** Answer every question with how good the clips really are (a higher score is better). */
function finish(
  state: RankState,
  score: Record<string, number>
): { state: RankState; asked: number } {
  let s = state
  let asked = 0
  for (let match = currentMatch(s); match; match = currentMatch(s)) {
    const a = score[match.key]
    const b = score[match.against]
    s = answerRank(s, a > b ? 'left' : a < b ? 'right' : 'equal')
    asked++
    if (asked > 1000) throw new Error('Ranking does not end')
  }
  return { state: s, asked }
}

const letters = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${i}`)

describe('searchRange', () => {
  it('is everything without a rating or with the shortcut off', () => {
    expect(searchRange([5, 3, 1], 0)).toEqual([0, 3])
    expect(searchRange([5, 3, 1], 5, false)).toEqual([0, 3])
    expect(searchRange([], 4)).toEqual([0, 0])
    expect(searchRange([0, 0], 4)).toEqual([0, 2])
  })

  it('runs from the first to the last clip at most one star away', () => {
    expect(searchRange([5, 5, 3, 3, 1, 1], 3)).toEqual([2, 4])
    expect(searchRange([5, 4, 3, 2, 1], 3)).toEqual([1, 4])
    expect(searchRange([5, 5, 3, 3, 1, 1], 4)).toEqual([0, 4])
  })

  it('takes the whole span when the order was made by hand', () => {
    expect(searchRange([1, 3, 5, 5, 3], 3)).toEqual([1, 5])
    expect(searchRange([5, 3, 1, 5, 1], 5)).toEqual([0, 4])
  })

  it('goes between higher and lower clips when none is close', () => {
    expect(searchRange([5, 5, 1, 1], 3)).toEqual([2, 2])
    expect(searchRange([5, 0, 1], 3)).toEqual([1, 2])
    expect(searchRange([1, 1], 5)).toEqual([0, 0])
    expect(searchRange([5, 5], 1)).toEqual([2, 2])
  })

  it('compares with everything when higher and lower are mixed and none is close', () => {
    expect(searchRange([1, 5], 3)).toEqual([0, 2])
  })
})

describe('ranking', () => {
  it('places the first clip of an empty order without a question', () => {
    const s = start({ queue: ['a'] })
    expect(s.order).toEqual(['a'])
    expect(s.placed).toBe(1)
    expect(currentMatch(s)).toBeNull()
    expect(questionsLeft(s)).toBe(0)
    expect(canUndoRank(s)).toBe(false)
  })

  it('has nothing to do with an empty queue', () => {
    const s = start({ order: ['a'] })
    expect(currentMatch(s)).toBeNull()
    expect(s.order).toEqual(['a'])
    expect(answerRank(s, 'left')).toBe(s)
    expect(skipRank(s)).toBe(s)
    expect(undoRank(s)).toBe(s)
  })

  it('leaves out clips that have a place and doubles in the queue', () => {
    const s = start({ order: ['a'], queue: ['a', 'b', 'b'] })
    expect(s.queue).toEqual(['b'])
  })

  it('asks about the middle clip and puts the new one where the answer says', () => {
    const s = start({ order: ['a', 'b', 'c'], queue: ['x'] })
    expect(currentMatch(s)).toEqual({ key: 'x', against: 'b' })
    expect(finish(s, { a: 3, b: 2, c: 1, x: 4 }).state.order).toEqual(['x', 'a', 'b', 'c'])
    expect(finish(s, { a: 4, b: 3, c: 1, x: 2 }).state.order).toEqual(['a', 'b', 'x', 'c'])
    expect(finish(s, { a: 4, b: 3, c: 2, x: 1 }).state.order).toEqual(['a', 'b', 'c', 'x'])
  })

  it('puts an equal clip right after the one it was compared with', () => {
    const s = answerRank(start({ order: ['a', 'b', 'c'], queue: ['x'] }), 'equal')
    expect(s.order).toEqual(['a', 'b', 'x', 'c'])
    expect(currentMatch(s)).toBeNull()
  })

  it('ends with a full and correct order for every answer path', () => {
    const answers: RankAnswer[] = ['left', 'right', 'equal']
    for (let size = 1; size <= 6; size++) {
      const order = letters(size)
      const walk = (s: RankState, depth: number): void => {
        if (!currentMatch(s)) {
          expect([...s.order].sort()).toEqual([...order, 'x'].sort())
          // The clips that had a place keep their order among each other.
          expect(s.order.filter((k) => k !== 'x')).toEqual(order)
          expect(depth).toBeLessThanOrEqual(Math.ceil(Math.log2(size + 1)))
          return
        }
        for (const a of answers) walk(answerRank(s, a), depth + 1)
      }
      walk(start({ order, queue: ['x'] }), 0)
    }
  })

  it('sorts a whole project from an empty order, best first', () => {
    const clips = letters(42)
    // A fixed scramble of the numbers 0 to 41.
    const score = Object.fromEntries(clips.map((k, i) => [k, (i * 29) % 42]))
    const { state, asked } = finish(start({ queue: clips }), score)
    expect(state.order).toEqual([...clips].sort((a, b) => score[b] - score[a]))
    expect(state.placed).toBe(42)
    expect(asked).toBeLessThan(200)
  })

  it('asks far less with star ratings and still ends in the right order', () => {
    const clips = letters(42)
    const ratings = Object.fromEntries(clips.map((k, i) => [k, 1 + (i % 5)]))
    // The better rating always wins, the number decides between equal ratings.
    const score = Object.fromEntries(clips.map((k, i) => [k, ratings[k] * 100 + ((i * 29) % 42)]))
    const quick = finish(start({ queue: clips, ratings }), score)
    const all = finish(start({ queue: clips, ratings, useRatings: false }), score)
    const best = [...clips].sort((a, b) => score[b] - score[a])
    expect(quick.state.order).toEqual(best)
    expect(all.state.order).toEqual(best)
    expect(quick.asked).toBeLessThan(all.asked)
  })

  it('asks nothing for a clip with no rating close to it', () => {
    const s = start({ order: ['five', 'one'], queue: ['x'], ratings: { five: 5, one: 1, x: 3 } })
    expect(s.order).toEqual(['five', 'x', 'one'])
    expect(currentMatch(s)).toBeNull()
  })

  it('never compares with a clip that is not in the library, and keeps its place', () => {
    const order = ['gone1', 'a', 'gone2', 'b', 'gone3']
    const missing = ['gone1', 'gone2', 'gone3']
    const s = start({ order, queue: ['x'], missing })
    expect(['a', 'b']).toContain(currentMatch(s)!.against)
    const last = finish(s, { a: 3, b: 2, x: 1 }).state
    expect(last.order.filter((k) => k !== 'x')).toEqual(order)
    expect(last.order.indexOf('x')).toBeGreaterThan(last.order.indexOf('b'))
    const first = finish(s, { a: 2, b: 1, x: 3 }).state
    expect(first.order).toEqual(['gone1', 'x', 'a', 'gone2', 'b', 'gone3'])
  })

  it('places without a question when nothing in the order can be shown', () => {
    const s = start({ order: ['gone'], queue: ['x'], missing: ['gone'] })
    expect(s.order).toEqual(['gone', 'x'])
  })

  it('skips a clip and leaves it without a place', () => {
    let s = start({ order: ['a'], queue: ['x', 'y'] })
    s = skipRank(s)
    expect(s.skipped).toBe(1)
    expect(currentMatch(s)).toEqual({ key: 'y', against: 'a' })
    s = answerRank(s, 'left')
    expect(s.order).toEqual(['y', 'a'])
    expect(currentMatch(s)).toBeNull()
  })

  it('undoes one answer at a time, also an insert and a skip', () => {
    const first = start({ order: ['a', 'b', 'c'], queue: ['x', 'y'] })
    const second = answerRank(first, 'left')
    const third = answerRank(second, 'right')
    expect(third.order).toEqual(['a', 'x', 'b', 'c'])
    expect(currentMatch(third)!.key).toBe('y')
    const fourth = skipRank(third)
    expect(currentMatch(fourth)).toBeNull()

    expect(undoRank(fourth)).toEqual(third)
    expect(undoRank(undoRank(fourth))).toEqual(second)
    expect(undoRank(undoRank(undoRank(fourth)))).toEqual(first)
    expect(canUndoRank(first)).toBe(false)
  })

  it('also takes back the clips that got a place without a question', () => {
    const ratings = { five: 5, x: 5, y: 1 }
    const s = start({ order: ['five'], queue: ['x', 'y'], ratings })
    const done = answerRank(s, 'left')
    expect(done.order).toEqual(['x', 'five', 'y'])
    expect(undoRank(done).order).toEqual(['five'])
  })

  it('starts the current clip again when the rating shortcut is switched', () => {
    const ratings = { a: 5, b: 3, c: 1, x: 3 }
    const s = start({ order: ['a', 'b', 'c'], queue: ['x'], ratings, useRatings: false })
    expect(setUseRatings(s, false)).toBe(s)
    const on = setUseRatings(s, true)
    expect(currentMatch(on)).toEqual({ key: 'x', against: 'b' })
    expect([on.lo, on.hi]).toEqual([1, 2])
    const off = setUseRatings(on, false)
    expect([off.lo, off.hi]).toEqual([0, 3])
  })

  it('counts down the questions that are left', () => {
    let s = start({ order: letters(7), queue: ['x', 'y'] })
    expect(questionsLeft(s)).toBe(3 + 4)
    s = answerRank(s, 'left')
    expect(questionsLeft(s)).toBe(2 + 4)
  })
})
