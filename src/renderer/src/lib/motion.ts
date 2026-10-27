/**
 * A duration in milliseconds for animations driven from code, following the Animations settings:
 * 0 when animations are off, scaled by the speed setting otherwise.
 */
export function motionMs(base: number): number {
  const root = document.documentElement
  if (root.dataset.anim === 'off') return 0
  const scale = parseFloat(root.style.getPropertyValue('--anim-scale'))
  return base * (Number.isFinite(scale) ? scale : 1)
}
