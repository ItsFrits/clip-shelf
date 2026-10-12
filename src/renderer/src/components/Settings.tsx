import { ChevronLeft, FolderPlus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  ACTIONS,
  type ActionDef,
  chordFromEvent,
  effectiveKeymap,
  findConflict,
  formatChord
} from '@shared/keymap'
import type { FolderInfo } from '@shared/types'
import { fmtBytes, fmtCount } from '../lib/format'
import { type SettingsTab, useApp, useSettings } from '../lib/store'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'folders', label: 'Folders' },
  { id: 'playback', label: 'Playback & editor' },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'backup', label: 'Backup & updates' }
]

export function Settings(): React.JSX.Element {
  const tab = useApp((s) => s.settingsTab)
  const openSettings = useApp((s) => s.openSettings)
  const setView = useApp((s) => s.setView)

  return (
    <div className="settings">
      <header className="player-head">
        <button className="btn" onClick={() => setView('library')}>
          <ChevronLeft size={16} strokeWidth={2} />
          Library
        </button>
        <span className="player-title">Settings</span>
      </header>
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
            {tab === 'folders' && <FoldersTab />}
            {tab === 'playback' && <PlaybackTab />}
            {tab === 'hotkeys' && <HotkeysTab />}
            {tab === 'backup' && <BackupTab />}
          </div>
        </div>
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
