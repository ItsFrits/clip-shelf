import { createHash } from 'crypto'
import { basename, extname, relative, sep } from 'path'

export const VIDEO_EXTS = ['.mp4']
export const AUDIO_EXTS = ['.m4a', '.wav', '.aac', '.mp3']

/** File name without its extension. */
export function stem(file: string): string {
  const b = basename(file)
  const e = extname(b)
  return e ? b.slice(0, -e.length) : b
}

/**
 * Stable id for a clip. It only depends on the file name and size, so moving a file to another
 * folder keeps its tags, and the same clip in two places is merged into one.
 */
export function makeClipKey(fileName: string, size: number): string {
  return createHash('sha1')
    .update(`${stem(fileName).toLowerCase()}|${size}`)
    .digest('hex')
    .slice(0, 16)
}

// Matches the recording time in names from OBS, Radeon ReLive, NVIDIA and most other recorders:
//   Replay 2026-10-09 23-45-30.mp4
//   Rocket League 2024.10.23 - 19.01.35.22.DVR.mp4
//   Rocket League_replay_2025.08.02-11.26.mp4
const DATE_RE = /(20\d{2})[-._](\d{2})[-._](\d{2})[ _T-]+(\d{2})[-.:](\d{2})(?:[-.:](\d{2}))?/

/** Recording time (local time) from a file name, or null if the name has no date. */
export function parseDateFromName(name: string): number | null {
  const m = DATE_RE.exec(name)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const h = Number(m[4])
  const mi = Number(m[5])
  const s = m[6] ? Number(m[6]) : 0
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null
  const dt = new Date(y, mo - 1, d, h, mi, s)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt.getTime()
}

/** Build a matcher for ignore patterns such as ".sfk", "thumb_cache" or "*.tmp". */
export function makeIgnoreMatcher(patterns: string[]): (name: string) => boolean {
  const regs = patterns
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      if (p.startsWith('.') && !p.includes('*')) p = '*' + p
      const esc = p
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
      return new RegExp(`^${esc}$`, 'i')
    })
  return (name) => regs.some((r) => r.test(name))
}

/** Names of the folders between the watched folder and the file, used as tag suggestions. */
export function folderHints(root: string, fileDir: string): string[] {
  const rel = relative(root, fileDir)
  if (!rel || rel.startsWith('..')) return []
  return rel.split(sep).filter((s) => s && s !== '.' && s !== '..')
}
