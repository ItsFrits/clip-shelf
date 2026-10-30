import { describe, expect, it } from 'vitest'
import {
  DIM_COLOR,
  MODAL_DIM,
  TITLE_BAR_COLOR,
  TITLE_BAR_SYMBOLS,
  combineDim,
  mixHex,
  resolveMotion,
  settingsTabOnOpen,
  titleBarColors
} from '../src/shared/uiPrefs'
import { DEFAULT_SETTINGS } from '../src/shared/userLogic'

describe('resolveMotion', () => {
  it('follows the system setting by default', () => {
    expect(resolveMotion('system', 'normal', false).off).toBe(false)
    expect(resolveMotion('system', 'normal', true).off).toBe(true)
  })
  it('on and off ignore the system setting', () => {
    expect(resolveMotion('on', 'normal', true).off).toBe(false)
    expect(resolveMotion('off', 'normal', false).off).toBe(true)
  })
  it('scales the speed', () => {
    expect(resolveMotion('on', 'slow', false).scale).toBeGreaterThan(1)
    expect(resolveMotion('on', 'normal', false).scale).toBe(1)
    expect(resolveMotion('on', 'fast', false).scale).toBeLessThan(1)
  })
  it('treats unknown values safely', () => {
    expect(resolveMotion('weird' as never, 'weird' as never, true)).toEqual({ off: true, scale: 1 })
    expect(resolveMotion('weird' as never, 'weird' as never, false)).toEqual({
      off: false,
      scale: 1
    })
  })
})

describe('settingsTabOnOpen', () => {
  it('uses a requested tab first', () => {
    expect(settingsTabOnOpen('folders', 'tags', false, 'general')).toBe('folders')
  })
  it('remembers the last tab when on', () => {
    expect(settingsTabOnOpen(undefined, 'tags', true, 'general')).toBe('tags')
  })
  it('starts on the first tab when remembering is off', () => {
    expect(settingsTabOnOpen(undefined, 'tags', false, 'general')).toBe('general')
  })
})

describe('defaults', () => {
  it('open as a window, remember the tab, follow the system for animations', () => {
    expect(DEFAULT_SETTINGS.settingsView).toBe('window')
    expect(DEFAULT_SETTINGS.rememberSettingsTab).toBe(true)
    expect(DEFAULT_SETTINGS.animations).toBe('system')
    expect(DEFAULT_SETTINGS.animationSpeed).toBe('normal')
  })
})

describe('title bar dimming', () => {
  it('combines dark layers', () => {
    expect(combineDim([])).toBe(0)
    expect(combineDim([0.5])).toBeCloseTo(0.5)
    expect(combineDim([0.62, 0.7])).toBeCloseTo(1 - 0.38 * 0.3)
    expect(combineDim([NaN, 2])).toBe(1)
  })
  it('mixes colours', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
  it('keeps the normal colours without a dark layer and darkens with one', () => {
    expect(titleBarColors(0)).toEqual({ color: TITLE_BAR_COLOR, symbolColor: TITLE_BAR_SYMBOLS })
    const dim = titleBarColors(MODAL_DIM)
    expect(dim.color).toBe('#0d0f15')
    expect(dim.symbolColor).not.toBe(TITLE_BAR_SYMBOLS)
    expect(titleBarColors(1).color).toBe(DIM_COLOR)
  })
})
