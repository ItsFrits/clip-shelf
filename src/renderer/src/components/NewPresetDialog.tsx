import { useEffect, useRef, useState } from 'react'
import { toSavedFilters } from '@shared/savedFilters'
import { sortButtonLabel } from '@shared/sort'
import { capturePreset } from '@shared/presets'
import type { PresetParts } from '@shared/types'
import { dateLabel } from '../lib/filter'
import { presetSummary } from '../lib/presets'
import { useApp, useSettings } from '../lib/store'

/** Asks for a name, and which extra parts to keep, then makes a preset from the filters as they are now. */
export function NewPresetDialog(): React.JSX.Element | null {
  const open = useApp((s) => s.newPresetOpen)
  const setOpen = useApp((s) => s.setNewPresetOpen)
  const filters = useApp((s) => s.filters)
  const tags = useApp((s) => s.user.tags)
  const folders = useApp((s) => s.user.folders)
  const createPreset = useApp((s) => s.createPreset)
  const setCapturing = useApp((s) => s.setCapturing)
  const settings = useSettings()
  const [name, setName] = useState('')
  const [parts, setParts] = useState<PresetParts>({ date: false, folders: false, sort: false })
  const input = useRef<HTMLInputElement>(null)

  // Start empty every time it opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName('')
      setParts({ date: false, folders: false, sort: false })
    }
  }

  // Keep the hotkeys of the library out of the way while typing.
  useEffect(() => {
    if (!open) return
    setCapturing(true)
    const t = setTimeout(() => input.current?.focus(), 0)
    return () => {
      clearTimeout(t)
      setCapturing(false)
    }
  }, [open, setCapturing])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setOpen])

  if (!open) return null

  const saved = toSavedFilters(filters)
  const dateText = dateLabel(filters)
  const folderText =
    filters.folderIds.length === 0
      ? 'all folders'
      : filters.folderIds.map((id) => folders.find((f) => f.id === id)?.name ?? '?').join(', ')
  const preview = presetSummary(
    capturePreset({ id: 'preview', name: '', hotkey: null }, saved, parts, settings.sortRules),
    (id) => tags.find((t) => t.id === id)?.name,
    (id) => folders.find((f) => f.id === id)?.name
  )
  const valid = name.trim().length > 0

  const submit = (): void => {
    if (!valid) return
    const id = createPreset(name, parts)
    const made = (useApp.getState().user.settings.presets ?? []).find((p) => p.id === id)
    setOpen(false)
    useApp
      .getState()
      .toast(
        `Made the preset “${made?.name ?? name.trim()}”${made?.hotkey ? ` (${made.hotkey})` : ''}.`
      )
  }

  const part = (key: keyof PresetParts, label: string, value: string): React.JSX.Element => (
    <label className="check-row">
      <input
        type="checkbox"
        checked={parts[key]}
        onChange={(e) => setParts({ ...parts, [key]: e.target.checked })}
      />
      <span className="label">
        {label} <span className="muted">({value})</span>
      </span>
    </label>
  )

  return (
    <div className="overlay" onMouseDown={() => setOpen(false)}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="New preset"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>New preset</h2>
        <p>
          A preset remembers the status, tags and rating you have set now, so you can come back to
          them with one click.
        </p>
        <input
          ref={input}
          className="field"
          placeholder="Name, for example “Ready for a video”"
          value={name}
          maxLength={60}
          aria-label="Preset name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="np-parts">
          <span className="muted" style={{ fontSize: 12 }}>
            Also keep
          </span>
          {part('date', 'The date', dateText)}
          {part('folders', 'The folders', folderText)}
          {part('sort', 'The sort order', sortButtonLabel(settings.sortRules))}
        </div>
        <p className="np-preview" style={{ fontSize: 13 }}>
          {preview.length > 0
            ? `Shows: ${preview.join(' · ')}`
            : 'No filters yet. This preset will show every clip.'}
        </p>
        <div className="buttons">
          <button className="btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={submit}>
            Make preset
          </button>
        </div>
      </div>
    </div>
  )
}
