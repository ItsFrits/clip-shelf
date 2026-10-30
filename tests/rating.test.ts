import { describe, expect, it } from 'vitest'
import {
  FULL_RATING_RANGE,
  isRatingFiltered,
  pickMaxRating,
  pickMinRating,
  ratingChipLabel,
  ratingMatches,
  sanitizeRatingRange
} from '../src/shared/rating'

describe('ratingMatches', () => {
  it('shows everything by default', () => {
    for (const n of [0, 1, 2, 3, 4, 5]) expect(ratingMatches(n, FULL_RATING_RANGE)).toBe(true)
    expect(isRatingFiltered(FULL_RATING_RANGE)).toBe(false)
  })
  it('keeps clips inside the range, both ends included', () => {
    const r = { minRating: 2, maxRating: 4, showUnrated: false }
    expect([0, 1, 2, 3, 4, 5].filter((n) => ratingMatches(n, r))).toEqual([2, 3, 4])
  })
  it('lets the unrated switch decide about unrated clips only', () => {
    expect(ratingMatches(0, { minRating: 4, maxRating: 5, showUnrated: true })).toBe(true)
    expect(ratingMatches(0, { ...FULL_RATING_RANGE, showUnrated: false })).toBe(false)
    expect(ratingMatches(3, { ...FULL_RATING_RANGE, showUnrated: false })).toBe(true)
  })
})

describe('picking stars', () => {
  it('sets the bottom and clicking it again goes back to 1', () => {
    const a = pickMinRating(FULL_RATING_RANGE, 3)
    expect(a).toMatchObject({ minRating: 3, maxRating: 5 })
    expect(pickMinRating(a, 3)).toMatchObject({ minRating: 1, maxRating: 5 })
  })
  it('sets the top and clicking it again goes back to 5', () => {
    const a = pickMaxRating(FULL_RATING_RANGE, 2)
    expect(a).toMatchObject({ minRating: 1, maxRating: 2 })
    expect(pickMaxRating(a, 2)).toMatchObject({ maxRating: 5 })
  })
  it('never lets the bottom pass the top', () => {
    const top = pickMaxRating(FULL_RATING_RANGE, 2)
    expect(pickMinRating(top, 4)).toMatchObject({ minRating: 4, maxRating: 4 })
    const bottom = pickMinRating(FULL_RATING_RANGE, 4)
    expect(pickMaxRating(bottom, 2)).toMatchObject({ minRating: 2, maxRating: 2 })
  })
  it('keeps the unrated switch as it was', () => {
    expect(pickMinRating({ ...FULL_RATING_RANGE, showUnrated: false }, 3).showUnrated).toBe(false)
  })
})

describe('ratingChipLabel', () => {
  it('says nothing when not filtered', () => {
    expect(ratingChipLabel(FULL_RATING_RANGE)).toBeNull()
  })
  it('describes the range and the unrated switch', () => {
    expect(ratingChipLabel({ minRating: 4, maxRating: 5, showUnrated: false })).toBe('4 to 5 stars')
    expect(ratingChipLabel({ minRating: 4, maxRating: 5, showUnrated: true })).toBe(
      '4 to 5 stars + unrated'
    )
    expect(ratingChipLabel({ minRating: 3, maxRating: 3, showUnrated: false })).toBe('3 stars')
    expect(ratingChipLabel({ ...FULL_RATING_RANGE, showUnrated: false })).toBe('Unrated hidden')
  })
})

describe('sanitizeRatingRange', () => {
  it('falls back to the full range', () => {
    expect(sanitizeRatingRange({})).toEqual(FULL_RATING_RANGE)
    expect(sanitizeRatingRange({ minRating: 'x', maxRating: null, showUnrated: 'yes' })).toEqual(
      FULL_RATING_RANGE
    )
  })
  it('keeps values in 1 to 5 with the bottom not above the top', () => {
    expect(sanitizeRatingRange({ minRating: 9, maxRating: 2, showUnrated: true })).toEqual({
      minRating: 5,
      maxRating: 5,
      showUnrated: true
    })
    expect(sanitizeRatingRange({ minRating: 3, maxRating: 2, showUnrated: true })).toMatchObject({
      minRating: 3,
      maxRating: 3
    })
  })
})
