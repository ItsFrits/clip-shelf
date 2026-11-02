import { useEffect, useMemo, useState } from 'react'
import { pickedKeys, safeUrl, type UnusedAction } from '@shared/projects'
import type { Project } from '@shared/types'
import { fmtDay, fmtDuration, fmtTime, plural } from '../lib/format'
import { useApp } from '../lib/store'

/** Asks which clips ended up in the video when a project is marked as published. */
export function PublishDialog(): React.JSX.Element | null {
  const id = useApp((s) => s.publishFor)
  const project = useApp((s) => (s.publishFor ? s.user.projects.find((p) => p.id === id) : null))
  // A component of its own, so the choices start fresh every time.
  return project ? <PublishBody key={project.id} project={project} /> : null
}

function PublishBody({ project }: { project: Project }): React.JSX.Element {
  const clips = useApp((s) => s.clips)
  const openPublish = useApp((s) => s.openPublish)
  const publish = useApp((s) => s.publishProject)

  // The clips of the project that are there: the ones with a place first, in that order.
  const rows = useMemo(() => {
    const placed = new Set(project.order)
    return [...project.order, ...project.clipKeys.filter((k) => !placed.has(k))].filter((k) =>
      clips.has(k)
    )
  }, [project, clips])
  const place = useMemo(() => new Map(project.order.map((k, i) => [k, i + 1] as const)), [project])

  // Start with the clips that are in the video. A project without an order has no such clips, so
  // then every clip starts ticked.
  const [used, setUsed] = useState<Set<string>>(() => {
    const inVideo = pickedKeys(project.order, project.skipped).filter((k) => clips.has(k))
    return new Set(inVideo.length > 0 ? inVideo : rows)
  })
  const [link, setLink] = useState(project.link)
  const [unused, setUnused] = useState<UnusedAction>('move')
  const [newName, setNewName] = useState(`${project.name} part 2`)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      openPublish(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [openPublish])

  const unusedCount = project.clipKeys.length - used.size
  const toggle = (key: string): void =>
    setUsed((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const linkBad = link.trim() !== '' && !safeUrl(link)

  return (
    <div className="overlay" onMouseDown={() => openPublish(null)}>
      <div
        className="dialog pub"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>Mark “{project.name}” as published</h2>
        <p>Which clips ended up in the video?</p>
        <div className="pub-head">
          <span className="muted">
            <b>{used.size}</b> of {rows.length} used
          </span>
          <span className="pub-all">
            <button className="btn ghost small" onClick={() => setUsed(new Set(rows))}>
              All
            </button>
            <button className="btn ghost small" onClick={() => setUsed(new Set())}>
              None
            </button>
          </span>
        </div>
        <div className="pub-list">
          {rows.map((k) => {
            const clip = clips.get(k)
            if (!clip) return null
            return (
              <label key={k} className="pub-row">
                <input type="checkbox" checked={used.has(k)} onChange={() => toggle(k)} />
                <span className="pub-thumb">
                  {clip.hasThumb && <img src={`clip://thumb/${k}`} alt="" draggable={false} />}
                </span>
                <span className="pub-info">
                  {fmtDay(clip.date)}, {fmtTime(clip.date)}
                </span>
                <span className="muted mono">{fmtDuration(clip.durationMs)}</span>
                {place.has(k) && <span className="pub-place mono">#{place.get(k)}</span>}
              </label>
            )
          })}
        </div>
        <label className="pd-field">
          <span className="h-label">Link to the video (you can add it later)</span>
          <input
            className="field"
            placeholder="https://youtu.be/..."
            value={link}
            maxLength={2000}
            onChange={(e) => setLink(e.target.value)}
          />
          {linkBad && <span className="pub-warn">This does not look like a web link.</span>}
        </label>
        {unusedCount > 0 && (
          <fieldset className="pub-unused">
            <legend>The other {plural(unusedCount, 'clip')}</legend>
            <label>
              <input
                type="radio"
                name="unused"
                checked={unused === 'move'}
                onChange={() => setUnused('move')}
              />
              <span>Move to a new project</span>
              <input
                className="field"
                value={newName}
                maxLength={60}
                aria-label="Name of the new project"
                disabled={unused !== 'move'}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <label>
              <input
                type="radio"
                name="unused"
                checked={unused === 'keep'}
                onChange={() => setUnused('keep')}
              />
              <span>Keep in this project</span>
            </label>
            <label>
              <input
                type="radio"
                name="unused"
                checked={unused === 'remove'}
                onChange={() => setUnused('remove')}
              />
              <span>Take out of this project</span>
            </label>
          </fieldset>
        )}
        <div className="buttons">
          <button className="btn" onClick={() => openPublish(null)}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={used.size === 0}
            title={used.size === 0 ? 'Choose at least one clip' : undefined}
            onClick={() =>
              void publish(project.id, {
                used: [...used],
                unused,
                newName,
                link: linkBad ? '' : link
              })
            }
          >
            Mark as published
          </button>
        </div>
      </div>
    </div>
  )
}
