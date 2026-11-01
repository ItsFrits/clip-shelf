import { Check, Download, FolderMinus, FolderPlus, Pin, Star, Tag, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useApp, useSettings } from '../lib/store'
import { Stars } from './Stars'
import { TagInput } from './TagInput'

export function SelectionBar(): React.JSX.Element | null {
  const selected = useApp((s) => s.selected)
  const clips = useApp((s) => s.clips)
  const clear = useApp((s) => s.clearSelection)
  const startDrag = useApp((s) => s.startDrag)
  const patch = useApp((s) => s.patch)
  const addTagByName = useApp((s) => s.addTagByName)
  const trashKeys = useApp((s) => s.trashKeys)
  const projects = useApp((s) => s.user.projects)
  const projectId = useApp((s) => s.projectId)
  const activeId = useApp((s) => s.user.settings.activeProjectId)
  const addToProject = useApp((s) => s.addToProject)
  const removeFromProject = useApp((s) => s.removeFromProject)
  const createProject = useApp((s) => s.createProject)
  const [newName, setNewName] = useState('')
  const settings = useSettings()
  const [open, setOpen] = useState<'tag' | 'rate' | 'project' | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  if (selected.size === 0) return null
  const keys = [...selected]
  const withAudio = keys.filter((k) => clips.get(k)?.files.some((f) => f.audioPath)).length
  const editor = settings.editorName.trim() || 'editor'

  return (
    <div className="selbar" ref={wrap}>
      <span style={{ fontWeight: 600 }}>
        {keys.length} clip{keys.length === 1 ? '' : 's'} selected
      </span>
      {withAudio > 0 && settings.dragIncludeAudio && (
        <span className="muted" style={{ fontSize: 13 }}>
          {withAudio} of them {withAudio === 1 ? 'has' : 'have'} a separate mic file that comes
          along
        </span>
      )}
      <div className="actions">
        <button
          className="btn primary grab"
          draggable
          title="Drag this button into your video editor"
          onDragStart={(e) => {
            e.preventDefault()
            startDrag(keys)
          }}
        >
          <Download size={18} strokeWidth={2} />
          Drag to {editor}
        </button>
        <div className="popover-wrap">
          <button className="btn" onClick={() => setOpen(open === 'tag' ? null : 'tag')}>
            <Tag size={16} strokeWidth={1.75} />
            Tag
          </button>
          {open === 'tag' && (
            <div className="popover">
              <span className="muted" style={{ fontSize: 13 }}>
                Add a tag to {keys.length} clip{keys.length === 1 ? '' : 's'}
              </span>
              <TagInput autoFocus menuUp onAdd={(name) => void addTagByName(keys, name)} />
            </div>
          )}
        </div>
        <div className="popover-wrap">
          <button className="btn" onClick={() => setOpen(open === 'rate' ? null : 'rate')}>
            <Star size={16} strokeWidth={1.75} />
            Rate
          </button>
          {open === 'rate' && (
            <div className="popover">
              <span className="muted" style={{ fontSize: 13 }}>
                Rate {keys.length} clip{keys.length === 1 ? '' : 's'}
              </span>
              <Stars
                value={0}
                onChange={(n) => {
                  patch(keys, { set: { rating: n } }, 'Rate')
                  setOpen(null)
                }}
              />
            </div>
          )}
        </div>
        {projectId ? (
          <button
            className="btn"
            title="Take the selected clips out of this project. The clips themselves stay in your library."
            onClick={() => removeFromProject(projectId, keys)}
          >
            <FolderMinus size={16} strokeWidth={1.75} />
            Remove from project
          </button>
        ) : (
          <div className="popover-wrap">
            <button className="btn" onClick={() => setOpen(open === 'project' ? null : 'project')}>
              <FolderPlus size={16} strokeWidth={1.75} />
              Add to project
            </button>
            {open === 'project' && (
              <div className="popover">
                <span className="muted" style={{ fontSize: 13 }}>
                  Add {keys.length} clip{keys.length === 1 ? '' : 's'} to a project
                </span>
                {projects.length > 0 && (
                  <div className="proj-pick">
                    {projects.map((p) => {
                      const all = keys.every((k) => p.clipKeys.includes(k))
                      return (
                        <button
                          key={p.id}
                          className="proj-pick-row"
                          onClick={() => {
                            addToProject(p.id, keys)
                            setOpen(null)
                          }}
                        >
                          <span className="proj-pick-name">{p.name}</span>
                          {p.id === activeId && <Pin size={12} aria-label="Active project" />}
                          {all && <Check size={14} aria-label="Already in this project" />}
                        </button>
                      )
                    })}
                  </div>
                )}
                <form
                  className="proj-pick-new"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const clean = newName.trim()
                    if (!clean) return
                    setNewName('')
                    setOpen(null)
                    void createProject(clean).then((id) => addToProject(id, keys))
                  }}
                >
                  <input
                    className="field"
                    placeholder="New project"
                    value={newName}
                    maxLength={60}
                    aria-label="Name of a new project"
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <button type="submit" className="btn" disabled={!newName.trim()}>
                    Make
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
        <button className="btn danger" onClick={() => void trashKeys(keys)}>
          <Trash2 size={16} strokeWidth={1.75} />
          Move to recycle bin
        </button>
        <button className="btn icon ghost" aria-label="Clear selection" onClick={clear}>
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
