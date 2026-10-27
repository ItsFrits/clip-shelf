import { describe, expect, it } from 'vitest'
import { dropIndex, moveItem, sameOrder } from '../src/shared/tagOrder'
import { EMPTY_CLIP_USER, applyPatch } from '../src/shared/userLogic'

describe('moveItem', () => {
  it('moves forward and backward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })
  it('clamps and ignores bad positions', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
  it('does not change the input', () => {
    const list = ['a', 'b', 'c']
    moveItem(list, 0, 2)
    expect(list).toEqual(['a', 'b', 'c'])
  })
})

describe('sameOrder', () => {
  it('compares order', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false)
  })
})

describe('dropIndex', () => {
  // Two rows: a b on the first row, c on the second.
  const boxes = [
    { left: 0, top: 0, width: 40, height: 20 },
    { left: 46, top: 0, width: 40, height: 20 },
    { left: 0, top: 26, width: 40, height: 20 }
  ]
  it('goes before the first tag whose middle is right of the pointer', () => {
    expect(dropIndex(boxes, { x: 10, y: 10 })).toBe(0)
    expect(dropIndex(boxes, { x: 30, y: 10 })).toBe(1)
    expect(dropIndex(boxes, { x: 70, y: 10 })).toBe(2)
  })
  it('goes to the start of the next row between rows and after the last tag at the end', () => {
    expect(dropIndex(boxes, { x: 200, y: 23 })).toBe(2)
    expect(dropIndex(boxes, { x: 100, y: 40 })).toBe(3)
    expect(dropIndex([], { x: 5, y: 5 })).toBe(0)
  })
  it('goes first when the pointer is above everything', () => {
    expect(dropIndex(boxes, { x: 100, y: -10 })).toBe(0)
  })
})

describe('adding tags at a position', () => {
  const base = { ...EMPTY_CLIP_USER, tags: ['a', 'b', 'c'] }
  it('adds at the end by default', () => {
    expect(applyPatch(base, { addTags: ['x'] }).tags).toEqual(['a', 'b', 'c', 'x'])
  })
  it('adds at a position', () => {
    expect(applyPatch(base, { addTags: ['x'], addTagsAt: 1 }).tags).toEqual(['a', 'x', 'b', 'c'])
    expect(applyPatch(base, { addTags: ['x'], addTagsAt: 0 }).tags).toEqual(['x', 'a', 'b', 'c'])
  })
  it('keeps several new tags in order and clamps the position', () => {
    expect(applyPatch(base, { addTags: ['x', 'y'], addTagsAt: 1 }).tags).toEqual(['a', 'x', 'y', 'b', 'c'])
    expect(applyPatch(base, { addTags: ['x'], addTagsAt: 99 }).tags).toEqual(['a', 'b', 'c', 'x'])
    expect(applyPatch(base, { addTags: ['x'], addTagsAt: -3 }).tags).toEqual(['x', 'a', 'b', 'c'])
  })
  it('skips a tag the clip already has', () => {
    expect(applyPatch(base, { addTags: ['b', 'x'], addTagsAt: 0 }).tags).toEqual(['x', 'a', 'b', 'c'])
  })
  it('counts as watching only when a tag is really added', () => {
    expect(applyPatch(base, { addTags: ['x'], addTagsAt: 1 }).watched).toBe(true)
    expect(applyPatch(base, { set: { tags: ['c', 'b', 'a'] } }).watched).toBe(false)
  })
  it('reordering through set keeps the same tags', () => {
    expect(applyPatch(base, { set: { tags: ['c', 'a', 'b'] } }).tags).toEqual(['c', 'a', 'b'])
  })
})
