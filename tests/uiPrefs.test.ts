import { describe, expect, it } from 'vitest'
import { resolveMotion, settingsTabOnOpen } from '../src/shared/uiPrefs'
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
    expect(resolveMotion('weird' as never, 'weird' as never, false)).toEqual({ off: false, scale: 1 })
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
