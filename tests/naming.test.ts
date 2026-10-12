import { describe, expect, it } from 'vitest'
import { folderHints, makeClipKey, makeIgnoreMatcher, parseDateFromName } from '../src/main/lib/naming'
import { parseRange } from '../src/main/lib/serve'
import { applyPatch, clipStatus, EMPTY_CLIP_USER } from '../src/shared/userLogic'
import { chordFromEvent, effectiveKeymap, findConflict } from '../src/shared/keymap'

const d = (y: number, mo: number, da: number, h: number, mi: number, s = 0): number =>
  new Date(y, mo - 1, da, h, mi, s).getTime()

describe('parseDateFromName', () => {
  it('reads OBS names', () => {
    expect(parseDateFromName('Replay 2026-10-09 23-45-30.mp4')).toBe(d(2026, 10, 9, 23, 45, 30))
  })
  it('reads NVIDIA names', () => {
    expect(parseDateFromName('Rocket League 2024.10.23 - 19.01.35.22.DVR.mp4')).toBe(d(2024, 10, 23, 19, 1, 35))
  })
  it('reads Radeon ReLive names (no seconds)', () => {
    expect(parseDateFromName('Rocket League_replay_2025.08.02-11.26.mp4')).toBe(d(2025, 8, 2, 11, 26))
  })
  it('returns null for names without a date or an impossible date', () => {
    expect(parseDateFromName('my clip.mp4')).toBeNull()
    expect(parseDateFromName('Replay 2026-13-40 23-45-30.mp4')).toBeNull()
  })
})

describe('makeClipKey', () => {
  it('ignores folder, extension and case but not size', () => {
    expect(makeClipKey('A.mp4', 10)).toBe(makeClipKey('a.MP4', 10))
    expect(makeClipKey('a.mp4', 10)).not.toBe(makeClipKey('a.mp4', 11))
    expect(makeClipKey('a.mp4', 10)).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('makeIgnoreMatcher', () => {
  const ignore = makeIgnoreMatcher(['.sfk', 'thumb_cache', '*.tmp', '*.part'])
  it('matches the defaults', () => {
    expect(ignore('clip.mp4.sfk')).toBe(true)
    expect(ignore('thumb_cache')).toBe(true)
    expect(ignore('x.TMP')).toBe(true)
    expect(ignore('y.part')).toBe(true)
    expect(ignore('clip.mp4')).toBe(false)
  })
})

describe('folderHints', () => {
  it('lists subfolders under the watched folder', () => {
    expect(folderHints('/a/b', '/a/b/Air dribbles/2024')).toEqual(['Air dribbles', '2024'])
    expect(folderHints('/a/b', '/a/b')).toEqual([])
  })
})

describe('parseRange', () => {
  it('handles the common forms', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=2000-', 1000)).toBeNull()
    expect(parseRange('nonsense', 1000)).toBeNull()
  })
})

describe('user logic', () => {
  it('derives status', () => {
    expect(clipStatus(EMPTY_CLIP_USER)).toBe('new')
    expect(clipStatus({ ...EMPTY_CLIP_USER, watched: true })).toBe('watched')
    expect(clipStatus({ ...EMPTY_CLIP_USER, watched: true, tags: ['t'] })).toBe('tagged')
    expect(clipStatus({ ...EMPTY_CLIP_USER, tags: ['t'], used: true })).toBe('used')
  })
  it('applies patches without duplicates', () => {
    const u = applyPatch(EMPTY_CLIP_USER, { addTags: ['a', 'b'] })
    const v = applyPatch(u, { addTags: ['b', 'c'], removeTags: ['a'], set: { rating: 4 } })
    expect(v.tags).toEqual(['b', 'c'])
    expect(v.rating).toBe(4)
  })
})

describe('keymap', () => {
  it('builds chords and finds conflicts', () => {
    expect(chordFromEvent({ key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe('Ctrl+K')
    expect(chordFromEvent({ key: ' ', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe('Space')
    expect(chordFromEvent({ key: 'Shift', ctrlKey: false, metaKey: false, altKey: false, shiftKey: true })).toBeNull()
    const map = effectiveKeymap({})
    expect(findConflict(map, 'R', 'playPause')).toBe('random')
    expect(findConflict(map, 'F9', 'playPause')).toBeNull()
  })
})
