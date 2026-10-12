import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

// The dev server needs inline scripts and a websocket for hot reload. The built app does not.
const CSP_DEV =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: clip:; media-src 'self' clip:; connect-src 'self' clip: ws: http://localhost:*; font-src 'self' data:"
const CSP_PROD =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: clip:; media-src 'self' clip:; connect-src 'self' clip:; font-src 'self' data:"

function cspPlugin(): Plugin {
  return {
    name: 'clip-shelf-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        return html.replace('%CSP%', ctx.server ? CSP_DEV : CSP_PROD)
      }
    }
  }
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), cspPlugin()]
  }
})
