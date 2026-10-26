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
