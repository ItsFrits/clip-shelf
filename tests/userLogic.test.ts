import { describe, expect, it } from 'vitest'
import { applyPatch, clipStatus, EMPTY_CLIP_USER, parentDir, trackProfileKey } from '../src/shared/userLogic'

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
