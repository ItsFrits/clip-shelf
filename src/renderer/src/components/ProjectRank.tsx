import { Check, Film, Star, Undo2, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { effectiveKeymap, formatChord } from '@shared/keymap'
import {
  answerRank,
  canUndoRank,
  currentMatch,
  questionsLeft,
  type RankState,
  setUseRatings,
  skipRank,
  startRanking,
  undoRank
} from '@shared/ranking'
import type { Clip, Project } from '@shared/types'
import { fmtDay, fmtDuration, fmtTime, plural } from '../lib/format'
import { registerRankMode } from '../lib/hotkeys'
import { useApp, useSettings } from '../lib/store'
import { KeyHint } from './KeyHint'
import { TagPills } from './TagPills'

/** One of the two clips: a looping video that is silent until you click it. */
function RankClip({
  clipKey,
  clip,
  sound,
  volume,
  onSound
}: {
  clipKey: string
  clip: Clip | undefined
  sound: boolean
  volume: number
  onSound: () => void
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.src = `clip://video/${clipKey}`
    void v.play().catch(() => undefined)
    // Let go of the file when the clip leaves the screen.
    return () => {
      v.pause()
      v.removeAttribute('src')
      v.load()
    }
  }, [clipKey])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !sound
    v.volume = Math.max(0, Math.min(1, volume))
  }, [sound, volume])

  return (
    <button
      type="button"
      className={'rank-video' + (sound ? ' on' : '')}
      aria-label={sound ? 'Turn the sound off' : 'Turn the sound on'}
      aria-pressed={sound}
      onClick={onSound}
    >
      <video
        ref={videoRef}
        loop
        playsInline
        poster={clip?.hasThumb ? `clip://thumb/${clipKey}` : undefined}
        onError={() => setFailed(true)}
      />
      {(failed || !clip) && (
        <span className="rank-failed">
          <Film size={28} strokeWidth={1.5} />
          {clip ? 'This video cannot be played' : 'Clip not in your library right now'}
        </span>
      )}
      <span className="rank-sound">{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</span>
    </button>
  )
}

/** What you know about a clip, under its video. */
function RankInfo({
  clipKey,
  clip
}: {
  clipKey: string
  clip: Clip | undefined
}): React.JSX.Element {
  const user = useApp((s) => s.user.clips[clipKey])
  const tagById = useApp((s) => s.tagById)
  const rating = user?.rating ?? 0
  const tags = (user?.tags ?? []).map((id) => tagById.get(id)?.name).filter((n): n is string => !!n)
  const note = (user?.note ?? '').trim().replace(/\s+/g, ' ')
  return (
    <div className="rank-info">
      <span className="rank-line">
        {clip && (
          <>
            <b>
              {fmtDay(clip.date)}, {fmtTime(clip.date)}
            </b>
            <span className="muted">{fmtDuration(clip.durationMs)}</span>
          </>
        )}
        {rating > 0 && (
          <span className="rating-mini">
            <Star size={13} fill="currentColor" strokeWidth={0} />
            {rating}
          </span>
        )}
      </span>
      {tags.length > 0 && <TagPills tags={tags} className="ord-tags" />}
      {note && <span className="rank-note">{note}</span>}
    </div>
  )
}

/**
 * Rank mode: two clips side by side, the better one goes higher in the order. The clip on the left is
 * the one being placed. Every clip that finds its place is saved at once.
 */
export function ProjectRank({
  project,
  queue,
  onClose
}: {
  project: Project
  /** The clips to rank, in the order they come up. */
  queue: string[]
  onClose: () => void
}): React.JSX.Element {
  const clips = useApp((s) => s.clips)
  const setOrder = useApp((s) => s.setProjectOrder)
  const updateSettings = useApp((s) => s.updateSettings)
  const settings = useSettings()
  const keymap = effectiveKeymap(settings.keymap)
  const [state, setState] = useState<RankState>(() => {
    const s = useApp.getState()
    return startRanking({
      order: project.order,
      queue,
      ratingOf: (k) => s.user.clips[k]?.rating ?? 0,
      canCompare: (k) => s.clips.has(k),
      useRatings: s.user.settings.rankUseRatings
    })
  })
  const [soundKey, setSoundKey] = useState<string | null>(null)

  useEffect(() => {
    setOrder(project.id, state.order)
  }, [state.order, project.id, setOrder])

  useEffect(() => {
    // An Undo button of an earlier change would work on the order underneath this screen.
    const s = useApp.getState()
    for (const t of s.toasts) if (!t.sticky) s.dismissToast(t.id)
  }, [])

  useEffect(
    () =>
      registerRankMode((id) => {
        if (id === 'back') onClose()
        else if (id === 'undo') setState(undoRank)
        else if (id === 'rankLeft') setState((s) => answerRank(s, 'left'))
        else if (id === 'rankRight') setState((s) => answerRank(s, 'right'))
        else if (id === 'rankEqual') setState((s) => answerRank(s, 'equal'))
        else if (id === 'rankSkip') setState(skipRank)
      }),
    [onClose]
  )

  const hint = (id: string): React.JSX.Element | null => {
    const chord = keymap[id]?.[0]
    return chord ? <KeyHint>{formatChord(chord)}</KeyHint> : null
  }

  const match = currentMatch(state)
  const left = questionsLeft(state)

  const side = (which: 'left' | 'right', key: string): React.JSX.Element => (
    <section
      className="rank-side"
      aria-label={which === 'left' ? 'Left clip' : 'Right clip'}
      data-key={key}
    >
      <h2>
        {which === 'left' ? 'New clip' : `Number ${state.order.indexOf(key) + 1} in the order`}
      </h2>
      <RankClip
        key={key}
        clipKey={key}
        clip={clips.get(key)}
        sound={soundKey === key}
        volume={settings.masterVolume}
        onSound={() => setSoundKey((k) => (k === key ? null : key))}
      />
      <RankInfo clipKey={key} clip={clips.get(key)} />
      <button
        type="button"
        className="btn primary lg"
        onClick={() => setState((s) => answerRank(s, which))}
      >
        {which === 'left' ? 'Left is better' : 'Right is better'}
        {hint(which === 'left' ? 'rankLeft' : 'rankRight')}
      </button>
    </section>
  )

  return (
    <div className="rank" role="dialog" aria-label="Rank mode">
      <div className="rank-head">
        <h1>Rank: {project.name}</h1>
        {match && (
          <span className="muted">
            Clip {state.index + 1} of {state.queue.length} · about {plural(left, 'question')} left
          </span>
        )}
        <span className="rank-space" />
        <label
          className="rank-ratings"
          data-tip="Only compare a clip with clips around the same star rating. A clip without stars is compared with everything."
        >
          Use star ratings
          <button
            type="button"
            role="switch"
            aria-checked={settings.rankUseRatings}
            className={'switch' + (settings.rankUseRatings ? ' on' : '')}
            onClick={(e) => {
              e.currentTarget.blur()
              const on = !settings.rankUseRatings
              updateSettings({ rankUseRatings: on })
              setState((s) => setUseRatings(s, on))
            }}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={!canUndoRank(state)}
          onClick={() => setState(undoRank)}
        >
          <Undo2 size={16} />
          Undo
          {hint('undo')}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          <X size={16} />
          Stop
          {hint('back')}
        </button>
      </div>

      {match ? (
        <>
          <div className="rank-pair">
            {side('left', match.key)}
            {side('right', match.against)}
          </div>
          <div className="rank-foot">
            <button
              type="button"
              className="btn"
              data-tip="Put the new clip right after the other one"
              onClick={() => setState((s) => answerRank(s, 'equal'))}
            >
              Equal
              {hint('rankEqual')}
            </button>
            <button
              type="button"
              className="btn ghost"
              data-tip="Leave this clip without a place for now"
              onClick={() => setState(skipRank)}
            >
              Skip
              {hint('rankSkip')}
            </button>
          </div>
        </>
      ) : (
        <div className="empty">
          <Check size={48} strokeWidth={1.25} />
          <h2>
            {state.placed > 0
              ? `${plural(state.placed, 'clip')} got a place`
              : 'No clips got a place'}
          </h2>
          <span>
            {state.skipped > 0
              ? `${plural(state.skipped, 'clip')} skipped, still under To place. `
              : ''}
            The order is best first. Reverse turns it around.
          </span>
          <button type="button" className="btn primary lg" onClick={onClose}>
            Back to the order
          </button>
        </div>
      )}
    </div>
  )
}
