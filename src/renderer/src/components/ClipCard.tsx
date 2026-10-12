import { Check, Film, Star } from 'lucide-react'
import { memo } from 'react'
import type { Clip } from '@shared/types'
import { clipStatus, EMPTY_CLIP_USER } from '@shared/userLogic'
import { STATUS_COLOR, STATUS_LABEL } from '../lib/filter'
import { fmtDay, fmtDuration, fmtTime } from '../lib/format'
import { useApp } from '../lib/store'

interface Props {
  clip: Clip
  /** Show the date next to the time (when clips are not grouped by day). */
  showDate: boolean
}

function ClipCardBase({ clip, showDate }: Props): React.JSX.Element {
  const user = useApp((s) => s.user.clips[clip.key]) ?? EMPTY_CLIP_USER
  const selected = useApp((s) => s.selected.has(clip.key))
  const anySelected = useApp((s) => s.selected.size > 0)
  const tagById = useApp((s) => s.tagById)
  const folderName = useApp((s) => s.folders.find((f) => f.id === clip.files[0]?.folderId)?.name ?? '')
  const offline = useApp((s) => {
    const online = new Set(s.folders.filter((f) => f.online).map((f) => f.id))
    return !clip.files.some((f) => online.has(f.folderId))
  })

  const status = clipStatus(user)
  const tags = user.tags.map((id) => tagById.get(id)?.name).filter((n): n is string => !!n)
  const tagNamesLower = tags.map((t) => t.toLowerCase())
  const suggestion = clip.hints.find((h) => !user.ignoredHints.includes(h) && !tagNamesLower.includes(h.toLowerCase()))
  const hasAux = clip.files.some((f) => f.audioPath)
  const trackCount = clip.audioTracks ? clip.audioTracks.length + (hasAux ? 1 : 0) : 0

  const onClick = (e: React.MouseEvent): void => {
    const s = useApp.getState()
    if (e.shiftKey) s.select(clip.key, 'range')
    else if (e.ctrlKey || e.metaKey || s.selected.size > 0) s.select(clip.key, 'toggle')
    else s.openPlayer(clip.key)
  }

  return (
    <div
      className={'card' + (selected ? ' selected' : '') + (offline ? ' offline' : '') + (anySelected ? ' has-selection' : '')}
      draggable
      onClick={onClick}
      onDragStart={(e) => {
        e.preventDefault()
        const s = useApp.getState()
        s.startDrag(s.selected.has(clip.key) ? [...s.selected] : [clip.key])
      }}
    >
      <div className="thumb">
        {clip.hasThumb ? (
          <img src={`clip://thumb/${clip.key}`} alt="" draggable={false} loading="lazy" />
        ) : (
          <div className="placeholder">
            <Film size={28} strokeWidth={1.5} />
          </div>
        )}
        <span className="badge tl">
          {folderName}
          {clip.files.length > 1 ? ` +${clip.files.length - 1}` : ''}
        </span>
        <span className="badge tr mono">{fmtDuration(clip.durationMs)}</span>
        {trackCount > 0 && <span className="badge br">{trackCount === 1 ? '1 track' : `${trackCount} tracks`}</span>}
        {offline && <span className="badge center">Drive offline</span>}
        <button
          type="button"
          className="check"
          aria-label={selected ? 'Deselect clip' : 'Select clip'}
          onClick={(e) => {
            e.stopPropagation()
            useApp.getState().select(clip.key, 'toggle')
          }}
        >
          <Check size={14} strokeWidth={3} />
        </button>
      </div>
      <div className="card-meta">
        <div className="left">
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{showDate ? `${fmtDay(clip.date)}, ` : ''}{fmtTime(clip.date)}</span>
          <span className="status" style={{ color: STATUS_COLOR[status] }}>
            <span className="dot" style={{ background: STATUS_COLOR[status] }} />
            {STATUS_LABEL[status]}
          </span>
        </div>
        {user.rating > 0 && (
          <span className="rating-mini">
            <Star size={14} fill="currentColor" strokeWidth={0} />
            {user.rating}
          </span>
        )}
      </div>
      <div className="card-tags">
        {tags.slice(0, 2).map((t) => (
          <span key={t} className="pill">
            {t}
          </span>
        ))}
        {tags.length > 2 && <span className="pill">+{tags.length - 2}</span>}
        {suggestion && (
          <span
            className="pill suggest"
            title="Suggested from the folder name. Click to add it, right-click to ignore."
            onClick={(e) => {
              e.stopPropagation()
              void useApp.getState().addTagByName([clip.key], suggestion)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              useApp.getState().patch([clip.key], { set: { ignoredHints: [...user.ignoredHints, suggestion] } })
            }}
          >
            + {suggestion}
          </span>
        )}
      </div>
      <div className="card-file" title={clip.files[0]?.path}>
        {clip.name}
      </div>
    </div>
  )
}

export const ClipCard = memo(ClipCardBase)
