// Rank mode: give clips a place in the order by comparing two at a time. Every clip is placed with a
// binary search against the order that is already there, best first. Everything here is pure: each
// step returns a new state and the caller saves `order`.

import { placeInOrder } from './projects'

/** `left` is the clip being placed, `right` is the clip from the order it is compared with. */
export type RankAnswer = 'left' | 'right' | 'equal'

export interface RankInput {
  /** The order as it is now, best first. */
  order: readonly string[]
  /** The clips to rank, in the order they come up. Clips that have a place already are left out. */
  queue: readonly string[]
  /** Star rating of a clip, 0 when it has none. */
  ratingOf: (key: string) => number
  /** False for a clip that cannot be shown (not in the library), so nothing is compared with it. */
  canCompare: (key: string) => boolean
  /** Only compare with clips around the same star rating. */
  useRatings: boolean
}

interface RankStep {
  order: string[]
  index: number
  lo: number
  hi: number
  placed: number
  skipped: number
}

export interface RankState extends Omit<RankInput, 'order' | 'queue'>, RankStep {
  queue: string[]
  /** The states before each answer or skip, for undo. */
  history: RankStep[]
}

/** The two clips of the next question. */
export interface RankMatch {
  key: string
  against: string
}

/** Two ratings that are close enough to be worth comparing. No rating is close to everything. */
function isNear(a: number, b: number): boolean {
  return a === 0 || b === 0 || Math.abs(a - b) <= 1
}

/**
 * The places a clip with this rating can get: from `lo` to `hi`, where 0 is before the first clip and
 * `ratings.length` after the last. `ratings` are those of the clips in the order, first to last.
 */
export function searchRange(
  ratings: readonly number[],
  rating: number,
  useRatings = true
): [number, number] {
  const all: [number, number] = [0, ratings.length]
  if (!useRatings || rating <= 0) return all
  // From the first to the last clip that is at most one star away.
  const near = (r: number): boolean => r > 0 && Math.abs(r - rating) <= 1
  const first = ratings.findIndex(near)
  if (first >= 0) {
    let last = first
    ratings.forEach((r, i) => {
      if (near(r)) last = i
    })
    return [first, last + 1]
  }
  // No clip is close: the new one goes between the higher and the lower rated clips.
  let lo = 0
  ratings.forEach((r, i) => {
    if (r > rating) lo = i + 1
  })
  const lower = ratings.findIndex((r) => r > 0 && r < rating)
  const hi = lower >= 0 ? lower : ratings.length
  // When the higher and lower ones are mixed there is no such place, so compare with everything.
  return lo <= hi ? [lo, hi] : all
}

const comparable = (s: RankState, order: readonly string[] = s.order): string[] =>
  order.filter((k) => s.canCompare(k))

/** Start the search for the clip at `index`. */
function begin(s: RankState): RankState {
  if (s.index >= s.queue.length) return { ...s, lo: 0, hi: 0 }
  const ratings = comparable(s).map(s.ratingOf)
  const [lo, hi] = searchRange(ratings, s.ratingOf(s.queue[s.index]), s.useRatings)
  return { ...s, lo, hi }
}

/** Place every clip that needs no more questions, until there is one to ask or nothing is left. */
function settle(state: RankState): RankState {
  let s = state
  while (s.index < s.queue.length && s.lo >= s.hi) {
    const others = comparable(s)
    const at = s.lo < others.length ? s.order.indexOf(others[s.lo]) : s.order.length
    s = begin({
      ...s,
      order: placeInOrder(s.order, [s.queue[s.index]], at),
      index: s.index + 1,
      placed: s.placed + 1
    })
  }
  return s
}

export function startRanking(input: RankInput): RankState {
  const order = [...input.order]
  const have = new Set(order)
  return settle(
    begin({
      ...input,
      order,
      queue: [...new Set(input.queue)].filter((k) => !have.has(k)),
      index: 0,
      lo: 0,
      hi: 0,
      placed: 0,
      skipped: 0,
      history: []
    })
  )
}

const middle = (s: RankState): number => Math.floor((s.lo + s.hi) / 2)

/** The question to ask now, or null when every clip had its turn. */
export function currentMatch(s: RankState): RankMatch | null {
  if (s.index >= s.queue.length) return null
  return { key: s.queue[s.index], against: comparable(s)[middle(s)] }
}

function remember(s: RankState): RankStep[] {
  const { order, index, lo, hi, placed, skipped } = s
  return [...s.history, { order, index, lo, hi, placed, skipped }]
}

export function answerRank(s: RankState, answer: RankAnswer): RankState {
  if (s.index >= s.queue.length) return s
  const mid = middle(s)
  // An equal clip goes right after the one it was compared with.
  const [lo, hi] =
    answer === 'left' ? [s.lo, mid] : answer === 'right' ? [mid + 1, s.hi] : [mid + 1, mid + 1]
  return settle({ ...s, lo, hi, history: remember(s) })
}

/** Leave this clip without a place and go to the next one. */
export function skipRank(s: RankState): RankState {
  if (s.index >= s.queue.length) return s
  return settle(begin({ ...s, index: s.index + 1, skipped: s.skipped + 1, history: remember(s) }))
}

export function canUndoRank(s: RankState): boolean {
  return s.history.length > 0
}

/** Go back to the question before the last answer or skip. */
export function undoRank(s: RankState): RankState {
  const last = s.history[s.history.length - 1]
  return last ? { ...s, ...last, history: s.history.slice(0, -1) } : s
}

/** Turn the rating shortcut on or off. The search for the current clip starts again. */
export function setUseRatings(s: RankState, useRatings: boolean): RankState {
  if (s.useRatings === useRatings) return s
  return settle(begin({ ...s, useRatings }))
}

/** A rough number of questions still to come, counting the current clip and all after it. */
export function questionsLeft(s: RankState): number {
  if (s.index >= s.queue.length) return 0
  const steps = (places: number): number => Math.ceil(Math.log2(places))
  const ratings = comparable(s).map(s.ratingOf)
  const waiting = [s.ratingOf(s.queue[s.index])]
  let total = steps(s.hi - s.lo + 1)
  for (const key of s.queue.slice(s.index + 1)) {
    const rating = s.ratingOf(key)
    const [lo, hi] = searchRange(ratings, rating, s.useRatings)
    // The clips ranked before this one make its range longer.
    const added = s.useRatings ? waiting.filter((r) => isNear(r, rating)).length : waiting.length
    total += steps(hi - lo + added + 1)
    waiting.push(rating)
  }
  return total
}
