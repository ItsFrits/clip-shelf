import { useEffect } from 'react'
import { ACTIONS, type ActionScope, chordFromEvent, effectiveKeymap } from '@shared/keymap'
import { useApp } from './store'

type Handler = () => void

/** Actions that only exist while the player is open. The player registers them. */
const playerHandlers = new Map<string, Handler>()

export function registerPlayerAction(id: string, fn: Handler): () => void {
  playerHandlers.set(id, fn)
  return () => {
    if (playerHandlers.get(id) === fn) playerHandlers.delete(id)
  }
}

function focusSearch(): void {
  const el = document.getElementById('search-input') as HTMLInputElement | null
  el?.focus()
  el?.select()
}

/** Run an action by id. Returns true if something handled it. */
export function runAction(id: string): boolean {
  const s = useApp.getState()
  switch (id) {
    case 'search':
      if (s.view !== 'library') s.setView('library')
      setTimeout(focusSearch, 0)
      return true
    case 'undo':
      s.undoLast()
      return true
    case 'random':
      s.randomClip()
      return true
    case 'back':
      if (s.view === 'player') s.closePlayer()
      else if (s.view === 'settings') s.setView('library')
      else if (s.selected.size > 0) s.clearSelection()
      else return false
      return true
    case 'selectAll':
      s.selectAll()
      return true
    case 'deleteClips':
      if (s.selected.size > 0) void s.trashKeys([...s.selected])
      return true
    default: {
      const handler = playerHandlers.get(id)
      if (!handler) return false
      handler()
      return true
    }
  }
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['checkbox', 'radio', 'range', 'button'].includes(type)
  }
  return el.isContentEditable
}

/** One keyboard listener for the whole app. Bindings come from the user's keymap. */
export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useApp.getState()
      if (s.capturingKey || s.confirm) return
      const chord = chordFromEvent(e)
      if (!chord) return
      const typing = isTyping(e.target)
      const hasMod = e.ctrlKey || e.metaKey || e.altKey
      if (typing && !hasMod && chord !== 'Escape') return
      const map = effectiveKeymap(s.user.settings.keymap)
      const scopes: ActionScope[] = ['global', s.view === 'player' ? 'player' : 'library']
      for (const a of ACTIONS) {
        if (!scopes.includes(a.scope) || !(map[a.id] ?? []).includes(chord)) continue
        // Let the text field keep its own undo and select-all.
        if (typing && (a.id === 'undo' || a.id === 'selectAll')) return
        if (s.view === 'settings' && a.scope !== 'global') continue
        if (runAction(a.id)) {
          e.preventDefault()
          const active = document.activeElement
          if (active instanceof HTMLButtonElement) active.blur()
          if (typing && chord === 'Escape' && active instanceof HTMLElement) active.blur()
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
