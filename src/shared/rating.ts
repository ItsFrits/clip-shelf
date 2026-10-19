/** The rating part of the filters. Ratings run from 1 to 5, 0 means a clip is not rated. */
export interface RatingRange {
  minRating: number
  maxRating: number
  showUnrated: boolean
}

export const FULL_RATING_RANGE: RatingRange = { minRating: 1, maxRating: 5, showUnrated: true }

export function ratingMatches(rating: number, r: RatingRange): boolean {
  if (rating <= 0) return r.showUnrated
  return rating >= r.minRating && rating <= r.maxRating
}

export function isRatingFiltered(r: RatingRange): boolean {
  return r.minRating > 1 || r.maxRating < 5 || !r.showUnrated
}

/**
 * Click a star in the "from" row. Clicking the star that is already chosen goes back to 1.
 * The top end never ends up below the bottom end: it is pushed up along.
 */
export function pickMinRating(r: RatingRange, n: number): RatingRange {
  const minRating = r.minRating === n ? 1 : n
  return { ...r, minRating, maxRating: Math.max(r.maxRating, minRating) }
}

/** Click a star in the "to" row. Clicking the star that is already chosen goes back to 5. */
export function pickMaxRating(r: RatingRange, n: number): RatingRange {
  const maxRating = r.maxRating === n ? 5 : n
  return { ...r, maxRating, minRating: Math.min(r.minRating, maxRating) }
}

/** The text for the active filter chip, or null when nothing is filtered. */
export function ratingChipLabel(r: RatingRange): string | null {
  if (!isRatingFiltered(r)) return null
  const range = r.minRating === 1 && r.maxRating === 5 ? '' : r.minRating === r.maxRating ? `${r.minRating} stars` : `${r.minRating} to ${r.maxRating} stars`
  if (!range) return 'Unrated hidden'
  return r.showUnrated ? `${range} + unrated` : range
}

/** Safe rating values from anything that was saved. Old saves only had a minimum, where 0 meant no filter. */
export function sanitizeRatingRange(raw: { minRating?: unknown; maxRating?: unknown; showUnrated?: unknown }): RatingRange {
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(5, Math.max(1, Math.round(v))) : fallback
  const oldMinimum = typeof raw.minRating === 'number' && raw.minRating >= 1
  const minRating = num(raw.minRating, 1)
  const maxRating = Math.max(minRating, num(raw.maxRating, 5))
  const showUnrated = typeof raw.showUnrated === 'boolean' ? raw.showUnrated : !oldMinimum
  return { minRating, maxRating, showUnrated }
}
