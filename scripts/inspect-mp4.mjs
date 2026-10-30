// Prints the box structure of an mp4 and every text it contains, so we can see where
// a recorder (OBS, NVIDIA, ...) stores the names of audio tracks.
// Usage: node scripts/inspect-mp4.mjs "path/to/clip.mp4"
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/inspect-mp4.mjs "path/to/clip.mp4"')
  process.exit(1)
}
const fd = openSync(file, 'r')
const size = fstatSync(fd).size

// Boxes that only contain other boxes.
const CONTAINERS = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'udta',
  'edts',
  'dinf',
  'moof',
  'traf',
  'mvex'
])
// 'meta' is a container too, but a full box (4 extra bytes) in mp4 and a plain box in QuickTime.

function read(pos, len) {
  const buf = Buffer.alloc(len)
  const n = readSync(fd, buf, 0, len, pos)
  return buf.subarray(0, n)
}

function printable(buf) {
  const text = buf.toString('utf8').replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '·')
  return text.replace(/·{2,}/g, ' ').trim()
}

function walk(start, end, depth, path) {
  let pos = start
  while (pos + 8 <= end) {
    const head = read(pos, 16)
    let boxSize = head.readUInt32BE(0)
    const type = head.toString('latin1', 4, 8)
    let headerLen = 8
    if (boxSize === 1) {
      boxSize = Number(head.readBigUInt64BE(8))
      headerLen = 16
    } else if (boxSize === 0) {
      boxSize = end - pos
    }
    if (boxSize < headerLen || pos + boxSize > end) break
    const here = path ? `${path}/${type}` : type
    const indent = '  '.repeat(depth)
    const bodyStart = pos + headerLen
    const bodyLen = boxSize - headerLen

    if (type === 'mdat') {
      console.log(`${indent}${type} (${bodyLen} bytes, skipped)`)
    } else if (type === 'meta') {
      console.log(`${indent}${type}`)
      // Skip the 4 byte version/flags when present (mp4), not for QuickTime.
      const first = read(bodyStart, 8)
      const looksFull = first.readUInt32BE(0) === 0
      walk(bodyStart + (looksFull ? 4 : 0), pos + boxSize, depth + 1, here)
    } else if (CONTAINERS.has(type)) {
      console.log(`${indent}${type}`)
      walk(bodyStart, pos + boxSize, depth + 1, here)
    } else if (type === 'hdlr') {
      const body = read(bodyStart, Math.min(bodyLen, 256))
      const handler = body.toString('latin1', 8, 12)
      console.log(`${indent}hdlr  type=${handler}  name="${printable(body.subarray(24))}"`)
    } else if (
      bodyLen <= 512 &&
      ['name', 'titl', 'ilst', 'data', '©nam', 'desc', 'cprt', 'tkhd'].includes(type) === false
    ) {
      // Unknown small boxes: show the text in them if there is any.
      const body = read(bodyStart, bodyLen)
      const text = printable(body)
      console.log(
        `${indent}${type}  ${bodyLen} bytes${text.length >= 3 ? `  text="${text.slice(0, 120)}"` : ''}`
      )
    } else if (type === 'ilst' || type === 'tkhd') {
      console.log(`${indent}${type}  ${bodyLen} bytes`)
    } else {
      const body = read(bodyStart, Math.min(bodyLen, 400))
      console.log(`${indent}${type}  ${bodyLen} bytes  text="${printable(body).slice(0, 160)}"`)
    }
    pos += boxSize
  }
}

walk(0, size, 0, '')
closeSync(fd)
