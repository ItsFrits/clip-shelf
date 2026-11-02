import { Check, ChevronDown, CircleDashed, ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { safeUrl } from '@shared/projects'
import type { Project } from '@shared/types'
import { useApp } from '../lib/store'

/** The status of a project, with a panel for its link and notes and the way to publish it. */
export function ProjectDetails({ project }: { project: Project }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const published = project.status === 'published'

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className="pd" ref={wrap}>
      <button
        className={'btn small pd-status' + (published ? ' published' : '')}
        aria-expanded={open}
        title="Status, link and notes of this project"
        onClick={() => setOpen(!open)}
      >
        {published ? <Check size={14} strokeWidth={2.5} /> : <CircleDashed size={14} />}
        {published ? 'Published' : 'Working'}
        <ChevronDown size={14} />
      </button>
      {open && <DetailsBody project={project} close={() => setOpen(false)} />}
    </div>
  )
}

function DetailsBody({
  project,
  close
}: {
  project: Project
  close: () => void
}): React.JSX.Element {
  const update = useApp((s) => s.updateProject)
  const openPublish = useApp((s) => s.openPublish)
  const openLink = useApp((s) => s.openLink)
  const [link, setLink] = useState(project.link)
  const [notes, setNotes] = useState(project.notes)
  const latest = useRef({ link, notes })
  useEffect(() => {
    latest.current = { link, notes }
  })
  const published = project.status === 'published'
  const url = safeUrl(link)

  // Save what was typed, also when the panel closes while a field still has focus.
  const save = (): void => {
    const now = useApp.getState().user.projects.find((p) => p.id === project.id)
    if (!now) return
    const patch: { link?: string; notes?: string } = {}
    if (latest.current.link.trim() !== now.link) patch.link = latest.current.link
    if (latest.current.notes !== now.notes) patch.notes = latest.current.notes
    if (patch.link !== undefined || patch.notes !== undefined) update(project.id, patch)
  }
  useEffect(() => save, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pd-pop" role="dialog" aria-label="Project details">
      <span className="muted" style={{ fontSize: 13 }}>
        {published
          ? 'This video is out. Its clips count as used.'
          : 'You are still working on this video.'}
      </span>
      <label className="pd-field">
        <span className="h-label">Link to the video</span>
        <div className="pd-link">
          <input
            className="field"
            placeholder="https://youtu.be/..."
            value={link}
            maxLength={2000}
            onChange={(e) => setLink(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />
          <button
            className="btn small"
            disabled={!url}
            title={url ? 'Open the video in your browser' : 'Fill in a link first'}
            onClick={() => {
              save()
              openLink(link)
            }}
          >
            <ExternalLink size={14} />
            Watch
          </button>
        </div>
      </label>
      <label className="pd-field">
        <span className="h-label">Notes</span>
        <textarea
          className="field"
          rows={4}
          placeholder="Ideas, what to fix, the title you want..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={save}
        />
      </label>
      {published ? (
        <button
          className="btn"
          title="Move this project back to Working"
          onClick={() => {
            save()
            update(project.id, { status: 'working' })
            close()
          }}
        >
          Back to working
        </button>
      ) : (
        <button
          className="btn primary"
          title="Choose which clips ended up in the video"
          onClick={() => {
            save()
            close()
            openPublish(project.id)
          }}
        >
          <Check size={16} strokeWidth={2.5} />
          Mark as published...
        </button>
      )}
    </div>
  )
}
