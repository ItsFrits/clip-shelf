import { execFileSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createMediaTools } from '../src/main/tools'
import { join } from 'path'

export const tools = createMediaTools()

export function tmpDir(prefix = 'clipshelf-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** Make a tiny real mp4 with the given number of audio tracks (sine tones of different pitch). */
export function makeMp4(file: string, audioTracks: number, seconds = 3, trackNames: string[] = []): void {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=320x180:rate=30:duration=${seconds}`]
  for (let i = 0; i < audioTracks; i++) {
    args.push('-f', 'lavfi', '-i', `sine=frequency=${440 * (i + 1)}:duration=${seconds}`)
  }
  args.push('-map', '0:v')
  for (let i = 0; i < audioTracks; i++) args.push('-map', `${i + 1}:a`)
  trackNames.forEach((n, i) => args.push(`-metadata:s:a:${i}`, `handler_name=${n}`))
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file)
  execFileSync(tools.ffmpegPath, args)
}

export function makeM4a(file: string, seconds = 3): void {
  execFileSync(tools.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${seconds}`, '-c:a', 'aac', file])
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function waitFor(cond: () => boolean, timeoutMs = 15000, label = 'condition'): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for ' + label)
    await sleep(50)
  }
}
