import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { readMp4AudioTrackNames } from '../src/main/media'
import { makeMp4, tmpDir, tools } from './helpers'

const dir = tmpDir()

describe('audio track names', () => {
  it('reads the track title that OBS style recorders store inside the track', async () => {
    const file = join(dir, 'obs.mp4')
    makeMp4(file, 3, 1, ['Game audio', 'Discord', 'Music'], 'title')
    expect(await readMp4AudioTrackNames(file)).toEqual(['Game audio', 'Discord', 'Music'])
    // The ffprobe we ship does not show these titles itself.
    const info = await tools.probe(file)
    expect(info.audioTracks?.map((t) => t.title)).toEqual(['Game audio', 'Discord', 'Music'])
  })

  it('still reads names from the handler name', async () => {
    const file = join(dir, 'nvidia.mp4')
    makeMp4(file, 2, 1, ['Game', 'Mic'], 'handler_name')
    const info = await tools.probe(file)
    expect(info.audioTracks?.map((t) => t.title)).toEqual(['Game', 'Mic'])
  })

  it('gives no name for tracks nobody named', async () => {
    const file = join(dir, 'plain.mp4')
    makeMp4(file, 2, 1)
    const info = await tools.probe(file)
    expect(info.audioTracks?.map((t) => t.title)).toEqual([undefined, undefined])
  })

  it('does not fail on a file that is not an mp4', async () => {
    const file = join(dir, 'x.mp4')
    const { writeFileSync } = await import('fs')
    writeFileSync(file, 'not a video')
    expect(await readMp4AudioTrackNames(file)).toEqual([])
  })
})
