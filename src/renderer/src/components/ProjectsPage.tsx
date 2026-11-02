import { Check, Copy, FolderOpen, Pencil, Pin, Plus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { lengthLabel, projectStats } from '@shared/projects'
import type { Project } from '@shared/types'
import { plural } from '../lib/format'
import { useApp } from '../lib/store'

const THUMBS = 4

function ProjectCard({
  project,
  active
}: {
  project: Project
  active: boolean
}): React.JSX.Element {
  const clips = useApp((s) => s.clips)
  const openProject = useApp((s) => s.openProject)
  const setActiveProject = useApp((s) => s.setActiveProject)
  const deleteProject = useApp((s) => s.deleteProject)
  const removeFromProject = useApp((s) => s.removeFromProject)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(project.name)
  const stats = projectStats(project, clips)
  const shown = project.clipKeys.filter((k) => clips.has(k)).slice(0, THUMBS)

  const finishRename = (save: boolean): void => {
    setRenaming(false)
    const clean = name.trim()
    if (save && clean && clean !== project.name) void window.api.renameProject(project.id, clean)
  }

  return (
    <div
      className={'proj-card' + (active ? ' active' : '')}
      onClick={() => !renaming && openProject(project.id)}
    >
      <div className="proj-thumbs" aria-hidden>
        {Array.from({ length: THUMBS }, (_, i) => (
          <div key={i} className="proj-thumb">
            {shown[i] && <img src={`clip://thumb/${shown[i]}`} alt="" draggable={false} />}
          </div>
        ))}
      </div>
      <div className="proj-body">
        {renaming ? (
          <input
            className="field"
            autoFocus
            value={name}
            maxLength={60}
            aria-label="Project name"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => finishRename(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishRename(true)
              if (e.key === 'Escape') {
                e.stopPropagation()
                finishRename(false)
              }
            }}
          />
        ) : (
          <div className="proj-name-row">
            <h3 className="proj-name">{project.name}</h3>
            {active && (
              <span
                className="proj-active"
                title="The active project. The P key adds the open or selected clips to it."
              >
                <Pin size={12} /> Active
              </span>
            )}
          </div>
        )}
        <span className="muted proj-meta">
          {plural(stats.count - stats.missing, 'clip')} · {lengthLabel(stats)}
        </span>
        {stats.missing > 0 && (
          <span className="proj-missing">
            {plural(stats.missing, 'clip')} not in your library right now (drive offline?){' '}
            <button
              className="btn ghost small"
              title="Take the clips that are not in your library out of this project"
              onClick={(e) => {
                e.stopPropagation()
                removeFromProject(
                  project.id,
                  project.clipKeys.filter((k) => !clips.has(k))
                )
              }}
            >
              Remove {stats.missing === 1 ? 'it' : 'them'}
            </button>
          </span>
        )}
      </div>
      <div className="proj-actions" onClick={(e) => e.stopPropagation()}>
        <button className="btn small" onClick={() => openProject(project.id)}>
          <FolderOpen size={14} />
          Open
        </button>
        <button
          className={'btn small icon' + (active ? ' on' : '')}
          aria-label={active ? 'Stop using as the active project' : 'Make the active project'}
          title={
            active
              ? 'This is the active project. Click to stop.'
              : 'Make this the active project. The P key then adds clips to it.'
          }
          onClick={() => setActiveProject(active ? null : project.id)}
        >
          {active ? <Check size={14} /> : <Pin size={14} />}
        </button>
        <button
          className="btn small icon"
          aria-label="Rename project"
          title="Rename"
          onClick={() => {
            setName(project.name)
            setRenaming(true)
          }}
        >
          <Pencil size={14} />
        </button>
        <button
          className="btn small icon"
          aria-label="Duplicate project"
          title="Duplicate (same clips, a new name)"
          onClick={() => void window.api.duplicateProject(project.id)}
        >
          <Copy size={14} />
        </button>
        <button
          className="btn small icon danger"
          aria-label="Delete project"
          title="Delete project"
          onClick={() => void deleteProject(project.id)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

export function ProjectsPage(): React.JSX.Element {
  const projects = useApp((s) => s.user.projects)
  const activeId = useApp((s) => s.user.settings.activeProjectId)
  const createProject = useApp((s) => s.createProject)
  const [name, setName] = useState('')
  const input = useRef<HTMLInputElement>(null)

  // The active project first, then the newest.
  const sorted = useMemo(
    () =>
      [...projects].sort(
        (a, b) => Number(b.id === activeId) - Number(a.id === activeId) || b.createdAt - a.createdAt
      ),
    [projects, activeId]
  )

  const create = async (): Promise<void> => {
    const clean = name.trim()
    if (!clean) {
      input.current?.focus()
      return
    }
    setName('')
    await createProject(clean)
  }

  return (
    <div className="lib">
      <div className="lib-head">
        <div className="lib-title-row">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 className="lib-title">Projects</h1>
            <span className="muted">
              {projects.length === 0
                ? 'Collect the clips for a video in one place.'
                : `${plural(projects.length, 'project')} · a clip can be in more than one`}
            </span>
          </div>
          <form
            className="lib-tools"
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <input
              ref={input}
              className="field proj-new"
              placeholder="Name of a new project"
              value={name}
              maxLength={60}
              aria-label="Name of a new project"
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="btn primary" disabled={!name.trim()}>
              <Plus size={16} />
              New project
            </button>
          </form>
        </div>
      </div>
      {projects.length === 0 ? (
        <div className="empty">
          <FolderOpen size={48} strokeWidth={1.25} />
          <h2>No projects yet</h2>
          <span>
            Make one above, or select clips in your library and use Add to project in the bar at the
            bottom.
          </span>
        </div>
      ) : (
        <div className="lib-scroll">
          <div className="proj-grid">
            {sorted.map((p) => (
              <ProjectCard key={p.id} project={p} active={p.id === activeId} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
