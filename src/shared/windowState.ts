export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState {
  /** Missing means "let the system place the window". */
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Turns whatever was saved last time into a window position and size that is safe to use now.
 * The monitor setup may have changed, so a window that would end up off screen is placed by the system instead.
 */
export function sanitizeWindowState(
  raw: unknown,
  displays: Rect[],
  fallback: { width: number; height: number },
  min: { width: number; height: number }
): WindowState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const biggest = displays.reduce(
    (m, d) => ({ width: Math.max(m.width, d.width), height: Math.max(m.height, d.height) }),
    { width: 0, height: 0 }
  )
  const clamp = (v: unknown, lo: number, hi: number, dflt: number): number =>
    num(v) ? Math.round(Math.min(Math.max(v, lo), Math.max(lo, hi))) : dflt

  const width = clamp(r.width, min.width, biggest.width || Infinity, fallback.width)
  const height = clamp(r.height, min.height, biggest.height || Infinity, fallback.height)
  const state: WindowState = { width, height, maximized: r.maximized === true }

  if (num(r.x) && num(r.y)) {
    // The title bar must be reachable: at least 120 px wide and 40 px tall of it on one of the screens.
    const bar = { x: r.x, y: r.y, width, height: 40 }
    const reachable = displays.some((d) => overlap(bar, d) >= 120 * 40)
    if (reachable) {
      state.x = Math.round(r.x)
      state.y = Math.round(r.y)
    }
  }
  return state
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}
