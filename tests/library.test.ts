import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Library } from '../src/main/library'
import { UserDataStore } from '../src/main/userData'
import type { Clip, LibraryDelta } from '../src/shared/types'
import { makeM4a, makeMp4, sleep, tmpDir, tools, waitFor } from './helpers'

const root = tmpDir()
const obs = join(root, 'OBS')
const relive = join(root, 'ReLive')
const data = join(root, 'data')

const OBS_NAME = 'Replay 2026-10-09 23-45-30.mp4'
const RELIVE_NAME = 'Rocket League_replay_2025.08.02-11.26.mp4'

let lib: Library
let user: UserDataStore
const deltas: LibraryDelta[] = []

function clipByName(name: string): Clip | undefined {
  return lib.allClips().find((c) => name.startsWith(c.name))
}

beforeAll(async () => {
  mkdirSync(join(obs, 'Flicks'), { recursive: true })
  mkdirSync(join(obs, 'thumb_cache'), { recursive: true })
  mkdirSync(relive, { recursive: true })
  makeMp4(join(obs, OBS_NAME), 2, 3, ['Game audio', 'Discord'])
  copyFileSync(join(obs, OBS_NAME), join(obs, 'Flicks', OBS_NAME)) // same clip twice
  writeFileSync(join(obs, 'thumb_cache', 'ignored.mp4'), 'x')
  writeFileSync(join(obs, 'half.mp4.tmp'), 'x')
  writeFileSync(join(obs, 'clip.mp4.sfk'), 'x')
  makeMp4(join(relive, RELIVE_NAME), 1)
  makeM4a(join(relive, RELIVE_NAME.replace('.mp4', '.m4a')))

  user = new UserDataStore(join(data, 'userdata.json'))
  user.addFolder({ path: obs, name: 'OBS', includeSubfolders: true, pairAudio: true, suggestTags: true })
  user.addFolder({ path: relive, name: 'ReLive', includeSubfolders: false, pairAudio: true, suggestTags: true })
  lib = new Library({
    user,
    indexFile: join(data, 'index.json'),
    thumbDir: join(data, 'thumbs'),
    audioDir: join(data, 'audio'),
    tools,
    emit: (event, payload) => {
      if (event === 'library:delta') deltas.push(payload as LibraryDelta)
    },
    pollMs: 200,
    settleMs: 300
  })
  await lib.start()
  await waitFor(() => lib.allClips().length === 2, 15000, 'initial scan')
  await lib.idle()
}, 60000)

afterAll(async () => {
  lib.dispose()
  await sleep(500)
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* Windows can keep a watched folder locked for a moment, the temp folder gets cleaned up later */
  }
})

describe('Library', () => {
  it('finds clips, merges duplicates and ignores junk', () => {
    const clips = lib.allClips()
    expect(clips).toHaveLength(2)
    const obsClip = clipByName(OBS_NAME)!
    expect(obsClip.files).toHaveLength(2)
    expect(obsClip.date).toBe(new Date(2026, 9, 9, 23, 45, 30).getTime())
    expect(obsClip.hints).toEqual(['Flicks'])
  })

  it('pairs the separate audio file', () => {
    const c = clipByName(RELIVE_NAME)!
    expect(c.files[0].audioPath).toMatch(/\.m4a$/)
  })

  it('probes and makes thumbnails', async () => {
    await waitFor(() => lib.allClips().every((c) => c.hasThumb && c.durationMs), 20000, 'thumbnails')
    const c = clipByName(OBS_NAME)!
    expect(c.width).toBe(320)
    expect(c.height).toBe(180)
    expect(c.fps).toBe(30)
    expect(c.audioTracks).toHaveLength(2)
    expect(c.durationMs).toBeGreaterThan(2500)
    expect(existsSync(lib.thumbPath(c.key)!)).toBe(true)
  })

  it('copies out several embedded audio tracks', async () => {
    const c = clipByName(OBS_NAME)!
    const prepared = await lib.prepareAudio(c.key)
    expect(prepared.useVideoAudio).toBe(false)
    expect(prepared.tracks).toHaveLength(2)
    expect(prepared.tracks.map((t) => t.label)).toEqual(['Game audio', 'Discord'])
    expect(prepared.tracks.map((t) => t.number)).toEqual(['Track 1', 'Track 2'])
    expect(lib.extractedAudioPath(c.key, 0)).toBeTruthy()
    expect(lib.extractedAudioPath(c.key, 1)).toBeTruthy()
    expect(lib.extractedAudioPath(c.key, 2)).toBeNull()
  })

  it('uses the video audio plus the mic file for a ReLive clip', async () => {
    const c = clipByName(RELIVE_NAME)!
    const prepared = await lib.prepareAudio(c.key)
    expect(prepared.useVideoAudio).toBe(true)
    expect(prepared.tracks.map((t) => t.kind)).toEqual(['embedded', 'file'])
    expect(lib.auxPath(c.key)).toMatch(/\.m4a$/)
  })

  it('picks up a new file while watching', async () => {
    makeMp4(join(relive, 'Rocket League_replay_2025.09.01-12.00.mp4'), 1, 2)
    await waitFor(() => lib.allClips().length === 3, 15000, 'new file')
    await waitFor(() => lib.allClips().every((c) => c.hasThumb), 20000, 'thumb for new file')
  })

  it('forgets a deleted file', async () => {
    rmSync(join(relive, 'Rocket League_replay_2025.09.01-12.00.mp4'))
    await waitFor(() => lib.allClips().length === 2, 15000, 'removal')
  })

  // Windows does not allow renaming a folder that is being watched, so this is checked on other systems only.
  it.skipIf(process.platform === 'win32')('keeps clips of a folder that goes offline', async () => {
    renameSync(relive, relive + '-gone')
    await waitFor(() => lib.folderInfos().find((f) => f.name === 'ReLive')?.online === false, 10000, 'offline')
    expect(lib.allClips()).toHaveLength(2)
    expect(lib.primaryPath(clipByName(RELIVE_NAME)!.key)).toBeNull()
    renameSync(relive + '-gone', relive)
    await waitFor(() => lib.folderInfos().find((f) => f.name === 'ReLive')?.online === true, 10000, 'online again')
    await lib.idle()
    expect(lib.allClips()).toHaveLength(2)
  })

  it('trashes all copies and the paired audio', async () => {
    const trashed: string[] = []
    const c = clipByName(RELIVE_NAME)!
    const res = await lib.trashClips([c.key], async (p) => {
      trashed.push(p)
      rmSync(p)
    })
    expect(res.trashed).toBe(1)
    expect(trashed).toHaveLength(2)
    expect(lib.allClips()).toHaveLength(1)
  })

  it('sent deltas to the window', () => {
    expect(deltas.some((d) => d.upserts.length > 0)).toBe(true)
    expect(deltas.some((d) => d.removes.length > 0)).toBe(true)
  })
})
