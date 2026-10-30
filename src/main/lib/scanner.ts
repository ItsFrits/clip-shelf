import { promises as fsp } from 'fs'
import { extname, join } from 'path'
import { AUDIO_EXTS, VIDEO_EXTS, folderHints, stem } from './naming'

export interface ScannedVideo {
  path: string
  size: number
  mtimeMs: number
  audioPath?: string
  /** Names of the subfolders between the watched folder and the file. */
  hints: string[]
}

export interface ScanOptions {
  includeSubfolders: boolean
  pairAudio: boolean
  ignore: (name: string) => boolean
}

export interface ScanResult {
  /** False when part of the folder could not be read. Then nothing may be treated as deleted. */
  ok: boolean
  videos: ScannedVideo[]
}

/** Run an async function over a list with a limited number of calls in flight. */
export async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      await fn(items[i])
    }
  })
  await Promise.all(workers)
}

export function isVideoFile(name: string): boolean {
  return VIDEO_EXTS.includes(extname(name).toLowerCase())
}

export function isAudioFile(name: string): boolean {
  return AUDIO_EXTS.includes(extname(name).toLowerCase())
}

/** Walk a watched folder and list every video, paired with its separate audio file if there is one. */
export async function scanFolder(root: string, opts: ScanOptions): Promise<ScanResult> {
  let ok = true
  const found: { dir: string; video: string; audio?: string }[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      ok = false
      return
    }
    const audioByStem = new Map<string, string>()
    const videos: string[] = []
    const subdirs: string[] = []
    for (const e of entries) {
      if (opts.ignore(e.name)) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (opts.includeSubfolders) subdirs.push(full)
      } else if (e.isFile()) {
        if (isVideoFile(e.name)) videos.push(full)
        else if (opts.pairAudio && isAudioFile(e.name)) {
          const s = stem(e.name).toLowerCase()
          // If there are several (for example .m4a and .wav), the first extension in AUDIO_EXTS wins.
          const prev = audioByStem.get(s)
          if (
            !prev ||
            AUDIO_EXTS.indexOf(extname(full).toLowerCase()) <
              AUDIO_EXTS.indexOf(extname(prev).toLowerCase())
          ) {
            audioByStem.set(s, full)
          }
        }
      }
    }
    for (const v of videos) {
      found.push({ dir, video: v, audio: audioByStem.get(stem(v).toLowerCase()) })
    }
    for (const sub of subdirs) await walk(sub)
  }

  await walk(root)

  const videos: ScannedVideo[] = []
  await mapLimit(found, 32, async (f) => {
    try {
      const st = await fsp.stat(f.video)
      videos.push({
        path: f.video,
        size: st.size,
        mtimeMs: st.mtimeMs,
        audioPath: f.audio,
        hints: folderHints(root, f.dir)
      })
    } catch {
      ok = false
    }
  })
  videos.sort((a, b) => (a.path < b.path ? -1 : 1))
  return { ok, videos }
}

/** Look at a single video file, used by the folder watcher. Returns null if it is gone or unreadable. */
export async function scanOne(
  root: string,
  videoPath: string,
  dir: string,
  pairAudio: boolean
): Promise<ScannedVideo | null> {
  try {
    const st = await fsp.stat(videoPath)
    if (!st.isFile()) return null
    let audioPath: string | undefined
    if (pairAudio) {
      const base = join(dir, stem(videoPath))
      for (const ext of AUDIO_EXTS) {
        for (const e of [ext, ext.toUpperCase()]) {
          try {
            await fsp.access(base + e)
            audioPath = base + e
            break
          } catch {
            /* try the next one */
          }
        }
        if (audioPath) break
      }
    }
    return {
      path: videoPath,
      size: st.size,
      mtimeMs: st.mtimeMs,
      audioPath,
      hints: folderHints(root, dir)
    }
  } catch {
    return null
  }
}
