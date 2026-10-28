import type { Clip, SortField, SortRule } from './types'

export const SORT_FIELDS: SortField[] = ['date', 'rating', 'length', 'size', 'name', 'random']

export const FIELD_INFO: Record<SortField, { label: string; asc: string; desc: string; first: { asc: string; desc: string } }> = {
  date: { label: 'Date', asc: 'Oldest first', desc: 'Newest first', first: { asc: 'Oldest first', desc: 'Newest first' } },
  rating: { label: 'Rating', asc: 'Low to high', desc: 'High to low', first: { asc: 'Lowest rated first', desc: 'Highest rated first' } },
  length: { label: 'Length', asc: 'Short to long', desc: 'Long to short', first: { asc: 'Shortest first', desc: 'Longest first' } },
  size: { label: 'Size', asc: 'Small to large', desc: 'Large to small', first: { asc: 'Smallest first', desc: 'Largest first' } },
  name: { label: 'Name', asc: 'A to Z', desc: 'Z to A', first: { asc: 'A to Z', desc: 'Z to A' } },
  random: { label: 'Random', asc: 'Shuffled', desc: 'Shuffled', first: { asc: 'Random order', desc: 'Random order' } }
}

/** The direction a field starts with when it is added: highest rating and biggest first make the most sense. */
export const DEFAULT_DIRECTION: Record<SortField, SortRule['dir']> = {
  date: 'asc',
  rating: 'desc',
  length: 'desc',
  size: 'desc',
  name: 'asc',
  random: 'asc'
}

export const DEFAULT_SORT: SortRule[] = [{ field: 'date', dir: 'desc' }]

/**
 * Make a list of sort rules safe: known fields only, each field once, nothing after Random (it
 * decides the whole order), and never empty.
 */
export function sanitizeSortRules(raw: unknown): SortRule[] {
  const out: SortRule[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const field = (item as Partial<SortRule> | null)?.field
      if (!field || !SORT_FIELDS.includes(field) || out.some((r) => r.field === field)) continue
      const dir = (item as SortRule).dir === 'asc' || (item as SortRule).dir === 'desc' ? (item as SortRule).dir : DEFAULT_DIRECTION[field]
      out.push({ field, dir })
      if (field === 'random') break
    }
  }
  return out.length > 0 ? out : DEFAULT_SORT.map((r) => ({ ...r }))
}

/**
 * Settings from before the sort menu had a single choice: 'oldest' or 'newest'. Also picks up a
 * random seed that is a whole number.
 */
export function migrateSortSettings(raw: Record<string, unknown>): { sortRules: SortRule[]; randomSeed: number } {
  const sortRules = Array.isArray(raw.sortRules)
    ? sanitizeSortRules(raw.sortRules)
    : raw.sort === 'oldest'
      ? [{ field: 'date' as const, dir: 'asc' as const }]
      : DEFAULT_SORT.map((r) => ({ ...r }))
  const seed = raw.randomSeed
  return { sortRules, randomSeed: typeof seed === 'number' && Number.isFinite(seed) ? Math.trunc(seed) : 1 }
}

/** Groups by day, week or month only make sense when the clips are in date order. */
export function canGroup(rules: readonly SortRule[]): boolean {
  return rules[0]?.field === 'date'
}

/** For the sort button: the first rule, and how many more there are. */
export function sortButtonLabel(rules: readonly SortRule[]): string {
  const first = rules[0] ?? DEFAULT_SORT[0]
  const text = FIELD_INFO[first.field].first[first.dir]
  return rules.length > 1 ? `${text} +${rules.length - 1}` : text
}

/** A sentence for tooltips, like "Rating, high to low, then Date, oldest first". */
export function describeSort(rules: readonly SortRule[]): string {
  return rules
    .map((r) => (r.field === 'random' ? 'Random' : `${FIELD_INFO[r.field].label}, ${FIELD_INFO[r.field][r.dir].toLowerCase()}`))
    .join(', then ')
}

/** A number from a key and a seed, the same every time, for a shuffle that does not jump around. */
export function shuffleValue(key: string, seed: number): number {
  let h = 2166136261 ^ seed
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h ^ (h >>> 15)) >>> 0
}

/** Sort clips by the rules. Clips that are equal on every rule go by date, then name. */
export function sortClips(clips: Clip[], ratingOf: (key: string) => number, rules: readonly SortRule[], seed: number): Clip[] {
  const value = (c: Clip, field: SortField): number | string => {
    switch (field) {
      case 'date':
        return c.date
      case 'rating':
        return ratingOf(c.key)
      case 'length':
        return c.durationMs ?? 0
      case 'size':
        return c.size
      case 'name':
        return c.name.toLowerCase()
      case 'random':
        return shuffleValue(c.key, seed)
    }
  }
  // Work out each clip's values once, not on every comparison (there can be thousands of clips).
  const rows = clips.map((clip) => ({ clip, values: rules.map((r) => value(clip, r.field)) }))
  rows.sort((a, b) => {
    for (let i = 0; i < rules.length; i++) {
      const x = a.values[i]
      const y = b.values[i]
      if (x === y) continue
      const cmp = x < y ? -1 : 1
      return rules[i].field === 'random' || rules[i].dir === 'asc' ? cmp : -cmp
    }
    return a.clip.date - b.clip.date || (a.clip.name < b.clip.name ? -1 : a.clip.name > b.clip.name ? 1 : 0)
  })
  return rows.map((r) => r.clip)
}

/** Random decides the whole order, so it always stays last. */
function randomLast(rules: SortRule[]): SortRule[] {
  const rest = rules.filter((r) => r.field !== 'random')
  const random = rules.find((r) => r.field === 'random')
  return random ? [...rest, random] : rest
}

/** Fields that can still be added. */
export function availableFields(rules: readonly SortRule[]): SortField[] {
  return SORT_FIELDS.filter((f) => !rules.some((r) => r.field === f))
}

/** Add a rule at the end (before Random, when that is there). */
export function addRule(rules: readonly SortRule[], field: SortField): SortRule[] {
  if (rules.some((r) => r.field === field)) return [...rules]
  return randomLast([...rules, { field, dir: DEFAULT_DIRECTION[field] }])
}

/** Remove a rule, but never the last one. */
export function removeRule(rules: readonly SortRule[], index: number): SortRule[] {
  if (rules.length <= 1) return [...rules]
  return rules.filter((_, i) => i !== index)
}

/** Move a rule to another place in the list. Random stays last. */
export function moveRule(rules: readonly SortRule[], from: number, to: number): SortRule[] {
  if (rules[from]?.field === 'random') return [...rules]
  const next = [...rules]
  const [item] = next.splice(from, 1)
  if (!item) return [...rules]
  next.splice(Math.min(Math.max(to, 0), next.length), 0, item)
  return randomLast(next)
}

export function flipRule(rules: readonly SortRule[], index: number): SortRule[] {
  return rules.map((r, i) => (i === index && r.field !== 'random' ? { ...r, dir: r.dir === 'asc' ? 'desc' : 'asc' } : r))
}

/** Swap the field of a rule. Choosing Random drops the rules after it, they could not count anyway. */
export function setRuleField(rules: readonly SortRule[], index: number, field: SortField): SortRule[] {
  if (!rules[index] || (field !== rules[index].field && rules.some((r) => r.field === field))) return [...rules]
  const next = rules.map((r, i) => (i === index ? { field, dir: r.field === field ? r.dir : DEFAULT_DIRECTION[field] } : r))
  return field === 'random' ? next.slice(0, index + 1) : randomLast(next)
}
