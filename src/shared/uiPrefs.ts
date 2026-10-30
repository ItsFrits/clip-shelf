import type { AnimationMode, AnimationSpeed } from './types'

/** How much the animation times are multiplied by, per speed setting. */
export const ANIMATION_SCALE: Record<AnimationSpeed, number> = { slow: 1.75, normal: 1, fast: 0.6 }

/**
 * Whether animations are off and by how much to scale their duration.
 * 'system' follows the operating system's reduced motion setting. An unknown mode counts as 'system'.
 */
export function resolveMotion(
  mode: AnimationMode,
  speed: AnimationSpeed,
  prefersReduced: boolean
): { off: boolean; scale: number } {
  const off = mode === 'off' || (mode !== 'on' && prefersReduced)
  return { off, scale: ANIMATION_SCALE[speed] ?? 1 }
}

/**
 * Which Settings tab to open on. A tab that was asked for always wins. Otherwise the tab you used
 * last, unless remembering is off, then the first one.
 */
export function settingsTabOnOpen<T extends string>(
  requested: T | undefined,
  current: T,
  remember: boolean,
  first: T
): T {
  if (requested) return requested
  return remember ? current : first
}

// ---- title bar buttons -------------------------------------------------------------------------
// On Windows the minimize, maximize and close buttons are drawn by the system, on top of the page,
// so a dark layer in the page does not dim them. They get the dimmed colours instead.

export const TITLE_BAR_HEIGHT = 63
export const TITLE_BAR_COLOR = '#151821'
export const TITLE_BAR_SYMBOLS = '#a3abba'
/** The colour of the dark layer behind windows and dialogs, and how opaque each one is (see app.css). */
export const DIM_COLOR = '#080a0e'
export const MODAL_DIM = 0.62
export const DIALOG_DIM = 0.7

/** Several dark layers on top of each other, as one. */
export function combineDim(alphas: number[]): number {
  return 1 - alphas.reduce((rest, a) => rest * (1 - clamp01(a)), 1)
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

/** Mix two #rrggbb colours. t = 0 gives a, t = 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const k = clamp01(t)
  const parse = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const ca = parse(a)
  const cb = parse(b)
  return (
    '#' +
    ca
      .map((v, i) => Math.round(v + (cb[i] - v) * k))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}

/** The colours of the title bar buttons with a dark layer of this opacity on top of the page. */
export function titleBarColors(dim: number): { color: string; symbolColor: string } {
  return {
    color: mixHex(TITLE_BAR_COLOR, DIM_COLOR, dim),
    symbolColor: mixHex(TITLE_BAR_SYMBOLS, DIM_COLOR, dim)
  }
}
