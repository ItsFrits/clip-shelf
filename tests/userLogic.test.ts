import { describe, expect, it } from 'vitest'
import {
  applyPatch,
  cleanSuggestions,
  clipStatus,
  EMPTY_CLIP_USER,
  parentDir,
  suggestedTags,
  trackProfileKey
} from '../src/shared/userLogic'
import type { Tag } from '../src/shared/types'

describe('applyPatch', () => {
  it('marks a clip as watched when it gets a tag', () => {
    const next = applyPatch(EMPTY_CLIP_USER, { addTags: ['t1'] })
    expect(next.watched).toBe(true)
    expect(clipStatus(next)).toBe('tagged')
  })

  it('marks a clip as watched when it gets a rating or a note', () => {
    expect(applyPatch(EMPTY_CLIP_USER, { set: { rating: 4 } }).watched).toBe(true)
    expect(applyPatch(EMPTY_CLIP_USER, { set: { note: 'nice flick' } }).watched).toBe(true)
  })

  it('does not mark watched for removing things or empty values', () => {
    expect(applyPatch(EMPTY_CLIP_USER, { set: { rating: 0 } }).watched).toBe(false)
    expect(applyPatch(EMPTY_CLIP_USER, { set: { note: '   ' } }).watched).toBe(false)
    expect(applyPatch(EMPTY_CLIP_USER, { removeTags: ['t1'] }).watched).toBe(false)
  })

  it('does not change an existing rating that is only sent again', () => {
    const rated = { ...EMPTY_CLIP_USER, rating: 3 }
    expect(applyPatch(rated, { set: { rating: 3 } }).watched).toBe(false)
  })

  it('lets an explicit watched value win', () => {
    const next = applyPatch(EMPTY_CLIP_USER, { addTags: ['t1'], set: { watched: false } })
    expect(next.watched).toBe(false)
    const seen = { ...EMPTY_CLIP_USER, watched: true }
    expect(applyPatch(seen, { set: { watched: false } }).watched).toBe(false)
  })
})

describe('track profiles', () => {
  it('finds the folder of a file', () => {
    expect(parentDir("D:\\Video's\\OBS\\clip.mp4")).toBe("D:\\Video's\\OBS")
    expect(parentDir('/home/me/OBS/clip.mp4')).toBe('/home/me/OBS')
  })

  it('shares settings between clips in the same folder with the same tracks only', () => {
    const a = trackProfileKey("D:\\Video's\\OBS", ['Game audio', 'Discord'])
    expect(trackProfileKey("d:/video's/obs", ['Game audio', 'Discord'])).toBe(a)
    expect(trackProfileKey("D:\\Video's\\OBS", ['Discord', 'Game audio'])).not.toBe(a)
    expect(trackProfileKey("D:\\Video's\\ReLive", ['Game audio', 'Discord'])).not.toBe(a)
  })
})

describe('tag suggestions', () => {
  const tags: Tag[] = [
    { id: 'air', name: 'Air dribble', suggests: ['g2a', 'wall'] },
    { id: 'g2a', name: 'Ground to air' },
    { id: 'wall', name: 'Sidewall' },
    { id: 'flick', name: 'Flip reset', suggests: ['air'] }
  ]

  it('suggests the tags that belong to a tag on the clip', () => {
    expect(suggestedTags(['air'], tags).map((t) => t.id)).toEqual(['g2a', 'wall'])
  })

  it('works one way only', () => {
    expect(suggestedTags(['wall'], tags)).toEqual([])
    expect(suggestedTags(['g2a'], tags)).toEqual([])
  })

  it('skips tags that are already on the clip and does not repeat tags', () => {
    expect(suggestedTags(['air', 'g2a'], tags).map((t) => t.id)).toEqual(['wall'])
    const twice: Tag[] = [...tags.slice(0, 3), { id: 'flick', name: 'Flip reset', suggests: ['wall', 'air'] }]
    expect(suggestedTags(['air', 'flick'], twice).map((t) => t.id)).toEqual(['wall', 'g2a'])
  })

  it('puts suggestions of the most recently added tag first', () => {
    expect(suggestedTags(['wall', 'flick', 'g2a'], tags).map((t) => t.id)).toEqual(['air'])
    const ids = suggestedTags(['flick', 'air'], tags).map((t) => t.id)
    expect(ids).toEqual(['g2a', 'wall'])
  })

  it('removes and remaps ids after a delete or merge', () => {
    const deleted = cleanSuggestions(tags.filter((t) => t.id !== 'g2a'), new Set(['g2a']), null)
    expect(deleted.find((t) => t.id === 'air')?.suggests).toEqual(['wall'])

    const merged = cleanSuggestions(tags.filter((t) => t.id !== 'g2a'), new Set(['g2a']), 'wall')
    expect(merged.find((t) => t.id === 'air')?.suggests).toEqual(['wall'])

    const self = cleanSuggestions(tags.filter((t) => t.id !== 'air'), new Set(['air']), 'flick')
    expect('suggests' in self.find((t) => t.id === 'flick')!).toBe(false)
  })
})
