import { Check, Film, Play, Star, Undo2, X } from 'lucide-react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
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
import { trackLevels } from '@shared/userLogic'
import { fmtDay, fmtSeconds, fmtTime, plural } from '../lib/format'
import { registerRankMode } from '../lib/hotkeys'
import { Mixer } from '../lib/mixer'
import { useApp, useSettings } from '../lib/store'
import { KeyHint } from './KeyHint'
import { TagPills } from './TagPills'

/** How far the keys jump back or forward in a video. */
const SEEK_STEP = 5

/** What the keys can do with one of the two videos. */
interface VideoControls {
  toggle: () => void
  jump: (dir: 1 | -1) => void
}

/** Everything in rank mode that Tab can go to. */
const FOCUSABLE = 'button:not(:disabled), input, [href], [tabindex]:not([tabindex="-1"])'

/**
 * One of the two clips: a looping video with all its audio tracks. It plays only after you click it,
 * each clip on its own, and has a bar to jump back and forth.
 */
function RankClip({
  clipKey,
  clip,
  controls
}: {
  clipKey: string
  clip: Clip | undefined
  controls: React.Ref<VideoControls>
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  // The video stays silent until its audio tracks are there, so you never hear only a part.
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [failed, setFailed] = useState(false)

  // The video with a mixer for its tracks, at the volumes the player uses for this clip.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let gone = false
    const mixer = new Mixer(v)
    mixer.setMaster(useApp.getState().user.settings.masterVolume)
    v.src = `clip://video/${clipKey}`
    window.api
      .prepareAudio(clipKey)
      .then(async (p) => {
        if (gone) return
        const s = useApp.getState()
        const levels = trackLevels(
          s.user.settings,
          s.clips.get(clipKey)?.files[0]?.path ?? '',
          p.tracks.map((t) => t.label)
        )
        await mixer.load(p, Object.fromEntries(p.tracks.map((t, i) => [t.label, levels[i].volume])))
        if (gone) return
        levels.forEach((l, i) => l.muted && mixer.setMuted(i, true))
        setReady(true)
      })
      // Without the tracks the video's own sound still works.
      .catch(() => {
        if (!gone) setReady(true)
      })
    // Let go of the files when the clip leaves the screen.
    return () => {
      gone = true
      mixer.destroy()
      v.pause()
      v.removeAttribute('src')
      v.load()
    }
  }, [clipKey])

  useEffect(() => {
    const v = videoRef.current
    if (v) v.muted = !ready
  }, [ready])

  // The progress bar, drawn straight into the DOM so it does not re-render the screen.
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const v = videoRef.current
      if (v) {
        const pct = v.duration > 0 ? Math.min(100, (v.currentTime / v.duration) * 100) : 0
        if (fillRef.current) fillRef.current.style.width = `${pct}%`
        if (headRef.current) headRef.current.style.left = `${pct}%`
        if (timeRef.current) timeRef.current.textContent = fmtSeconds(v.currentTime)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const toggle = (): void => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play().catch(() => undefined)
    else v.pause()
  }

  useImperativeHandle(controls, () => ({
    toggle,
    jump: (dir) => {
      const v = videoRef.current
      if (!v || !v.duration) return
      v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + dir * SEEK_STEP))
    }
  }))

  const seek = (e: React.PointerEvent<HTMLDivElement>): void => {
    const v = videoRef.current
    if (!v || !v.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * v.duration
  }

  return (
    <>
      <button
        type="button"
        className={'rank-video' + (playing ? ' on' : '')}
        aria-label={playing ? 'Pause clip' : 'Play clip'}
        onClick={toggle}
      >
        <video
          ref={videoRef}
          crossOrigin="anonymous"
          preload="auto"
          loop
          playsInline
          poster={clip?.hasThumb ? `clip://thumb/${clipKey}` : undefined}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onError={() => setFailed(true)}
        />
        {(failed || !clip) && (
          <span className="rank-failed">
            <Film size={28} strokeWidth={1.5} />
            {clip ? 'This video cannot be played' : 'Clip not in your library right now'}
          </span>
        )}
        {!playing && !failed && clip && (
          <span className="rank-play">
            <Play size={26} fill="currentColor" strokeWidth={0} />
          </span>
        )}
      </button>
      <div className="timeline-row">
        <span ref={timeRef} className="t">
          0:00
        </span>
        <div
          className="seek"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            seek(e)
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) seek(e)
          }}
        >
          <div className="track">
            <div ref={fillRef} className="fill" />
          </div>
          <div ref={headRef} className="head" />
        </div>
        <span className="t muted rank-total">
          {fmtSeconds(duration || (clip?.durationMs ?? 0) / 1000)}
        </span>
      </div>
    </>
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
          <b>
            {fmtDay(clip.date)}, {fmtTime(clip.date)}
          </b>
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

  const rootRef = useRef<HTMLDivElement>(null)
  const leftVideo = useRef<VideoControls>(null)
  const rightVideo = useRef<VideoControls>(null)

  // For the keyboard: the focus moves into rank mode, Tab stays inside it, and closing gives the
  // focus back.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const before = document.activeElement as HTMLElement | null
    root.focus()
    const onTab = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || useApp.getState().confirm) return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      e.preventDefault()
      const at = items.indexOf(document.activeElement as HTMLElement)
      const step = e.shiftKey ? -1 : 1
      const next = at < 0 ? (e.shiftKey ? items.length - 1 : 0) : at + step
      items[(next + items.length) % items.length].focus()
    }
    window.addEventListener('keydown', onTab)
    return () => {
      window.removeEventListener('keydown', onTab)
      // The Rank button is off when everything got a place: then the first row of the order.
      if (before?.isConnected && !before.matches(':disabled, body')) before.focus()
      else document.querySelector<HTMLElement>('.ord-row')?.focus()
    }
  }, [])

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
        else if (id === 'rankLeftBack') leftVideo.current?.jump(-1)
        else if (id === 'rankLeftPlay') leftVideo.current?.toggle()
        else if (id === 'rankLeftForward') leftVideo.current?.jump(1)
        else if (id === 'rankRightBack') rightVideo.current?.jump(-1)
        else if (id === 'rankRightPlay') rightVideo.current?.toggle()
        else if (id === 'rankRightForward') rightVideo.current?.jump(1)
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
      <div className="rank-title">
        <h2>
          {which === 'left' ? 'New clip' : `Number ${state.order.indexOf(key) + 1} in the order`}
        </h2>
        {settings.showKeyHints && (
          <span className="rank-keys">
            {hint(which === 'left' ? 'rankLeftBack' : 'rankRightBack')} 5 s back
            {hint(which === 'left' ? 'rankLeftPlay' : 'rankRightPlay')} play
            {hint(which === 'left' ? 'rankLeftForward' : 'rankRightForward')} 5 s forward
          </span>
        )}
      </div>
      <RankClip
        key={key}
        clipKey={key}
        clip={clips.get(key)}
        controls={which === 'left' ? leftVideo : rightVideo}
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
    <div ref={rootRef} className="rank" role="dialog" aria-label="Rank mode" tabIndex={-1}>
      <div className="rank-head">
        <h1>Ranking: {project.name}</h1>
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
          <button type="button" className="btn primary lg" autoFocus onClick={onClose}>
            Back to the order
          </button>
        </div>
      )}
    </div>
  )
}
