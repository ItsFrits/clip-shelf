// Every keyboard action in the app. Users can rebind all of them in Settings.

export type ActionScope = 'global' | 'library' | 'player'

export interface ActionDef {
  id: string
  label: string
  scope: ActionScope
  defaults: string[]
}

export const ACTIONS: ActionDef[] = [
  { id: 'search', label: 'Focus search', scope: 'global', defaults: ['Ctrl+K'] },
  { id: 'undo', label: 'Undo', scope: 'global', defaults: ['Ctrl+Z'] },
  { id: 'back', label: 'Back / clear selection', scope: 'global', defaults: ['Escape'] },
  { id: 'random', label: 'Random clip', scope: 'global', defaults: ['R'] },

  { id: 'presetAll', label: 'Show all clips (no filters)', scope: 'library', defaults: [] },
  { id: 'selectAll', label: 'Select all visible clips', scope: 'library', defaults: ['Ctrl+A'] },
  {
    id: 'deleteClips',
    label: 'Move selected clips to recycle bin',
    scope: 'library',
    defaults: ['Delete']
  },

  { id: 'playPause', label: 'Play / pause', scope: 'player', defaults: ['Space'] },
  { id: 'frameBack', label: 'Previous frame', scope: 'player', defaults: ['ArrowLeft'] },
  { id: 'frameForward', label: 'Next frame', scope: 'player', defaults: ['ArrowRight'] },
  { id: 'speedDown', label: 'Slower', scope: 'player', defaults: ['J'] },
  { id: 'speedUp', label: 'Faster', scope: 'player', defaults: ['L'] },
  { id: 'prevClip', label: 'Previous clip', scope: 'player', defaults: ['PageUp'] },
  { id: 'nextClip', label: 'Next clip', scope: 'player', defaults: ['PageDown'] },
  { id: 'rate1', label: 'Rate 1 star', scope: 'player', defaults: ['1'] },
  { id: 'rate2', label: 'Rate 2 stars', scope: 'player', defaults: ['2'] },
  { id: 'rate3', label: 'Rate 3 stars', scope: 'player', defaults: ['3'] },
  { id: 'rate4', label: 'Rate 4 stars', scope: 'player', defaults: ['4'] },
  { id: 'rate5', label: 'Rate 5 stars', scope: 'player', defaults: ['5'] },
  { id: 'focusTag', label: 'Add a tag', scope: 'player', defaults: ['T'] },
  { id: 'focusNote', label: 'Edit the note', scope: 'player', defaults: ['N'] },
  { id: 'toggleWatched', label: 'Mark as watched / not watched', scope: 'player', defaults: ['W'] },
  { id: 'muteMaster', label: 'Mute / unmute everything', scope: 'player', defaults: ['M'] },
  { id: 'toggleLoop', label: 'Toggle loop', scope: 'player', defaults: ['O'] }
]

export type Keymap = Record<string, string[]>

export function effectiveKeymap(overrides: Keymap): Keymap {
  const map: Keymap = {}
  for (const a of ACTIONS) map[a.id] = overrides[a.id] ?? a.defaults
  return map
}

const KEY_ALIASES: Record<string, string> = {
  ' ': 'Space',
  Esc: 'Escape',
  Del: 'Delete'
}

/** Turn a keyboard event into a chord string such as "Ctrl+Shift+K". Returns null for a lone modifier. */
export function chordFromEvent(e: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
  let key = KEY_ALIASES[e.key] ?? e.key
  if (key.length === 1) key = key.toUpperCase()
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  // Shift is part of the character for symbols, so only keep it for letters, digits and named keys.
  if (e.shiftKey && (key.length > 1 || /[A-Z0-9]/.test(key))) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

/** Find which action (if any) already uses this chord within a scope that can clash. */
export function findConflict(keymap: Keymap, chord: string, actionId: string): string | null {
  const me = ACTIONS.find((a) => a.id === actionId)
  if (!me) return null
  for (const a of ACTIONS) {
    if (a.id === actionId) continue
    const clash = a.scope === me.scope || a.scope === 'global' || me.scope === 'global'
    if (clash && (keymap[a.id] ?? []).includes(chord)) return a.id
  }
  return null
}

export function formatChord(chord: string): string {
  return chord
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('Escape', 'Esc')
}
