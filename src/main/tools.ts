import { chmodSync } from 'fs'
import { sep } from 'path'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import { MediaTools } from './media'

/** Inside an installed app the binaries live next to app.asar, not inside it. */
function unpacked(path: string): string {
  return path.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
}

/** Some package managers unpack the binaries without the executable flag (not an issue on Windows). */
function ensureExecutable(path: string): string {
  if (process.platform !== 'win32') {
    try {
      chmodSync(path, 0o755)
    } catch {
      /* read-only location, hope it already works */
    }
  }
  return path
}

export function createMediaTools(): MediaTools {
  return new MediaTools(
    ensureExecutable(process.env.CLIPSHELF_FFMPEG || unpacked(ffmpegInstaller.path)),
    ensureExecutable(process.env.CLIPSHELF_FFPROBE || unpacked(ffprobeInstaller.path))
  )
}
