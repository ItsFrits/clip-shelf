import { mkdirSync, realpathSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { makeClipKey } from '../src/main/lib/naming'
import { makeMp4, tmpDir } from '../tests/helpers'

/** A clip of the fixture library. */
export interface FixtureClip {
  /** File name without extension, the library shows it on the card. */
  name: string
  /** The key the app gives this clip. */
  key: string
}

export interface Fixture {
  /** The temporary folder that holds everything of one run. */
  root: string
  /** The user data folder of the app under test. */
  dataDir: string
  clips: [FixtureClip, FixtureClip, FixtureClip, FixtureClip]
}

/** The names of the two audio tracks of the third clip. */
export const TRACK_NAMES = ['Game audio', 'Microphone']

/** Make a temporary user data folder and a folder with four tiny clips that the app already knows. */
export function makeFixture(): Fixture {
  const root = realpathSync.native(tmpDir('clipshelf-e2e-'))
  const dataDir = join(root, 'data')
  const clipDir = join(root, 'clips')
  mkdirSync(dataDir)
  mkdirSync(clipDir)

  const clip = (name: string, trackNames: string[] = ['Game audio']): FixtureClip => {
    const fileName = `${name}.mp4`
    const file = join(clipDir, fileName)
    makeMp4(file, trackNames.length, 3, trackNames)
    return { name, key: makeClipKey(fileName, statSync(file).size) }
  }

  const clips: Fixture['clips'] = [
    clip('Replay 2026-10-09 20-00-00'),
    clip('Replay 2026-10-09 20-05-00'),
    clip('Replay 2026-10-09 20-10-00', TRACK_NAMES),
    clip('Replay 2026-10-10 21-00-00')
  ]

  // A test cannot click the folder dialog of the system, so the folder is written down up front.
  // The app fills in everything that is left out here.
  const folder = {
    id: 'e2e-folder',
    path: clipDir,
    name: 'Fixtures',
    includeSubfolders: true,
    pairAudio: true,
    suggestTags: false
  }
  writeFileSync(join(dataDir, 'userdata.json'), JSON.stringify({ v: 1, folders: [folder] }))

  return { root, dataDir, clips }
}
