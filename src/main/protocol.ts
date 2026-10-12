import { protocol } from 'electron'
import type { Library } from './library'
import { serveFile } from './lib/serve'

/** Must run before the app is ready. */
export function registerClipScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'clip',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

/**
 * clip://thumb/<key>          thumbnail
 * clip://video/<key>          the video file
 * clip://aux/<key>            separate audio file next to the video
 * clip://audio/<key>/<n>      audio track n copied out of the video
 */
export function handleClipProtocol(library: Library): void {
  protocol.handle('clip', async (request) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    const key = parts[0] ?? ''
    let file: string | null = null
    switch (url.hostname) {
      case 'thumb':
        file = library.thumbPath(key)
        break
      case 'video':
        file = library.primaryPath(key)
        break
      case 'aux':
        file = library.auxPath(key)
        break
      case 'audio':
        file = library.extractedAudioPath(key, Number(parts[1]))
        break
    }
    if (!file) return new Response('Not found', { status: 404 })
    return serveFile(file, request.headers.get('range'))
  })
}
