import { FolderPlus, X } from 'lucide-react'
import { useMemo } from 'react'
import { useApp } from '../lib/store'
import { Dropdown } from './Dropdown'

/** The projects a clip is in. Click one to open it, and add the clip to more of them. */
export function PlayerProjects({ clipKey }: { clipKey: string }): React.JSX.Element {
  const projects = useApp((s) => s.user.projects)
  const activeId = useApp((s) => s.user.settings.activeProjectId)
  const openProject = useApp((s) => s.openProject)
  const addToProject = useApp((s) => s.addToProject)
  const removeFromProject = useApp((s) => s.removeFromProject)

  // The active project comes first in both lists.
  const sorted = useMemo(
    () => [...projects].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId)),
    [projects, activeId]
  )
  const inside = sorted.filter((p) => p.clipKeys.includes(clipKey))
  const others = sorted.filter((p) => !p.clipKeys.includes(clipKey))

  return (
    <section className="side-sec">
      <h2 className="h-label">Projects</h2>
      {projects.length === 0 && (
        <span className="muted" style={{ fontSize: 13 }}>
          No projects yet. Make one on the Projects page.
        </span>
      )}
      {projects.length > 0 && inside.length === 0 && (
        <span className="muted" style={{ fontSize: 13 }}>
          Not in a project yet
        </span>
      )}
      {inside.length > 0 && (
        <div className="pjc-list">
          {inside.map((p) => (
            <span key={p.id} className="pjc-chip">
              <button
                type="button"
                className="pjc-open"
                title="Open this project"
                onClick={() => openProject(p.id)}
              >
                {p.name}
                {p.id === activeId && <span className="pjc-active">active</span>}
              </button>
              <button
                type="button"
                className="pjc-x"
                aria-label={`Remove from ${p.name}`}
                title={`Remove from ${p.name}`}
                onClick={() => removeFromProject(p.id, [clipKey])}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <Dropdown
          ariaLabel="Add this clip to a project"
          options={others.map((p) => ({ value: p.id, label: p.name }))}
          onPick={(id) => addToProject(id, [clipKey])}
          minWidth={220}
          className="btn small pjc-add"
        >
          <FolderPlus size={14} />
          Add to a project
        </Dropdown>
      )}
    </section>
  )
}
