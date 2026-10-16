import { BrowserWindow, screen } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { sanitizeWindowState, type WindowState } from '../shared/windowState'

/** Read the saved window position and size from the last session, checked against the current screens. */
export function loadWindowState(
  file: string,
  fallback: { width: number; height: number },
  min: { width: number; height: number }
): WindowState {
  let raw: unknown = null
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // First start, or the file is unreadable. The defaults are fine.
  }
  const displays = screen.getAllDisplays().map((d) => d.workArea)
  return sanitizeWindowState(raw, displays, fallback, min)
}

/** Save the window's position, size and maximized state whenever it changes. */
export function trackWindowState(win: BrowserWindow, file: string): void {
  let timer: NodeJS.Timeout | null = null
  const save = (): void => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
    const b = win.getNormalBounds()
    const state: WindowState = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() }
    try {
      writeFileSync(file, JSON.stringify(state))
    } catch (err) {
      console.error('Could not save the window position:', err)
    }
  }
  const later = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, 500)
  }
  win.on('resize', later)
  win.on('move', later)
  win.on('maximize', later)
  win.on('unmaximize', later)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    save()
  })
}
