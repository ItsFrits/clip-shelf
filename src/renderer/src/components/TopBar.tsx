import { LayoutGrid, Play, Search, Settings, Shuffle, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { formatChord, effectiveKeymap } from '@shared/keymap'
import { useApp } from '../lib/store'

export function TopBar(): React.JSX.Element {
  const query = useApp((s) => s.filters.query)
  const setFilters = useApp((s) => s.setFilters)
  const randomClip = useApp((s) => s.randomClip)
  const openSettings = useApp((s) => s.openSettings)
  const overrides = useApp((s) => s.user.settings.keymap)
  const keymap = useMemo(() => effectiveKeymap(overrides), [overrides])
  const chord = (id: string): string => formatChord(keymap[id]?.[0] ?? '').replace('Ctrl+', 'Ctrl ')

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <Play size={18} fill="currentColor" strokeWidth={0} />
        </span>
        <span className="brand-name">Clip Shelf</span>
      </div>
      <label className="search">
        <Search size={18} strokeWidth={1.75} />
        <input
          id="search-input"
          type="search"
          value={query}
          placeholder="Search notes, tags and file names"
          aria-label="Search clips"
          onChange={(e) => setFilters({ query: e.target.value })}
        />
        <span className="kbd">{chord('search')}</span>
      </label>
      <div className="topbar-actions">
        <button className="btn lg primary" onClick={randomClip}>
          <Shuffle size={18} strokeWidth={2} />
          Random clip
          <span className="kbd" style={{ background: 'rgba(26,15,5,.14)', border: 0, color: 'inherit' }}>
            {chord('random')}
          </span>
        </button>
        <button className="btn lg" disabled title="Coming in the next version">
          <Sparkles size={18} strokeWidth={1.75} />
          <span className="lbl">Sort mode</span>
        </button>
        <button className="btn lg" disabled title="Coming in the next version">
          <LayoutGrid size={18} strokeWidth={1.75} />
          <span className="lbl">Projects</span>
        </button>
        <button className="btn lg icon" aria-label="Settings" onClick={() => openSettings()}>
          <Settings size={18} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  )
}
