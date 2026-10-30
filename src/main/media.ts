import { spawn } from 'child_process'
import { promises as fsp } from 'fs'
import { dirname, join } from 'path'
import type { AudioTrackInfo } from '../shared/types'

/** Bump this when the probe reads more information, so old results are read again. */
export const PROBE_REV = 3

export interface ProbeInfo {
  rev?: number
  durationMs?: number
  width?: number
  height?: number
  fps?: number
  audioTracks?: AudioTrackInfo[]
  failed?: boolean
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const done = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }
    let child
    try {
      child = spawn(cmd, args, { windowsHide: true })
    } catch (err) {
      stderr = String(err)
      resolve({ code: null, stdout, stderr })
      return
    }
    const timer = setTimeout(() => {
      stderr += '\n(timed out)'
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      if (stderr.length < 8000) stderr += d
    })
    child.on('error', (err) => {
      stderr += String(err)
      done(null)
    })
    child.on('close', (code) => done(code))
  })
}

/** The parts of an ffprobe stream that are used here. */
interface ProbeStream {
  codec_type?: string
  codec_name?: string
  channels?: number
  duration?: string | number
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  disposition?: { attached_pic?: number }
  tags?: Record<string, unknown>
}

function parseFps(rate: string | undefined): number | undefined {
  if (!rate) return undefined
  const [a, b] = rate.split('/').map(Number)
  if (!a || !b) return undefined
  return Math.round((a / b) * 100) / 100
}

// Names that muxers write when nobody named the track.
const GENERIC_TITLES = /^(.*handler.*|isom|mp4|audio|stereo|mono|aac|und|core media audio)$/i

/** The name of an audio track as stored in the file (tag names differ between muxers). */
export function trackName(tags: Record<string, unknown> | undefined): string | undefined {
  if (!tags) return undefined
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(tags)) lower[k.toLowerCase()] = String(v ?? '').trim()
  for (const key of ['title', 'name', 'handler_name']) {
    const v = lower[key]
    if (v && !GENERIC_TITLES.test(v)) return v
  }
  return undefined
}

/**
 * Track names that ffprobe does not show. OBS and other ffmpeg based recorders store a track's
 * title in a "name" box inside the track (trak/udta/name), which the ffprobe we ship skips.
 * Windows Photos reads that box, so we read it too. Returns one entry per audio track, in order.
 */
export async function readMp4AudioTrackNames(file: string): Promise<(string | undefined)[]> {
  const MAX_MOOV = 64 * 1024 * 1024
  const fh = await fsp.open(file, 'r')
  try {
    const { size } = await fh.stat()
    // Find the moov box. It sits at the start or the end of the file, with the media data in between.
    let pos = 0
    let moov: Buffer | null = null
    const head = Buffer.alloc(16)
    while (pos + 8 <= size) {
      const { bytesRead } = await fh.read(head, 0, 16, pos)
      if (bytesRead < 8) break
      let boxSize = head.readUInt32BE(0)
      const type = head.toString('latin1', 4, 8)
      let headerLen = 8
      if (boxSize === 1 && bytesRead >= 16) {
        boxSize = Number(head.readBigUInt64BE(8))
        headerLen = 16
      } else if (boxSize === 0) {
        boxSize = size - pos
      }
      if (boxSize < headerLen) break
      if (type === 'moov') {
        const len = boxSize - headerLen
        if (len > MAX_MOOV) return []
        moov = Buffer.alloc(len)
        await fh.read(moov, 0, len, pos + headerLen)
        break
      }
      pos += boxSize
    }
    return moov ? namesFromMoov(moov) : []
  } finally {
    await fh.close()
  }
}

function* boxes(
  buf: Buffer,
  start: number,
  end: number
): Generator<{ type: string; from: number; to: number }> {
  let pos = start
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos)
    const type = buf.toString('latin1', pos + 4, pos + 8)
    let header = 8
    if (size === 1 && pos + 16 <= end) {
      size = Number(buf.readBigUInt64BE(pos + 8))
      header = 16
    } else if (size === 0) {
      size = end - pos
    }
    if (size < header || pos + size > end) return
    yield { type, from: pos + header, to: pos + size }
    pos += size
  }
}

function namesFromMoov(moov: Buffer): (string | undefined)[] {
  const names: (string | undefined)[] = []
  for (const trak of boxes(moov, 0, moov.length)) {
    if (trak.type !== 'trak') continue
    let isAudio = false
    let name: string | undefined
    for (const child of boxes(moov, trak.from, trak.to)) {
      if (child.type === 'mdia') {
        for (const m of boxes(moov, child.from, child.to)) {
          // hdlr: version/flags (4), predefined (4), handler type (4), ...
          if (m.type === 'hdlr' && m.to - m.from >= 12)
            isAudio = moov.toString('latin1', m.from + 8, m.from + 12) === 'soun'
        }
      } else if (child.type === 'udta') {
        for (const u of boxes(moov, child.from, child.to)) {
          if (u.type === 'name') {
            const text = moov.toString('utf8', u.from, u.to).replace(/\0/g, '').trim()
            if (text && !name) name = text
          }
        }
      }
    }
    if (isAudio) names.push(name && !GENERIC_TITLES.test(name) ? name : undefined)
  }
  return names
}

/** Thin wrapper around ffprobe and ffmpeg. */
export class MediaTools {
  constructor(
    public ffmpegPath: string,
    public ffprobePath: string
  ) {}

  async probe(file: string): Promise<ProbeInfo> {
    const res = await run(
      this.ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
      60_000
    )
    if (res.code !== 0) return { rev: PROBE_REV, failed: true }
    try {
      const json = JSON.parse(res.stdout)
      const streams: ProbeStream[] = json.streams ?? []
      const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
      const audio = streams.filter((s) => s.codec_type === 'audio')
      const dur = Number(json.format?.duration ?? video?.duration)
      let boxNames: (string | undefined)[] = []
      try {
        boxNames = await readMp4AudioTrackNames(file)
      } catch {
        /* not an mp4, or unreadable: the ffprobe tags are used instead */
      }
      const info: ProbeInfo = {
        rev: PROBE_REV,
        durationMs: Number.isFinite(dur) && dur > 0 ? Math.round(dur * 1000) : undefined,
        width: video?.width,
        height: video?.height,
        fps: parseFps(video?.avg_frame_rate ?? video?.r_frame_rate),
        audioTracks: audio.map((s, i) => ({
          index: i,
          codec: String(s.codec_name ?? 'unknown'),
          channels: Number(s.channels ?? 2),
          title: boxNames[i] ?? trackName(s.tags)
        }))
      }
      if (!video && audio.length === 0) return { rev: PROBE_REV, failed: true }
      return info
    } catch {
      return { rev: PROBE_REV, failed: true }
    }
  }

  /** Write one JPEG frame. `atMs` is where in the video to take it. */
  async thumbnail(file: string, atMs: number, out: string, width = 480): Promise<boolean> {
    await fsp.mkdir(dirname(out), { recursive: true })
    const tmp = out + '.part'
    const res = await run(
      this.ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        (Math.max(0, atMs) / 1000).toFixed(3),
        '-i',
        file,
        '-frames:v',
        '1',
        '-vf',
        `scale=${width}:-2`,
        '-q:v',
        '5',
        '-f',
        'image2',
        '-update',
        '1',
        tmp
      ],
      60_000
    )
    try {
      const st = await fsp.stat(tmp)
      if (res.code === 0 && st.size > 0) {
        await fsp.rename(tmp, out)
        return true
      }
    } catch {
      /* no output */
    }
    await fsp.rm(tmp, { force: true })
    return false
  }

  /**
   * Copy the audio tracks out of a video into separate .m4a files, in one pass over the file.
   * AAC is copied as is. Other codecs are converted to AAC. Returns false if ffmpeg failed.
   */
  async extractAudio(file: string, tracks: AudioTrackInfo[], outDir: string): Promise<boolean> {
    await fsp.mkdir(outDir, { recursive: true })
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vn']
    const outs: { tmp: string; final: string }[] = []
    for (const t of tracks) {
      const final = join(outDir, `${t.index}.m4a`)
      const tmp = final + '.part'
      outs.push({ tmp, final })
      args.push('-map', `0:a:${t.index}`)
      if (t.codec === 'aac') args.push('-c:a', 'copy')
      else args.push('-c:a', 'aac', '-b:a', '160k')
      args.push('-f', 'mp4', '-movflags', '+faststart', tmp)
    }
    const res = await run(this.ffmpegPath, args, 180_000)
    if (res.code !== 0) {
      await Promise.all(outs.map((o) => fsp.rm(o.tmp, { force: true })))
      return false
    }
    for (const o of outs) await fsp.rename(o.tmp, o.final)
    return true
  }
}

export interface QueueProgress {
  pending: number
  total: number
}

/**
 * Work queue with two lanes. Clips that are on screen are bumped to the front lane,
 * everything else waits in the back lane.
 */
export class JobQueue {
  private low: string[] = []
  private high: string[] = []
  private pending = new Set<string>()
  private running = 0
  private total = 0
  private lastEmit = 0
  private emitTimer: NodeJS.Timeout | null = null

  constructor(
    private concurrency: number,
    private worker: (key: string) => Promise<void>,
    private onProgress: (p: QueueProgress) => void
  ) {}

  add(keys: string[]): void {
    for (const k of keys) {
      if (this.pending.has(k)) continue
      this.pending.add(k)
      this.low.push(k)
      this.total++
    }
    this.emit()
    this.pump()
  }

  /** Make these keys the next ones to run. The previous front lane goes back to the normal lane. */
  bump(keys: string[]): void {
    const wanted = keys.filter((k) => this.pending.has(k) && !this.isRunning(k))
    this.low.unshift(...this.high.filter((k) => !wanted.includes(k)))
    this.high = wanted
    const set = new Set(wanted)
    this.low = this.low.filter((k) => !set.has(k))
    this.pump()
  }

  private active = new Set<string>()

  private isRunning(key: string): boolean {
    return this.active.has(key)
  }

  get size(): number {
    return this.pending.size
  }

  private pump(): void {
    while (this.running < this.concurrency) {
      const key = this.high.shift() ?? this.low.shift()
      if (key === undefined) break
      this.running++
      this.active.add(key)
      this.worker(key)
        .catch((err) => console.error('Job failed:', err))
        .finally(() => {
          this.running--
          this.active.delete(key)
          this.pending.delete(key)
          if (this.pending.size === 0) this.total = 0
          this.emit()
          this.pump()
        })
    }
  }

  private emit(): void {
    const now = Date.now()
    const send = (): void => {
      this.lastEmit = Date.now()
      this.onProgress({ pending: this.pending.size, total: this.total })
    }
    if (this.pending.size === 0 || now - this.lastEmit > 400) {
      if (this.emitTimer) clearTimeout(this.emitTimer)
      this.emitTimer = null
      send()
    } else if (!this.emitTimer) {
      this.emitTimer = setTimeout(() => {
        this.emitTimer = null
        send()
      }, 400)
    }
  }
}
