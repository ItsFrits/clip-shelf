import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { filtersWithPreset } from '@shared/presets'
import { formatChord } from '@shared/keymap'
import { sanitizeSavedFilters, toSavedFilters } from '@shared/savedFilters'
import type { Preset } from '@shared/types'
import { DEFAULT_FILTERS, filterClips } from '../lib/filter'
import { fmtCount } from '../lib/format'
import { presetSummary, resolvePreset, usePresetState } from '../lib/presets'
import { useApp } from '../lib/store'

const MIN_WIDTH = 300
/** How many filters a row shows before it says "+n". */
const SHOWN = 3

/** The preset dropdown in the sidebar, and the bar under it that shows when the filters were changed. */
export function PresetPicker(): React.JSX.Element {
  const state = usePresetState()
  const applyPreset = useApp((s) => s.applyPreset)
  const savePresetChanges = useApp((s) => s.savePresetChanges)
  const ignorePreset = useApp((s) => s.ignorePreset)
  const setNewPresetOpen = useApp((s) => s.setNewPresetOpen)
  const [open, setOpen] = useState(false)
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null)

  const label =
    state.kind === 'all'
      ? 'All clips'
      : state.kind === 'custom'
        ? 'Custom'
        : (state.active?.name ?? '')

  return (
    <div className="preset-picker">
      <button
        ref={setBtn}
        type="button"
        className={'preset-trigger' + (open ? ' open' : '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Preset: ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="preset-trigger-name">{label}</span>
        {state.modified && (
          <span
            className="preset-dot"
            title="You changed the filters since this preset was saved"
          />
        )}
        <ChevronDown size={16} className="dd-chevron" />
      </button>

      {state.kind === 'preset' && state.modified && (
        <div className="preset-bar" role="group" aria-label="Preset changes">
          <span>Changed since saved</span>
          <div className="preset-bar-actions">
            <button
              type="button"
              className="btn small primary"
              title="Keep these changes in the preset"
              onClick={savePresetChanges}
            >
              Save
            </button>
            <button
              type="button"
              className="btn small"
              title="Go back to the preset as it was saved"
              onClick={() => applyPreset(state.active!.id)}
            >
              Revert
            </button>
            <button
              type="button"
              className="btn small ghost"
              title="Keep the filters as they are, but stop following this preset"
              onClick={ignorePreset}
            >
              Ignore
            </button>
          </div>
        </div>
      )}
      {state.kind === 'custom' && (
        <div className="preset-bar" role="group" aria-label="Custom filters">
          <span>Not saved as a preset</span>
          <div className="preset-bar-actions">
            <button type="button" className="btn small" onClick={() => setNewPresetOpen(true)}>
              Save as preset…
            </button>
            <button type="button" className="btn small ghost" onClick={() => applyPreset(null)}>
              Clear
            </button>
          </div>
        </div>
      )}

      {open && btn && <PresetList anchorEl={btn} state={state} onClose={() => setOpen(false)} />}
    </div>
  )
}

type Item = { kind: 'all' } | { kind: 'new' } | { kind: 'preset'; preset: Preset }

function PresetList({
  anchorEl,
  state,
  onClose
}: {
  anchorEl: HTMLElement
  state: ReturnType<typeof usePresetState>
  onClose: () => void
}): React.JSX.Element {
  const applyPreset = useApp((s) => s.applyPreset)
  const setNewPresetOpen = useApp((s) => s.setNewPresetOpen)
  const clips = useApp((s) => s.clips)
  const user = useApp((s) => s.user)
  const folders = useApp((s) => s.user.folders)
  const filters = useApp((s) => s.filters)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number } | null>(
    null
  )
  const ref = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  // The list is only mounted while it is open, so "now" is taken once when it opens.
  const [now] = useState(() => Date.now())

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? state.presets.filter((p) => p.name.toLowerCase().includes(q)) : state.presets
  }, [state.presets, query])
  const items: Item[] = [
    { kind: 'all' },
    { kind: 'new' },
    ...shown.map((preset) => ({ kind: 'preset' as const, preset }))
  ]

  // The number of clips each preset would show right now (without the search text).
  const counts = useMemo(() => {
    const tagIds = user.tags.map((t) => t.id)
    const folderIds = folders.map((f) => f.id)
    const ctx = { user, tags: user.tags, folders: [] }
    const current = toSavedFilters(filters)
    const out = new Map<string, number>()
    for (const p of state.presets) {
      const saved = sanitizeSavedFilters(
        filtersWithPreset(resolvePreset(p, tagIds, folderIds), current),
        tagIds,
        folderIds,
        now
      )
      out.set(
        p.id,
        filterClips(clips.values(), ctx, { ...DEFAULT_FILTERS, ...saved, query: '' }).length
      )
    }
    return out
  }, [state.presets, clips, user, folders, filters, now])

  const tagName = (id: string): string | undefined => user.tags.find((t) => t.id === id)?.name
  const folderName = (id: string): string | undefined => folders.find((f) => f.id === id)?.name

  useLayoutEffect(() => {
    const place = (): void => {
      const r = anchorEl.getBoundingClientRect()
      const width = Math.max(r.width, MIN_WIDTH)
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      const top = r.bottom + 6
      setPos({ left, top, width, maxH: window.innerHeight - top - 12 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchorEl])

  // The search field gets the focus as soon as the list is placed.
  const placed = pos !== null
  useEffect(() => {
    if (placed) search.current?.focus()
  }, [placed])

  // Keep the active row in view while moving with the keys.
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (item: Item): void => {
    onClose()
    if (item.kind === 'all') applyPreset(null)
    else if (item.kind === 'new') setNewPresetOpen(true)
    else applyPreset(item.preset.id)
  }

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        anchorEl.focus()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const item = items[active]
        if (item) choose(item)
      }
    }
    const down = (e: MouseEvent): void => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchorEl.contains(t)) return
      onClose()
    }
    window.addEventListener('keydown', key, true)
    window.addEventListener('mousedown', down, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('mousedown', down, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, active, query, state.presets])

  // Typing in the search field must not trigger the library hotkeys.
  const setCapturing = useApp((s) => s.setCapturing)
  useEffect(() => {
    setCapturing(true)
    return () => setCapturing(false)
  }, [setCapturing])

  const row = (item: Item, index: number): React.JSX.Element => {
    const isActive = index === active
    if (item.kind === 'all') {
      const chosen = state.kind === 'all'
      return (
        <div
          key="all"
          role="option"
          aria-selected={chosen}
          data-active={isActive}
          className={'pp-row' + (isActive ? ' active' : '') + (chosen ? ' chosen' : '')}
          onMouseEnter={() => setActive(index)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(item)}
        >
          <div className="pp-top">
            <span className="pp-name">All clips</span>
            {chosen && <Check size={14} />}
            <span className="pp-count">{fmtCount(clips.size)}</span>
          </div>
          <div className="pp-sub">No filters</div>
        </div>
      )
    }
    if (item.kind === 'new') {
      return (
        <div
          key="new"
          role="option"
          aria-selected={false}
          data-active={isActive}
          className={'pp-row pp-new' + (isActive ? ' active' : '')}
          onMouseEnter={() => setActive(index)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(item)}
        >
          <div className="pp-top">
            <Plus size={14} />
            <span className="pp-name">New preset…</span>
          </div>
          <div className="pp-sub">From the filters you have now</div>
        </div>
      )
    }
    const p = item.preset
    const resolved = resolvePreset(
      p,
      user.tags.map((t) => t.id),
      folders.map((f) => f.id)
    )
    const summary = presetSummary(resolved, tagName, folderName)
    const text =
      summary.length === 0
        ? 'No filters'
        : summary.slice(0, SHOWN).join(' · ') +
          (summary.length > SHOWN ? ` (+${summary.length - SHOWN})` : '')
    const chosen = state.kind === 'preset' && state.active?.id === p.id
    return (
      <div
        key={p.id}
        role="option"
        aria-selected={chosen}
        data-active={isActive}
        className={'pp-row' + (isActive ? ' active' : '') + (chosen ? ' chosen' : '')}
        onMouseEnter={() => setActive(index)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(item)}
      >
        <div className="pp-top">
          <span className="pp-name">{p.name}</span>
          {chosen && <Check size={14} />}
          {p.hotkey && <span className="kbd pp-key">{formatChord(p.hotkey)}</span>}
          <span className="pp-count">{fmtCount(counts.get(p.id) ?? 0)}</span>
        </div>
        <div className="pp-sub" title={summary.join(' · ') || undefined}>
          {text}
        </div>
      </div>
    )
  }

  return createPortal(
    <div
      ref={ref}
      className="pp-list"
      role="listbox"
      aria-label="Presets"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? 0,
        width: pos?.width,
        maxHeight: pos?.maxH,
        visibility: pos ? 'visible' : 'hidden'
      }}
    >
      <div className="pp-pinned">
        {row(items[0], 0)}
        {row(items[1], 1)}
      </div>
      <label className="pp-search">
        <Search size={14} />
        <input
          ref={search}
          value={query}
          placeholder="Search presets"
          aria-label="Search presets"
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(2)
          }}
        />
      </label>
      <div className="pp-scroll" ref={scroller}>
        {items.slice(2).map((it, i) => row(it, i + 2))}
        {shown.length === 0 && (
          <div className="pp-empty muted">
            {state.presets.length === 0
              ? 'No presets yet. Make one from the filters you have now.'
              : 'No preset with that name.'}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
