import { ChevronDown, ChevronLeft, ChevronUp, FolderPlus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ACTIONS,
  type ActionDef,
  chordFromEvent,
  effectiveKeymap,
  findConflict,
  formatChord
} from '@shared/keymap'
import { defaultPresets, presetForKey, uniqueName } from '@shared/presets'
import type { AnimationMode, AnimationSpeed, FolderInfo, Preset, SettingsView } from '@shared/types'
import { resolveMotion } from '@shared/uiPrefs'
import { sortTags } from '@shared/userLogic'
import { fmtBytes, fmtCount } from '../lib/format'
import { presetSummary, resolvePreset } from '../lib/presets'
import { type SettingsTab, useApp, useSettings } from '../lib/store'
import { AboutTab } from './AboutTab'
import { TagInput } from './TagInput'
import { TagSortControl } from './TagSortControl'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'folders', label: 'Folders' },
  { id: 'playback', label: 'Playback & editor' },
  { id: 'tags', label: 'Tags' },
  { id: 'presets', label: 'Presets' },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'backup', label: 'Backup & updates' },
  { id: 'about', label: 'About' }
]

/** The tabs and the open tab. Shared by the window and the full page. */
function SettingsBody(): React.JSX.Element {
  const tab = useApp((s) => s.settingsTab)
  const openSettings = useApp((s) => s.openSettings)
  return (
    <div className="settings-body">
      <nav className="settings-nav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => openSettings(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="settings-main">
        <div className="inner">
          {tab === 'general' && <GeneralTab />}
          {tab === 'folders' && <FoldersTab />}
          {tab === 'playback' && <PlaybackTab />}
          {tab === 'tags' && <TagsTab />}
          {tab === 'presets' && <PresetsTab />}
          {tab === 'hotkeys' && <HotkeysTab />}
          {tab === 'backup' && <BackupTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  )
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Settings({ modal = false }: { modal?: boolean }): React.JSX.Element {
  const setView = useApp((s) => s.setView)
  const dialogRef = useRef<HTMLDivElement>(null)
  // A click only closes the window when it also started on the dark area, so selecting text
  // and letting go outside the window does not close it.
  const pressedBackdrop = useRef(false)
  const close = (): void => setView('library')

  useEffect(() => {
    if (!modal) return
    const before = document.activeElement as HTMLElement | null
    dialogRef.current?.focus({ preventScroll: true })
    return () => {
      if (before && document.contains(before)) before.focus({ preventScroll: true })
    }
  }, [modal])

  if (!modal) {
    return (
      <div className="settings">
        <header className="player-head">
          <button className="btn" onClick={close}>
            <ChevronLeft size={16} strokeWidth={2} />
            Library
          </button>
          <span className="player-title">Settings</span>
        </header>
        <SettingsBody />
      </div>
    )
  }

  // Keep Tab inside the window.
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) close()
        pressedBackdrop.current = false
      }}
    >
      <div ref={dialogRef} className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings" tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="modal-head">
          <span className="modal-title">Settings</span>
          <button className="btn icon" aria-label="Close settings" title="Close (Esc)" onClick={close}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>
        <SettingsBody />
      </div>
    </div>
  )
}

function Row(props: { title: string; desc?: string; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="setting-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{props.title}</div>
        {props.desc && <div className="desc">{props.desc}</div>}
      </div>
      {props.children}
    </div>
  )
}

function Switch(props: { on: boolean; onChange: (on: boolean) => void; label: string }): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      aria-label={props.label}
      className={'switch' + (props.on ? ' on' : '')}
      onClick={() => props.onChange(!props.on)}
    />
  )
}

// ------------------------------------------------------------------ general

function Choice<T extends string>(props: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  label: string
}): React.JSX.Element {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.id} className={props.value === o.id ? 'on' : ''} onClick={() => props.onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function GeneralTab(): React.JSX.Element {
  const settings = useSettings()
  const update = useApp((s) => s.updateSettings)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const off = resolveMotion(settings.animations, settings.animationSpeed, reduced).off
  return (
    <>
      <h1>General</h1>
      <div className="sec-card">
        <Row title="Open settings as" desc="A window over the library, or a full page that replaces it.">
          <Choice<SettingsView>
            label="Open settings as"
            value={settings.settingsView}
            options={[
              { id: 'window', label: 'Window' },
              { id: 'page', label: 'Full page' }
            ]}
            onChange={(v) => update({ settingsView: v })}
          />
        </Row>
        <Row title="Remember the last tab" desc="Settings opens on the tab you used last. When this is off it always starts on General.">
          <Switch label="Remember the last tab" on={settings.rememberSettingsTab} onChange={(v) => update({ rememberSettingsTab: v })} />
        </Row>
      </div>
      <div className="sec-card">
        <Row title="Animations" desc="Follow system uses the reduced motion setting of your operating system.">
          <Choice<AnimationMode>
            label="Animations"
            value={settings.animations}
            options={[
              { id: 'system', label: 'Follow system' },
              { id: 'on', label: 'On' },
              { id: 'off', label: 'Off' }
            ]}
            onChange={(v) => update({ animations: v })}
          />
        </Row>
        <Row title="Animation speed" desc={off ? 'Animations are off right now, so this has no effect.' : 'How quickly things fade and slide.'}>
          <Choice<AnimationSpeed>
            label="Animation speed"
            value={settings.animationSpeed}
            options={[
              { id: 'slow', label: 'Slow' },
              { id: 'normal', label: 'Normal' },
              { id: 'fast', label: 'Fast' }
            ]}
            onChange={(v) => update({ animationSpeed: v })}
          />
        </Row>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ folders

function FolderCard({ f }: { f: FolderInfo }): React.JSX.Element {
  const ask = useApp((s) => s.ask)
  const [name, setName] = useState(f.name)
  useEffect(() => setName(f.name), [f.name])
  const update = (patch: Partial<FolderInfo>): void => void window.api.updateFolder(f.id, patch)

  return (
    <div className="folder-card">
      <div className="top">
        <span className="dot" style={{ background: f.online ? 'var(--s-tagged)' : '#e0b052', width: 10, height: 10 }} />
        <input
          className="field"
          style={{ width: 200 }}
          value={name}
          aria-label="Folder name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== f.name && update({ name: name.trim() })}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.path}>
            {f.path}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {!f.online ? 'Offline. Its clips stay in your library and are greyed out.' : f.scanning ? 'Scanning…' : 'Live'} ·{' '}
            {fmtCount(f.clipCount)} files · {fmtBytes(f.totalBytes)}
          </div>
        </div>
        <button className="btn small" disabled={!f.online} onClick={() => void window.api.rescan(f.id)}>
          <RefreshCw size={14} />
          Rescan
        </button>
        <button
          className="btn small danger"
          onClick={async () => {
            const ok = await ask({
              title: `Stop watching “${f.name}”?`,
              body: 'Your files are not touched. The clips from this folder disappear from the library. Tags and notes are kept and come back if you add the folder again.',
              confirmLabel: 'Stop watching',
              danger: true
            })
            if (ok) void window.api.removeFolder(f.id)
          }}
        >
          <Trash2 size={14} />
          Remove
        </button>
      </div>
      <div className="folder-opts">
        <label>
          <input type="checkbox" checked={f.includeSubfolders} onChange={(e) => update({ includeSubfolders: e.target.checked })} />
          Include subfolders
        </label>
        <label title="Link a separate audio file with the same name (for example a mic .m4a) to its video">
          <input type="checkbox" checked={f.pairAudio} onChange={(e) => update({ pairAudio: e.target.checked })} />
          Pair separate audio files
        </label>
        <label title="Offer subfolder names as tag suggestions. Nothing is tagged automatically.">
          <input type="checkbox" checked={f.suggestTags} onChange={(e) => update({ suggestTags: e.target.checked })} />
          Suggest tags from subfolder names
        </label>
      </div>
    </div>
  )
}

function FoldersTab(): React.JSX.Element {
  const folders = useApp((s) => s.folders)
  const settings = useSettings()
  const updateSettings = useApp((s) => s.updateSettings)
  const toast = useApp((s) => s.toast)
  const [ignore, setIgnore] = useState(settings.ignorePatterns.join('\n'))

  const add = async (): Promise<void> => {
    const path = await window.api.pickFolder()
    if (!path) return
    if (folders.some((f) => f.path.toLowerCase() === path.toLowerCase())) {
      toast('That folder is already in the list.')
      return
    }
    const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path
    await window.api.addFolder({ path, name, includeSubfolders: true, pairAudio: true, suggestTags: true })
  }

  return (
    <>
      <h1>Folders</h1>
      <div className="sec-card">
        <span className="muted">
          Clip Shelf only reads these folders. It never changes, renames or moves your files. New clips show up on their own.
        </span>
        {folders.map((f) => (
          <FolderCard key={f.id} f={f} />
        ))}
        <div>
          <button className="btn primary" onClick={() => void add()}>
            <FolderPlus size={16} />
            Add folder
          </button>
        </div>
      </div>
      <div className="sec-card">
        <Row title="Ignored names" desc="One per line. Files and folders with these names are skipped. Use * as a wildcard." />
        <textarea
          className="field mono"
          rows={5}
          value={ignore}
          onChange={(e) => setIgnore(e.target.value)}
          onBlur={() => {
            const list = ignore.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
            if (list.join('\n') !== settings.ignorePatterns.join('\n')) updateSettings({ ignorePatterns: list })
          }}
        />
      </div>
    </>
  )
}

// ------------------------------------------------------------------ playback

function PlaybackTab(): React.JSX.Element {
  const settings = useSettings()
  const update = useApp((s) => s.updateSettings)
  return (
    <>
      <h1>Playback &amp; editor</h1>
      <div className="sec-card">
        <Row title="Video editor name" desc="Only used for the label on the drag button. Any editor that accepts dropped files works.">
          <input className="field" style={{ width: 240 }} value={settings.editorName} onChange={(e) => update({ editorName: e.target.value })} />
        </Row>
        <Row title="Bring the separate mic file along" desc="When you drag a clip that has its own audio file (like a Radeon ReLive mic track), drop both in the editor.">
          <Switch label="Include audio files when dragging" on={settings.dragIncludeAudio} onChange={(v) => update({ dragIncludeAudio: v })} />
        </Row>
      </div>
      <div className="sec-card">
        <Row title="Keyboard hints" desc="Show the shortcut next to buttons and fields, like the key for Random clip.">
          <Switch label="Keyboard hints" on={settings.showKeyHints} onChange={(v) => update({ showKeyHints: v })} />
        </Row>
      </div>
      <div className="sec-card">
        <Row title="Audio track labels" desc="Show the track names stored in the video file (like “Game” or “Mic”), or just Track 1, Track 2. Clips without names always show numbers.">
          <div className="seg" role="group" aria-label="Audio track labels">
            <button className={settings.trackNames === 'names' ? 'on' : ''} onClick={() => update({ trackNames: 'names' })}>
              Names
            </button>
            <button className={settings.trackNames === 'numbers' ? 'on' : ''} onClick={() => update({ trackNames: 'numbers' })}>
              Numbers
            </button>
          </div>
        </Row>
      </div>
      <div className="sec-card">
        <Row title="Loop the clip" desc="Start again when the end is reached.">
          <Switch label="Loop" on={settings.loop} onChange={(v) => update({ loop: v })} />
        </Row>
        <Row title="Play the next clip automatically" desc="When a clip ends, go to the next one in the list.">
          <Switch label="Play next clip automatically" on={settings.autoplayNext} onChange={(v) => update({ autoplayNext: v })} />
        </Row>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ hotkeys

const SCOPE_TITLE = { global: 'Everywhere', library: 'Library', player: 'Player' } as const

function HotkeysTab(): React.JSX.Element {
  const settings = useSettings()
  const update = useApp((s) => s.updateSettings)
  const setCapturing = useApp((s) => s.setCapturing)
  const map = effectiveKeymap(settings.keymap)
  const [capturing, setCapture] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; text: string } | null>(null)

  useEffect(() => {
    setCapturing(capturing !== null)
    if (!capturing) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapture(null)
        setError(null)
        return
      }
      const chord = chordFromEvent(e)
      if (!chord) return
      const clash = findConflict(map, chord, capturing)
      if (clash) {
        const other = ACTIONS.find((a) => a.id === clash)
        setError({ id: capturing, text: `${formatChord(chord)} is already used for “${other?.label}”. Pick another key.` })
        return
      }
      const usedBy = presetForKey(settings.presets ?? [], chord)
      if (usedBy) {
        setError({ id: capturing, text: `${formatChord(chord)} is already used for the preset “${usedBy.name}”. Pick another key.` })
        return
      }
      update({ keymap: { ...settings.keymap, [capturing]: [chord] } })
      setCapture(null)
      setError(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      setCapturing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, settings.keymap])

  const reset = (id: string): void => {
    const next = { ...settings.keymap }
    delete next[id]
    update({ keymap: next })
  }
  const changed = Object.keys(settings.keymap).length > 0

  const renderAction = (a: ActionDef): React.JSX.Element => {
    const isCapturing = capturing === a.id
    const custom = settings.keymap[a.id] !== undefined
    return (
      <div key={a.id} className="hotkey-row">
        <div className="name">
          {a.label}
          {error?.id === a.id && <div className="err">{error.text}</div>}
        </div>
        <span className={'chord' + (isCapturing ? ' capturing' : '')}>
          {isCapturing ? 'Press a key…' : (map[a.id] ?? []).map(formatChord).join(' / ') || 'Not set'}
        </span>
        <button
          className="btn small"
          onClick={() => {
            setError(null)
            setCapture(isCapturing ? null : a.id)
          }}
        >
          {isCapturing ? 'Cancel' : 'Change'}
        </button>
        <button className="btn small ghost" disabled={!custom} onClick={() => reset(a.id)} aria-label={`Reset ${a.label}`}>
          <RotateCcw size={14} />
        </button>
      </div>
    )
  }

  return (
    <>
      <h1>Hotkeys</h1>
      <div className="sec-card">
        <Row title="Choose your own keys" desc="Click Change, then press the key or combination you want. Escape cancels.">
          <button className="btn small" disabled={!changed} onClick={() => update({ keymap: {} })}>
            Reset all to default
          </button>
        </Row>
      </div>
      {(['global', 'library', 'player'] as const).map((scope) => (
        <div key={scope} className="sec-card">
          <h2 className="h-label">{SCOPE_TITLE[scope]}</h2>
          <div>{ACTIONS.filter((a) => a.scope === scope).map(renderAction)}</div>
        </div>
      ))}
    </>
  )
}

// ------------------------------------------------------------------ presets

function PresetsTab(): React.JSX.Element {
  const settings = useSettings()
  const update = useApp((s) => s.updateSettings)
  const ask = useApp((s) => s.ask)
  const setCapturing = useApp((s) => s.setCapturing)
  const tags = useApp((s) => s.user.tags)
  const folders = useApp((s) => s.user.folders)
  const presets = settings.presets ?? []
  const [capturing, setCapture] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; text: string } | null>(null)

  const save = (next: Preset[], extra: Partial<typeof settings> = {}): void => update({ presets: next, ...extra })
  const patch = (id: string, change: Partial<Preset>): void => save(presets.map((p) => (p.id === id ? { ...p, ...change } : p)))

  // Press the key you want for a preset. Escape cancels.
  useEffect(() => {
    setCapturing(capturing !== null)
    if (!capturing) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapture(null)
        setError(null)
        return
      }
      const chord = chordFromEvent(e)
      if (!chord) return
      const other = presetForKey(presets, chord)
      const map = effectiveKeymap(settings.keymap)
      const action = ACTIONS.find((a) => a.scope !== 'player' && (map[a.id] ?? []).includes(chord))
      if (other && other.id !== capturing) {
        setError({ id: capturing, text: `${formatChord(chord)} is already used for the preset “${other.name}”. Pick another key.` })
        return
      }
      if (action) {
        setError({ id: capturing, text: `${formatChord(chord)} is already used for “${action.label}”. Pick another key.` })
        return
      }
      patch(capturing, { hotkey: chord })
      setCapture(null)
      setError(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      setCapturing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, presets, settings.keymap])

  const move = (index: number, dir: -1 | 1): void => {
    const next = [...presets]
    const [item] = next.splice(index, 1)
    next.splice(index + dir, 0, item)
    save(next)
  }
  const remove = async (p: Preset): Promise<void> => {
    const ok = await ask({ title: `Delete “${p.name}”?`, body: 'The preset is removed. Your clips and tags are not touched.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    save(presets.filter((x) => x.id !== p.id), settings.activePresetId === p.id ? { activePresetId: null } : {})
  }
  const addDefaults = (): void => {
    const missing = defaultPresets(() => crypto.randomUUID()).filter((d) => !presets.some((p) => p.name.toLowerCase() === d.name.toLowerCase()))
    const taken = new Set(presets.map((p) => p.hotkey).filter(Boolean))
    // A key that is already taken is left empty, you can pick another one.
    save([...presets, ...missing.map((d) => (d.hotkey && taken.has(d.hotkey) ? { ...d, hotkey: null } : d))])
  }
  const tagName = (id: string): string | undefined => tags.find((t) => t.id === id)?.name
  const folderName = (id: string): string | undefined => folders.find((f) => f.id === id)?.name
  const hasAllDefaults = defaultPresets(() => '').every((d) => presets.some((p) => p.name.toLowerCase() === d.name.toLowerCase()))

  return (
    <>
      <h1>Presets</h1>
      <div className="sec-card">
        <Row title="Your presets" desc="A preset is a set of filters you can switch to in the sidebar, or with its key. To make one, set the filters you want in the library and choose “New preset…” in the preset list.">
          <button className="btn small" disabled={hasAllDefaults} onClick={addDefaults}>
            Add the default presets again
          </button>
        </Row>
      </div>
      <div className="sec-card">
        {presets.length === 0 && <div className="muted" style={{ fontSize: 13 }}>You have no presets yet.</div>}
        {presets.map((p, i) => (
          <PresetRow
            key={p.id}
            preset={p}
            summary={presetSummary(resolvePreset(p, tags.map((t) => t.id), folders.map((f) => f.id)), tagName, folderName)}
            isFirst={i === 0}
            isLast={i === presets.length - 1}
            capturing={capturing === p.id}
            error={error?.id === p.id ? error.text : null}
            onRename={(name) => patch(p.id, { name: uniqueName(name, presets, p.id) })}
            onChange={() => {
              setError(null)
              setCapture(capturing === p.id ? null : p.id)
            }}
            onClear={() => patch(p.id, { hotkey: null })}
            onMove={(dir) => move(i, dir)}
            onDelete={() => void remove(p)}
          />
        ))}
      </div>
      <div className="sec-card">
        <Row title="Show all clips" desc="The key for “All clips” (no filters) is set under Hotkeys, in the Library list.">
          <span className="chord">{(effectiveKeymap(settings.keymap).presetAll ?? []).map(formatChord).join(' / ') || 'Not set'}</span>
        </Row>
      </div>
    </>
  )
}

function PresetRow({
  preset,
  summary,
  isFirst,
  isLast,
  capturing,
  error,
  onRename,
  onChange,
  onClear,
  onMove,
  onDelete
}: {
  preset: Preset
  summary: string[]
  isFirst: boolean
  isLast: boolean
  capturing: boolean
  error: string | null
  onRename: (name: string) => void
  onChange: () => void
  onClear: () => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}): React.JSX.Element {
  const [name, setName] = useState(preset.name)
  useEffect(() => setName(preset.name), [preset.name])
  const commit = (): void => {
    const clean = name.trim()
    if (!clean) setName(preset.name)
    else if (clean !== preset.name) onRename(clean)
  }
  return (
    <div className="preset-row">
      <div className="preset-row-main">
        <input
          className="field preset-row-name"
          value={name}
          maxLength={60}
          aria-label={`Name of the preset ${preset.name}`}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              e.stopPropagation()
              setName(preset.name)
              e.currentTarget.blur()
            }
          }}
        />
        <div className="preset-row-sub muted">{summary.length > 0 ? summary.join(' · ') : 'No filters'}</div>
        {error && <div className="err">{error}</div>}
      </div>
      <span className={'chord' + (capturing ? ' capturing' : '')}>{capturing ? 'Press a key…' : preset.hotkey ? formatChord(preset.hotkey) : 'No key'}</span>
      <button className="btn small" onClick={onChange}>
        {capturing ? 'Cancel' : 'Change'}
      </button>
      <button className="btn small ghost" disabled={!preset.hotkey} onClick={onClear} aria-label={`Remove the key of ${preset.name}`} title="Remove the key">
        <X size={14} />
      </button>
      <button className="btn small ghost" disabled={isFirst} onClick={() => onMove(-1)} aria-label={`Move ${preset.name} up`} title="Move up">
        <ChevronUp size={14} />
      </button>
      <button className="btn small ghost" disabled={isLast} onClick={() => onMove(1)} aria-label={`Move ${preset.name} down`} title="Move down">
        <ChevronDown size={14} />
      </button>
      <button className="btn small ghost" onClick={onDelete} aria-label={`Delete ${preset.name}`} title="Delete">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ backup and updates

function BackupTab(): React.JSX.Element {
  const settings = useSettings()
  const update = useApp((s) => s.updateSettings)
  const lastBackupAt = useApp((s) => s.user.lastBackupAt)
  const updateStatus = useApp((s) => s.update)
  const appInfo = useApp((s) => s.appInfo)
  const ask = useApp((s) => s.ask)
  const toast = useApp((s) => s.toast)

  const statusText = ((): string => {
    switch (updateStatus.state) {
      case 'checking':
        return 'Checking for updates…'
      case 'none':
        return 'You are on the latest version.'
      case 'downloading':
        return `Downloading version ${updateStatus.version ?? ''} (${updateStatus.percent ?? 0}%)`
      case 'ready':
        return `Version ${updateStatus.version} is ready to install.`
      case 'error':
        return `Could not check for updates: ${updateStatus.message ?? 'unknown error'}`
      default:
        return updateStatus.message ?? ''
    }
  })()

  return (
    <>
      <h1>Backup &amp; updates</h1>
      <div className="sec-card">
        <Row title="Your tags, notes and ratings" desc="Everything you typed lives in one small file. Save a copy now and then, especially before reinstalling Windows.">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={async () => {
                const path = await window.api.exportBackup()
                if (path) toast(`Backup saved to ${path}`)
              }}
            >
              Export backup
            </button>
            <button
              className="btn"
              onClick={async () => {
                const ok = await ask({
                  title: 'Restore a backup?',
                  body: 'Your current tags, notes, ratings and settings are replaced by the ones in the backup file. Your folder list stays as it is.',
                  confirmLabel: 'Choose file…'
                })
                if (!ok) return
                const done = await window.api.importBackup()
                if (done) toast('Backup restored.')
              }}
            >
              Restore backup
            </button>
          </div>
        </Row>
        <Row
          title="Automatic daily backup"
          desc={`A copy is kept in the app data folder, the last 14 days. ${lastBackupAt ? 'Last one: ' + new Date(lastBackupAt).toLocaleString() : ''}`}
        >
          <Switch label="Automatic daily backup" on={settings.autoBackup} onChange={(v) => update({ autoBackup: v })} />
        </Row>
      </div>
      <div className="sec-card">
        <Row title={`Clip Shelf ${appInfo.version ? 'v' + appInfo.version : ''}`} desc={statusText}>
          {updateStatus.state === 'ready' ? (
            <button className="btn primary" onClick={() => void window.api.installUpdate()}>
              Restart and install
            </button>
          ) : (
            <button className="btn" disabled={!appInfo.packaged || updateStatus.state === 'checking'} onClick={() => void window.api.checkForUpdates()}>
              <RefreshCw size={14} />
              Check for updates
            </button>
          )}
        </Row>
      </div>
    </>
  )
}

function TagsTab(): React.JSX.Element {
  const tags = useApp((s) => s.user.tags)
  const clips = useApp((s) => s.user.clips)
  const updateTag = useApp((s) => s.updateTag)
  const addSuggestion = useApp((s) => s.addSuggestion)
  const ask = useApp((s) => s.ask)
  const toast = useApp((s) => s.toast)
  const tagSort = useSettings().tagSort
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [name, setName] = useState('')
  const [mergeInto, setMergeInto] = useState('')

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of Object.values(clips)) for (const id of c.tags) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [clips])
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])
  const sorted = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return sortTags(
      tags.filter((t) => t.name.toLowerCase().includes(q)),
      counts,
      tagSort
    )
  }, [tags, filter, counts, tagSort])

  const selected = selectedId ? byId.get(selectedId) : undefined
  useEffect(() => {
    setName(selected?.name ?? '')
    setMergeInto('')
  }, [selected?.id, selected?.name])

  const suggestsList = (selected?.suggests ?? []).map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t)
  const suggestedBy = selected ? tags.filter((t) => t.suggests?.includes(selected.id)) : []
  const used = selected ? (counts.get(selected.id) ?? 0) : 0

  const rename = (): void => {
    if (!selected) return
    const clean = name.trim()
    if (!clean || clean === selected.name) {
      setName(selected.name)
      return
    }
    if (tags.some((t) => t.id !== selected.id && t.name.toLowerCase() === clean.toLowerCase())) {
      toast(`There is already a tag called "${clean}". Use "Merge into" to combine them.`, { kind: 'error' })
      setName(selected.name)
      return
    }
    void window.api.renameTag(selected.id, clean)
  }

  const merge = async (): Promise<void> => {
    if (!selected || !mergeInto) return
    const target = byId.get(mergeInto)
    if (!target) return
    const ok = await ask({
      title: `Merge "${selected.name}" into "${target.name}"?`,
      body: `${used} clip${used === 1 ? '' : 's'} with "${selected.name}" get "${target.name}" instead. The tag "${selected.name}" is removed.`,
      confirmLabel: 'Merge'
    })
    if (!ok) return
    await window.api.mergeTags([selected.id], target.id)
    setSelectedId(target.id)
  }

  const remove = async (): Promise<void> => {
    if (!selected) return
    const ok = await ask({
      title: `Delete the tag "${selected.name}"?`,
      body: used > 0 ? `It is removed from ${used} clip${used === 1 ? '' : 's'}. The clips themselves stay.` : 'No clip uses this tag.',
      confirmLabel: 'Delete tag',
      danger: true
    })
    if (!ok) return
    await window.api.deleteTag(selected.id)
    setSelectedId(null)
  }

  return (
    <>
      <h1>Tags</h1>
      <div className="sec-card">
        <span className="muted">
          Choose which tags are suggested after a tag is added to a clip. It works one way: if "Air dribble" suggests
          "Sidewall", adding "Sidewall" does not suggest "Air dribble" unless you set that up too.
        </span>
        <div className="tag-manager">
          <div className="tag-list">
            <input
              className="field"
              placeholder="Find a tag"
              aria-label="Find a tag"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <TagSortControl />
            <div className="items">
              {sorted.map((t) => (
                <button key={t.id} className={'item' + (t.id === selectedId ? ' on' : '')} onClick={() => setSelectedId(t.id)}>
                  <span className="name">{t.name}</span>
                  <span className="meta">
                    {t.suggests?.length ? <span title="Suggests other tags">→ {t.suggests.length}</span> : null}
                    <span title="Clips with this tag">{fmtCount(counts.get(t.id) ?? 0)}</span>
                  </span>
                </button>
              ))}
              {sorted.length === 0 && (
                <span className="muted" style={{ padding: 10 }}>
                  {tags.length === 0 ? 'No tags yet. Add one to a clip in the player.' : 'No tag matches.'}
                </span>
              )}
            </div>
          </div>

          <div className="tag-editor">
            {!selected ? (
              <span className="muted">Pick a tag on the left to edit it.</span>
            ) : (
              <>
                <div className="block">
                  <span className="h-label">Name</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="field"
                      style={{ flex: 1, minWidth: 0 }}
                      value={name}
                      aria-label="Tag name"
                      onChange={(e) => setName(e.target.value)}
                      onBlur={rename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') setName(selected.name)
                      }}
                    />
                    <span className="muted mono" style={{ fontSize: 12 }}>
                      {fmtCount(used)} clip{used === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                <div className="block">
                  <span className="h-label">After adding this tag, suggest</span>
                  <div className="chips">
                    {suggestsList.length === 0 && <span className="muted">Nothing yet.</span>}
                    {suggestsList.map((t) => (
                      <span key={t.id} className="pill" style={{ fontSize: 13, padding: '3px 6px 3px 10px' }}>
                        {t.name}
                        <button
                          aria-label={`Stop suggesting ${t.name}`}
                          onClick={() => updateTag(selected.id, { suggests: (selected.suggests ?? []).filter((id) => id !== t.id) })}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <TagInput
                    key={selected.id}
                    exclude={[selected.id, ...(selected.suggests ?? [])]}
                    placeholder="Add a tag to suggest…"
                    onAdd={(n) => void addSuggestion(selected.id, n)}
                  />
                </div>

                {suggestedBy.length > 0 && (
                  <div className="block">
                    <span className="h-label">Suggested after</span>
                    <div className="chips">
                      {suggestedBy.map((t) => (
                        <button key={t.id} className="pill" style={{ border: 0, color: 'inherit' }} onClick={() => setSelectedId(t.id)}>
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="block">
                  <span className="h-label">Merge or delete</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select className="field" style={{ minWidth: 180 }} value={mergeInto} aria-label="Merge into" onChange={(e) => setMergeInto(e.target.value)}>
                      <option value="">Merge into…</option>
                      {sorted
                        .filter((t) => t.id !== selected.id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                    <button className="btn" disabled={!mergeInto} onClick={() => void merge()}>
                      Merge
                    </button>
                    <button className="btn danger" style={{ marginLeft: 'auto' }} onClick={() => void remove()}>
                      <Trash2 size={16} />
                      Delete tag
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
