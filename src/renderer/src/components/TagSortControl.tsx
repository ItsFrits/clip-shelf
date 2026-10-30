import type { TagSort } from '@shared/types'
import { useApp, useSettings } from '../lib/store'

const OPTIONS: { id: TagSort; label: string; title: string }[] = [
  { id: 'name', label: 'A-Z', title: 'Alphabetical' },
  { id: 'count', label: 'Most clips', title: 'Tags on the most clips first' },
  { id: 'recent', label: 'Recent', title: 'Tags you used most recently first' }
]

/** Choose how tags are ordered. One choice, used by the sidebar and by Settings, Tags. */
export function TagSortControl(): React.JSX.Element {
  const sort = useSettings().tagSort
  const updateSettings = useApp((s) => s.updateSettings)
  return (
    <div className="seg tag-sort" role="group" aria-label="Sort tags">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          className={sort === o.id ? 'on' : ''}
          title={o.title}
          onClick={() => updateSettings({ tagSort: o.id })}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
