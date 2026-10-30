/**
 * The sentence under the tag chips, so it is clear what the current tag filter does.
 * "Showing clips tagged Air dribble OR Sidewall, without Flip reset". Empty when no tag is chosen.
 */
export function describeTagFilter(
  include: string[],
  exclude: string[],
  mode: 'any' | 'all'
): string {
  const parts: string[] = []
  if (include.length > 0) parts.push(`tagged ${include.join(mode === 'all' ? ' AND ' : ' OR ')}`)
  if (exclude.length > 0)
    parts.push(
      `without ${exclude.length > 2 ? exclude.slice(0, -1).join(', ') + ' or ' + exclude[exclude.length - 1] : exclude.join(' or ')}`
    )
  return parts.length > 0 ? `Showing clips ${parts.join(', ')}` : ''
}

/** What one click on a tag chip does: off, then shown, then hidden, then off again. */
export function cycleTag(
  id: string,
  include: string[],
  exclude: string[]
): { include: string[]; exclude: string[] } {
  if (exclude.includes(id)) return { include, exclude: exclude.filter((t) => t !== id) }
  if (include.includes(id))
    return { include: include.filter((t) => t !== id), exclude: [...exclude, id] }
  return { include: [...include, id], exclude }
}
