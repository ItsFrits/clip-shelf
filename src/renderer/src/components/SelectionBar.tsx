import { Download, Star, Tag, Trash2, X } from 'lucide-react'
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
  const settings = useSettings()
  const [open, setOpen] = useState<'tag' | 'rate' | null>(null)
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
          {withAudio} of them {withAudio === 1 ? 'has' : 'have'} a separate mic file that comes along
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
