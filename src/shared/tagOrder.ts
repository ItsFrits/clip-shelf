/** Move the item at `from` so it ends up at index `to`. Out of range indexes are clamped. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from < 0 || from >= next.length) return next
  const [item] = next.splice(from, 1)
  next.splice(Math.min(Math.max(to, 0), next.length), 0, item)
  return next
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/**
 * Where a tag that is being dragged goes. `others` are the other tags in order, as boxes relative to
 * the tag list. The tag goes before the first one that is on a lower row than the pointer, or on the
 * same row with its middle to the right of the pointer. Gives an index from 0 to others.length.
 */
export function dropIndex(
  others: readonly { left: number; top: number; width: number; height: number }[],
  pointer: { x: number; y: number }
): number {
  for (let i = 0; i < others.length; i++) {
    const o = others[i]
    if (pointer.y < o.top) return i
    if (pointer.y <= o.top + o.height && pointer.x < o.left + o.width / 2) return i
  }
  return others.length
}
