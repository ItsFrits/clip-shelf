import { describe, expect, it } from 'vitest'
import {
  addToProject,
  cleanOrder,
  clearLeftProjects,
  duplicateProject,
  lengthLabel,
  newProject,
  orderNumbers,
  orderTimes,
  placeInOrder,
  projectStats,
  projectsOfClip,
  cleanPicks,
  markSent,
  pickedKeys,
  pickOnly,
  removeFromAllProjects,
  setPicked,
  removeFromProject,
  reverseOrder,
  sanitizeProjects,
  sortByOrder,
  stepInOrder,
  syncUsed,
  totalLength,
  unplaceFromOrder,
  uniqueProjectName,
  usedKeys
} from '../src/shared/projects'
import { EMPTY_CLIP_USER } from '../src/shared/userLogic'
import type { ClipUser, Project } from '../src/shared/types'

const proj = (id: string, keys: string[], extra: Partial<Project> = {}): Project => ({
  id,
  name: id,
  status: 'working',
  link: '',
  notes: '',
  clipKeys: keys,
  order: [],
  skipped: [],
  sent: [],
  createdAt: 1,
  ...extra
})

describe('sanitizeProjects', () => {
  it('turns the old idea status into working and cleans the fields', () => {
    const out = sanitizeProjects(
      [
        { id: 'a', name: ' Montage ', status: 'idea', clipKeys: ['x', 'x', 'y', 5] },
        { id: 'b', name: '', status: 'published', link: 'https://x', notes: 'n' },
        { id: 'a', name: 'dup' },
        null,
        { name: 'no id' }
      ],
      99
    )
    expect(out.map((p) => p.id)).toEqual(['a', 'b'])
    expect(out[0]).toMatchObject({ name: 'Montage', status: 'working', clipKeys: ['x', 'y'] })
    expect(out[1]).toMatchObject({
      name: 'Untitled project',
      status: 'published',
      link: 'https://x'
    })
    expect(out[0].createdAt).toBe(99)
  })
  it('gives an empty list for anything that is not a list', () => {
    expect(sanitizeProjects(undefined)).toEqual([])
    expect(sanitizeProjects({})).toEqual([])
  })
})

describe('names', () => {
  it('numbers a name that is taken, ignoring case', () => {
    const list = [proj('1', [], { name: 'Montage' }), proj('2', [], { name: 'montage 2' })]
    expect(uniqueProjectName(list, 'montage')).toBe('montage 3')
    expect(uniqueProjectName(list, 'Other')).toBe('Other')
    expect(uniqueProjectName(list, '  ')).toBe('New project')
  })
  it('names a copy and starts it as working', () => {
    const src = proj('1', ['a', 'b'], { name: 'Montage', status: 'published', link: 'x' })
    const copy = duplicateProject([src], src, '2', 5)
    expect(copy).toMatchObject({ id: '2', name: 'Montage copy', status: 'working', link: '' })
    expect(copy.clipKeys).toEqual(['a', 'b'])
    expect(copy.clipKeys).not.toBe(src.clipKeys)
    expect(newProject([src], '3', 'Montage', 1).name).toBe('Montage 2')
  })
})

describe('adding and removing', () => {
  it('adds to the end without duplicates', () => {
    const list = [proj('1', ['a']), proj('2', [])]
    const next = addToProject(list, '1', ['b', 'a', 'b', 'c'])
    expect(next[0].clipKeys).toEqual(['a', 'b', 'c'])
    expect(next[1]).toBe(list[1])
    expect(addToProject(list, '1', ['a'])[0]).toBe(list[0])
  })
  it('removes only from the chosen project', () => {
    const list = [proj('1', ['a', 'b']), proj('2', ['a'])]
    const next = removeFromProject(list, '1', ['a'])
    expect(next[0].clipKeys).toEqual(['b'])
    expect(next[1].clipKeys).toEqual(['a'])
  })
  it('finds the projects of a clip', () => {
    const list = [proj('1', ['a']), proj('2', ['a', 'b'])]
    expect(projectsOfClip(list, 'a').map((p) => p.id)).toEqual(['1', '2'])
    expect([...usedKeys(list)].sort()).toEqual(['a', 'b'])
  })
})

describe('syncUsed', () => {
  const tagged: ClipUser = { ...EMPTY_CLIP_USER, rating: 3 }
  it('marks clips in a project as used, also when they had no data yet', () => {
    const out = syncUsed({ a: tagged }, [proj('1', ['a', 'b'])], EMPTY_CLIP_USER)
    expect(out.a).toMatchObject({ rating: 3, used: true })
    expect(out.b).toMatchObject({ used: true })
  })
  it('clears used when the clip left every project, and drops empty entries', () => {
    // Used only because of a project: the switch was never set by hand.
    const clips = {
      a: { ...tagged, used: true, usedManual: false },
      b: { ...EMPTY_CLIP_USER, used: true, usedManual: false }
    }
    const out = syncUsed(clips, [], EMPTY_CLIP_USER)
    expect(out.a).toMatchObject({ rating: 3, used: false })
    expect(out.b).toBeUndefined()
  })
  it('keeps used while another project still has the clip', () => {
    const clips = { a: { ...EMPTY_CLIP_USER, used: true, usedManual: false } }
    expect(syncUsed(clips, [proj('2', ['a'])], EMPTY_CLIP_USER)).toBe(clips)
  })
  it('keeps a clip you switched to used by hand, in a project or not', () => {
    const clips = { a: { ...tagged, used: true, usedManual: true } }
    expect(syncUsed(clips, [], EMPTY_CLIP_USER)).toBe(clips)
    const inProject = syncUsed(clips, [proj('1', ['a'])], EMPTY_CLIP_USER)
    expect(inProject.a).toMatchObject({ used: true, usedManual: true })
    const out = syncUsed(inProject, [], EMPTY_CLIP_USER)
    expect(out.a).toMatchObject({ used: true, usedManual: true })
  })
  it('treats old data that is used but in no project as set by hand', () => {
    const clips = { a: { ...tagged, used: true }, b: { ...tagged, used: true } }
    const out = syncUsed(clips, [proj('1', ['b'])], EMPTY_CLIP_USER)
    expect(out.a).toMatchObject({ used: true, usedManual: true })
    // In a project already: that is where "used" came from.
    expect(out.b).toMatchObject({ used: true, usedManual: false })
    expect(syncUsed(out, [], EMPTY_CLIP_USER).b).toMatchObject({ used: false })
  })
  it('a clip that only got used through a project is not used any more after it leaves', () => {
    const added = syncUsed({}, [proj('1', ['a'])], EMPTY_CLIP_USER)
    expect(added.a).toMatchObject({ used: true, usedManual: false })
    expect(syncUsed(added, [], EMPTY_CLIP_USER).a).toBeUndefined()
  })
  it('does not touch clips that were never used', () => {
    const clips = { a: tagged }
    expect(syncUsed(clips, [], EMPTY_CLIP_USER)).toBe(clips)
  })
})

describe('clearLeftProjects', () => {
  const manual: ClipUser = { ...EMPTY_CLIP_USER, rating: 2, used: true, usedManual: true }
  it('switches the hand-set switch off for clips that left their last project', () => {
    const before = usedKeys([proj('1', ['a', 'b']), proj('2', ['b'])])
    const after = [proj('1', ['a']), proj('2', [])]
    const out = clearLeftProjects({ a: manual, b: manual }, before, after)
    expect(out.a).toBe(manual)
    expect(out.b).toMatchObject({ usedManual: false })
    // With the project list as it is now, "used" then goes off too.
    expect(syncUsed(out, after, EMPTY_CLIP_USER).b).toMatchObject({ used: false, rating: 2 })
  })
  it('leaves clips alone that were never in a project', () => {
    const clips = { z: manual }
    expect(clearLeftProjects(clips, new Set(['a']), [])).toBe(clips)
  })
})

describe('projectStats', () => {
  it('counts the length, the missing clips and the unknown lengths', () => {
    const clips = new Map([
      ['a', { durationMs: 5000 }],
      ['b', { durationMs: 2500 }],
      ['c', {}]
    ])
    expect(projectStats(proj('1', ['a', 'b', 'c', 'gone']), clips)).toEqual({
      count: 4,
      missing: 1,
      durationMs: 7500,
      unknownLength: 1
    })
  })
})

describe('lengths', () => {
  it('writes a total length', () => {
    expect(totalLength(0)).toBe('0:00')
    expect(totalLength(125_000)).toBe('2:05')
    expect(totalLength(3_725_000)).toBe('1:02:05')
  })
  it('says what is known', () => {
    const base = { count: 2, missing: 0, durationMs: 90_000, unknownLength: 0 }
    expect(lengthLabel(base)).toBe('1:30 in total')
    expect(lengthLabel({ ...base, unknownLength: 1 })).toBe('1:30 in total (1 not measured yet)')
    expect(lengthLabel({ ...base, durationMs: 0, unknownLength: 1 })).toBe(
      '0:00 in total (1 not measured yet)'
    )
    expect(lengthLabel({ count: 0, missing: 0, durationMs: 0, unknownLength: 0 })).toBe(
      'No length yet'
    )
  })
})

describe('order', () => {
  it('cleans an order read from disk', () => {
    expect(cleanOrder(['a', 'x', 'a', 'b', 4], ['a', 'b', 'c'])).toEqual(['a', 'b'])
    expect(cleanOrder(undefined, ['a'])).toEqual([])
    const p = sanitizeProjects([{ id: '1', clipKeys: ['a', 'b'], order: ['b', 'z', 'a'] }])
    expect(p[0].order).toEqual(['b', 'a'])
  })
  it('places clips at the end by default, and moves clips that already have a place', () => {
    expect(placeInOrder(['a', 'b'], ['c', 'd'])).toEqual(['a', 'b', 'c', 'd'])
    expect(placeInOrder(['a', 'b', 'c'], ['a'])).toEqual(['b', 'c', 'a'])
    expect(placeInOrder(['a', 'b'], ['c', 'c'])).toEqual(['a', 'b', 'c'])
  })
  it('places clips at a position of the list as it is now', () => {
    expect(placeInOrder(['a', 'b', 'c'], ['x', 'y'], 1)).toEqual(['a', 'x', 'y', 'b', 'c'])
    expect(placeInOrder(['a', 'b', 'c'], ['x'], 0)).toEqual(['x', 'a', 'b', 'c'])
    expect(placeInOrder(['a', 'b', 'c'], ['x'], 99)).toEqual(['a', 'b', 'c', 'x'])
    expect(placeInOrder(['a', 'b', 'c'], ['x'], -3)).toEqual(['x', 'a', 'b', 'c'])
  })
  it('moving a clip down lands it before the place that was dropped on', () => {
    // Drop "a" in front of "c" (place 2 of the list as it is now).
    expect(placeInOrder(['a', 'b', 'c', 'd'], ['a'], 2)).toEqual(['b', 'a', 'c', 'd'])
    // Drop "c" in front of "a" (place 0).
    expect(placeInOrder(['a', 'b', 'c', 'd'], ['c'], 0)).toEqual(['c', 'a', 'b', 'd'])
    // Dropping a clip right where it already is changes nothing.
    expect(placeInOrder(['a', 'b', 'c'], ['b'], 1)).toEqual(['a', 'b', 'c'])
    expect(placeInOrder(['a', 'b', 'c'], ['b'], 2)).toEqual(['a', 'b', 'c'])
  })
  it('takes clips out, reverses, and steps', () => {
    expect(unplaceFromOrder(['a', 'b', 'c'], ['b', 'x'])).toEqual(['a', 'c'])
    expect(reverseOrder(['a', 'b', 'c'])).toEqual(['c', 'b', 'a'])
    expect(stepInOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(stepInOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    expect(stepInOrder(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(stepInOrder(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
    expect(stepInOrder(['a', 'b'], 'x', 1)).toEqual(['a', 'b'])
  })
  it('sorts clips by their place, the clips without a place last', () => {
    expect(sortByOrder(['x', 'b', 'y', 'a'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'x', 'y'])
  })
  it('numbers the places from 1', () => {
    expect([...orderNumbers(['x', 'y'])]).toEqual([
      ['x', 1],
      ['y', 2]
    ])
  })
  it('works out when each clip starts', () => {
    const clips = new Map([
      ['a', { durationMs: 5000 }],
      ['b', {}],
      ['c', { durationMs: 2000 }]
    ])
    expect(orderTimes(['a', 'b', 'c', 'gone'], clips)).toEqual({
      starts: [0, 5000, 5000, 7000],
      totalMs: 7000,
      unknown: 2
    })
  })
  it('keeps picks in step with the order', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(cleanPicks(order, ['b', 'x', 'b'], ['b', 'c', 'y'])).toEqual({
      skipped: ['b'],
      sent: ['c']
    })
    expect(cleanPicks(order, undefined, 'nope')).toEqual({ skipped: [], sent: [] })
    expect(pickedKeys(order, ['b', 'd'])).toEqual(['a', 'c'])
    const none = { skipped: [], sent: [] }
    // First two only.
    expect(pickOnly(order, none, ['a', 'b'])).toEqual({ skipped: ['c', 'd'], sent: [] })
    // Dragging to the editor picks the clip as well.
    const sent = markSent(order, { skipped: ['c'], sent: [] }, ['a', 'c'])
    expect(sent).toEqual({ skipped: [], sent: ['a', 'c'] })
    // Leaving a clip out takes it out of the editor too, and putting it back does not send it again.
    const out = setPicked(order, sent, ['c'], false)
    expect(out).toEqual({ skipped: ['c'], sent: ['a'] })
    expect(setPicked(order, out, ['c'], true)).toEqual({ skipped: [], sent: ['a'] })
  })
  it('drops picks of clips that leave the project, and does not copy what is in the editor', () => {
    const src = {
      ...proj('1', ['a', 'b', 'c']),
      order: ['a', 'b', 'c'],
      skipped: ['b'],
      sent: ['a']
    }
    const out = removeFromProject([src], '1', ['a', 'b'])[0]
    expect(out.skipped).toEqual([])
    expect(out.sent).toEqual([])
    const copy = duplicateProject([src], src, '2', 1)
    expect(copy.skipped).toEqual(['b'])
    expect(copy.sent).toEqual([])
    expect(
      sanitizeProjects([{ ...src, skipped: ['b', 'zzz'], sent: ['b', 'a'] }])[0]
    ).toMatchObject({
      skipped: ['b'],
      sent: ['a']
    })
  })
  it('takes deleted clips out of every project, including the order', () => {
    const one = { ...proj('1', ['a', 'b', 'c']), order: ['c', 'a'] }
    const two = proj('2', ['d'])
    const out = removeFromAllProjects([one, two], ['a', 'x'])
    expect(out[0].clipKeys).toEqual(['b', 'c'])
    expect(out[0].order).toEqual(['c'])
    // A project without those clips is the same object.
    expect(out[1]).toBe(two)
  })
  it('keeps the order in step when clips leave the project or the project is copied', () => {
    const src = { ...proj('1', ['a', 'b', 'c']), order: ['c', 'a'] }
    expect(removeFromProject([src], '1', ['a'])[0].order).toEqual(['c'])
    expect(removeFromProject([src], '1', ['b'])[0].order).toEqual(['c', 'a'])
    const copy = duplicateProject([src], src, '2', 1)
    expect(copy.order).toEqual(['c', 'a'])
    expect(copy.order).not.toBe(src.order)
    // New clips are not placed.
    expect(addToProject([src], '1', ['d'])[0].order).toEqual(['c', 'a'])
  })
})
