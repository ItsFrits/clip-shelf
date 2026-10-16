import { describe, expect, it } from 'vitest'
import { sanitizeWindowState } from '../src/shared/windowState'

const screen1 = { x: 0, y: 0, width: 1920, height: 1040 }
const screen2 = { x: 1920, y: 0, width: 2560, height: 1400 }
const fallback = { width: 1600, height: 900 }
const min = { width: 1100, height: 700 }

describe('sanitizeWindowState', () => {
  it('uses the defaults when nothing was saved', () => {
    expect(sanitizeWindowState(null, [screen1], fallback, min)).toEqual({ width: 1600, height: 900, maximized: false })
    expect(sanitizeWindowState('junk', [screen1], fallback, min).width).toBe(1600)
  })

  it('keeps a saved position and size that fits', () => {
    const saved = { x: 100, y: 80, width: 1300, height: 800, maximized: true }
    expect(sanitizeWindowState(saved, [screen1], fallback, min)).toEqual(saved)
  })

  it('lets the system place the window when its screen is gone', () => {
    const saved = { x: 2500, y: 100, width: 1300, height: 800, maximized: false }
    const s = sanitizeWindowState(saved, [screen1], fallback, min)
    expect(s.x).toBeUndefined()
    expect(s.width).toBe(1300)
    expect(sanitizeWindowState(saved, [screen1, screen2], fallback, min).x).toBe(2500)
  })

  it('does not accept a window whose title bar is off screen', () => {
    expect(sanitizeWindowState({ x: 100, y: -500, width: 1300, height: 800 }, [screen1], fallback, min).x).toBeUndefined()
    expect(sanitizeWindowState({ x: 1900, y: 10, width: 1300, height: 800 }, [screen1], fallback, min).x).toBeUndefined()
  })

  it('keeps the size within the minimum and the biggest screen, and ignores bad numbers', () => {
    const s = sanitizeWindowState({ width: 300, height: 99999, x: 'a', y: NaN }, [screen1], fallback, min)
    expect(s).toEqual({ width: 1100, height: 1040, maximized: false })
  })
})
