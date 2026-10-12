import { createReadStream, promises as fsp } from 'fs'
import { extname } from 'path'
import { Readable } from 'stream'

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.jpg': 'image/jpeg'
}

/** Parse "bytes=0-1023", "bytes=500-" or "bytes=-500". Returns null if it cannot be satisfied. */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  let start: number
  let end: number
  if (m[1] === '' && m[2] === '') return null
  if (m[1] === '') {
    const n = Number(m[2])
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start > end || start >= size) return null
  return { start, end }
}

/** Answer a request for a local file, including partial content for seeking in video. */
export async function serveFile(path: string, rangeHeader: string | null): Promise<Response> {
  let size: number
  try {
    const st = await fsp.stat(path)
    if (!st.isFile()) return new Response('Not found', { status: 404 })
    size = st.size
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const headers: Record<string, string> = {
    'Content-Type': MIME[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    // Web Audio needs cross-origin approval to read media from a custom scheme.
    'Access-Control-Allow-Origin': '*'
  }
  if (size === 0) return new Response(null, { status: 200, headers: { ...headers, 'Content-Length': '0' } })

  let start = 0
  let end = size - 1
  let status = 200
  if (rangeHeader) {
    const r = parseRange(rangeHeader, size)
    if (!r) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
    }
    start = r.start
    end = r.end
    status = 206
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
  }
  headers['Content-Length'] = String(end - start + 1)
  const stream = createReadStream(path, { start, end })
  stream.on('error', () => stream.destroy())
  const body = Readable.toWeb(stream) as unknown as ReadableStream
  return new Response(body, { status, headers })
}
