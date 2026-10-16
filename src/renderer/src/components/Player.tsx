import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FolderOpen,
  Pause,
  Play,
  Repeat,
  Shuffle,
  StepBack,
  StepForward,
  Trash2,
  Volume2,
  VolumeX
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { effectiveKeymap, formatChord } from '@shared/keymap'
import type { PreparedAudio } from '@shared/types'
import { clipStatus, EMPTY_CLIP_USER, parentDir, suggestedTags, trackProfileKey } from '@shared/userLogic'
import { STATUS_COLOR, STATUS_LABEL } from '../lib/filter'
import { baseName, fmtBytes, fmtDayTime, fmtDuration, fmtSeconds } from '../lib/format'
import { registerPlayerAction } from '../lib/hotkeys'
import { Mixer } from '../lib/mixer'
import { useApp, useSettings } from '../lib/store'
import { KeyHint } from './KeyHint'
import { Meter } from './Meter'
import { Stars } from './Stars'
import { TagInput } from './TagInput'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]
/** How close (px) the mouse has to be to the side of the video to show the previous or next clip button. */
const NEAR_PX = 120

export function Player(): React.JSX.Element {
  const key = useApp((s) => s.playerKey)
  const clip = useApp((s) => (s.playerKey ? s.clips.get(s.playerKey) : undefined))
  const playerList = useApp((s) => s.playerList)
  const user = useApp((s) => (s.playerKey ? s.user.clips[s.playerKey] : undefined)) ?? EMPTY_CLIP_USER
  const tagById = useApp((s) => s.tagById)
  const allTags = useApp((s) => s.user.tags)
  const folders = useApp((s) => s.folders)
  const settings = useSettings()
  const keymap = useMemo(() => effectiveKeymap(settings.keymap), [settings.keymap])

  const closePlayer = useApp((s) => s.closePlayer)
  const stepPlayer = useApp((s) => s.stepPlayer)
  const randomClip = useApp((s) => s.randomClip)
  const patch = useApp((s) => s.patch)
  const addTagByName = useApp((s) => s.addTagByName)
  const updateSettings = useApp((s) => s.updateSettings)
  const startDrag = useApp((s) => s.startDrag)
  const trashKeys = useApp((s) => s.trashKeys)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [mixer, setMixer] = useState<Mixer | null>(null)
  const mixerRef = useRef<Mixer | null>(null)
  const [prepared, setPrepared] = useState<PreparedAudio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [muted, setMuted] = useState<boolean[]>([])
  const [volumes, setVolumes] = useState<number[]>([])
  const [duration, setDuration] = useState(0)

  const fillRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const frameRef = useRef<HTMLSpanElement>(null)
  const watchedMarked = useRef(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  // Suggested tags the user skipped for the clip that is open right now.
  const [skipped, setSkipped] = useState<string[]>([])
  const tagRef = useRef<HTMLInputElement>(null)
  // The round pause icon in the middle of the video. It stays while paused and fades out when
  // playback resumes. One element, so it never jumps.
  const [indicator, setIndicator] = useState<{ id: number; kind: 'play' | 'pause' } | null>(null)
  const indicatorId = useRef(0)
  // Video info and frame counter only show while the mouse moves over the video (or just after a frame step).
  const [active, setActive] = useState(false)
  const [peek, setPeek] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Which side the mouse is close to, to show the previous or next clip button.
  const [near, setNear] = useState<'prev' | 'next' | null>(null)

  const index = key ? playerList.indexOf(key) : -1
  const fps = clip?.fps && clip.fps > 0 ? clip.fps : 30

  // One mixer for the life of this video element.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const m = new Mixer(video)
    const st = useApp.getState().user.settings
    m.setMaster(st.masterVolume, st.masterMuted)
    mixerRef.current = m
    setMixer(m)
    return () => {
      m.destroy()
      mixerRef.current = null
    }
  }, [])

  // Load the clip and its audio tracks.
  useEffect(() => {
    const video = videoRef.current
    const m = mixerRef.current
    if (!key || !video || !m) return
    let cancelled = false
    watchedMarked.current = false
    setSkipped([])
    setError(null)
    setPrepared(null)
    setPlaying(false)
    setIndicator(null)
    video.src = `clip://video/${key}`
    video.playbackRate = rate
    video.load()

    window.api
      .prepareAudio(key)
      .then(async (p) => {
        if (cancelled) return
        const st = useApp.getState()
        const legacy = st.user.settings.trackVolumes
        const first = st.clips.get(key)?.files[0]?.path ?? ''
        const profile = st.user.settings.trackProfiles[trackProfileKey(parentDir(first), p.tracks.map((t) => t.label))] ?? {}
        const levels = p.tracks.map((t) => ({
          volume: profile[t.label]?.volume ?? legacy[t.label] ?? 1,
          muted: profile[t.label]?.muted ?? false
        }))
        const volumeByLabel: Record<string, number> = {}
        p.tracks.forEach((t, i) => (volumeByLabel[t.label] = levels[i].volume))
        await m.load(p, volumeByLabel)
        if (cancelled) return
        levels.forEach((l, i) => l.muted && m.setMuted(i, true))
        setPrepared(p)
        setVolumes(levels.map((l) => l.volume))
        setMuted(levels.map((l) => l.muted))
        void video.play().catch(() => undefined)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })

    return () => {
      cancelled = true
      m.clear()
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    // The playback rate is applied separately so changing it does not reload the clip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    mixer?.setMaster(settings.masterVolume, settings.masterMuted)
  }, [mixer, settings.masterVolume, settings.masterMuted])

  // Keep the video loop setting in line with the settings.
  useEffect(() => {
    const v = videoRef.current
    if (v) v.loop = settings.loop && !settings.autoplayNext
  }, [settings.loop, settings.autoplayNext, key])

  // Progress display, drawn straight into the DOM so it does not re-render the page.
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const v = videoRef.current
      if (v) {
        const d = v.duration || 0
        const t = v.currentTime
        const pct = d > 0 ? Math.min(100, (t / d) * 100) : 0
        if (fillRef.current) fillRef.current.style.width = `${pct}%`
        if (headRef.current) headRef.current.style.left = `${pct}%`
        if (timeRef.current) timeRef.current.textContent = fmtSeconds(t, true)
        if (frameRef.current) frameRef.current.textContent = `Frame ${Math.round(t * fps)}`
        // A clip counts as watched once it has been played to the end.
        if (!watchedMarked.current && d > 0 && !v.paused && t >= d - 0.3) {
          watchedMarked.current = true
          const k = useApp.getState().playerKey
          if (k && !useApp.getState().user.clips[k]?.watched) {
            useApp.getState().patch([k], { set: { watched: true } })
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [fps])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const resuming = v.paused
    if (resuming) void v.play().catch(() => undefined)
    else v.pause()
    setIndicator({ id: ++indicatorId.current, kind: resuming ? 'play' : 'pause' })
  }, [])

  const stepFrame = useCallback(
    (dir: 1 | -1) => {
      const v = videoRef.current
      if (!v) return
      v.pause()
      setIndicator(null)
      setPeek(true)
      if (peekTimer.current) clearTimeout(peekTimer.current)
      peekTimer.current = setTimeout(() => setPeek(false), 1500)
      v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + dir / fps))
    },
    [fps]
  )

  const changeRate = useCallback((r: number) => {
    setRate(r)
    if (videoRef.current) videoRef.current.playbackRate = r
  }, [])

  const stepSpeed = useCallback(
    (dir: 1 | -1) => {
      const i = SPEEDS.indexOf(rate)
      const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 2 : i) + dir))]
      changeRate(next)
    },
    [rate, changeRate]
  )

  // Player hotkeys. The bindings themselves live in the keymap.
  useEffect(() => {
    const cleanups = [
      registerPlayerAction('playPause', togglePlay),
      registerPlayerAction('frameBack', () => stepFrame(-1)),
      registerPlayerAction('frameForward', () => stepFrame(1)),
      registerPlayerAction('speedDown', () => stepSpeed(-1)),
      registerPlayerAction('speedUp', () => stepSpeed(1)),
      registerPlayerAction('prevClip', () => stepPlayer(-1)),
      registerPlayerAction('nextClip', () => stepPlayer(1)),
      registerPlayerAction('focusTag', () => tagRef.current?.focus()),
      registerPlayerAction('focusNote', () => noteRef.current?.focus()),
      registerPlayerAction('muteMaster', () => updateSettings({ masterMuted: !useApp.getState().user.settings.masterMuted })),
      registerPlayerAction('toggleLoop', () => updateSettings({ loop: !useApp.getState().user.settings.loop })),
      registerPlayerAction('toggleWatched', () => {
        const k = useApp.getState().playerKey
        if (!k) return
        const cur = useApp.getState().user.clips[k]?.watched ?? false
        useApp.getState().patch([k], { set: { watched: !cur } }, 'Watched')
      })
    ]
    for (let n = 1; n <= 5; n++) {
      cleanups.push(
        registerPlayerAction(`rate${n}`, () => {
          const k = useApp.getState().playerKey
          if (!k) return
          const cur = useApp.getState().user.clips[k]?.rating ?? 0
          useApp.getState().patch([k], { set: { rating: cur === n ? 0 : n } }, 'Rate')
        })
      )
    }
    return () => cleanups.forEach((c) => c())
  }, [togglePlay, stepFrame, stepSpeed, stepPlayer, updateSettings])

  // Seek bar
  const seekFromEvent = (e: React.PointerEvent<HTMLDivElement>): void => {
    const v = videoRef.current
    if (!v || !v.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = ratio * v.duration
  }

  if (!key || !clip) {
    return (
      <div className="player">
        <div className="titlebar-fill" />
        <div className="empty">
          <h2>This clip is no longer available</h2>
          <button className="btn" onClick={closePlayer}>
            Back to library
          </button>
        </div>
      </div>
    )
  }

  const status = clipStatus(user)
  const tags = user.tags.map((id) => tagById.get(id)).filter((t): t is NonNullable<typeof t> => !!t)
  const tagNames = tags.map((t) => t.name.toLowerCase())
  const nextTags = suggestedTags(user.tags, allTags).filter((t) => !skipped.includes(t.id))
  const suggestions = clip.hints.filter((h) => !user.ignoredHints.includes(h) && !tagNames.includes(h.toLowerCase()))
  const folder = folders.find((f) => f.id === clip.files[0]?.folderId)
  const aux = clip.files.find((f) => f.audioPath)?.audioPath
  const editor = settings.editorName.trim() || 'editor'
  const chord = (id: string): string => formatChord(keymap[id]?.[0] ?? '')

  // Clips in the same folder with the same tracks share their volume and mute settings.
  const profileKey = prepared
    ? trackProfileKey(parentDir(clip.files[0]?.path ?? ''), prepared.tracks.map((t) => t.label))
    : null
  const hasSavedLevels = !!profileKey && !!settings.trackProfiles[profileKey]

  const saveLevel = (i: number, level: { volume: number; muted: boolean }): void => {
    const label = prepared?.tracks[i]?.label
    if (!label || !profileKey) return
    const all = useApp.getState().user.settings.trackProfiles
    updateSettings({ trackProfiles: { ...all, [profileKey]: { ...all[profileKey], [label]: level } } })
  }
  const setTrackVolume = (i: number, v: number): void => {
    mixer?.setVolume(i, v)
    setVolumes((cur) => cur.map((x, j) => (j === i ? v : x)))
    saveLevel(i, { volume: v, muted: !!muted[i] })
  }
  const toggleMute = (i: number): void => {
    const next = !muted[i]
    mixer?.setMuted(i, next)
    setMuted((cur) => cur.map((x, j) => (j === i ? next : x)))
    saveLevel(i, { volume: volumes[i] ?? 1, muted: next })
  }
  const resetLevels = (): void => {
    if (!prepared || !profileKey) return
    prepared.tracks.forEach((_, i) => {
      mixer?.setVolume(i, 1)
      mixer?.setMuted(i, false)
    })
    setVolumes(prepared.tracks.map(() => 1))
    setMuted(prepared.tracks.map(() => false))
    const { [profileKey]: _gone, ...rest } = useApp.getState().user.settings.trackProfiles
    updateSettings({ trackProfiles: rest })
  }

  const remove = async (): Promise<void> => {
    const nextKey = playerList[index + 1] && useApp.getState().clips.has(playerList[index + 1]) ? playerList[index + 1] : null
    const done = await trashKeys([key])
    if (!done) return
    if (nextKey) useApp.setState({ playerKey: nextKey })
    else closePlayer()
  }

  return (
    <div className="player">
      <header className="player-head">
        <button className="btn" onClick={closePlayer}>
          <ChevronLeft size={16} strokeWidth={2} />
          Library
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="player-title">{fmtDayTime(clip.date)}</span>
          <span className="mono muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {clip.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {index >= 0 ? `Clip ${index + 1} of ${playerList.length} in this view` : 'Random pick'}
          </span>
          <button className="btn outline" onClick={randomClip}>
            <Shuffle size={16} strokeWidth={2} />
            Random
            <KeyHint>{chord('random')}</KeyHint>
          </button>
        </div>
      </header>

      <div className="player-body">
        <main className="player-main">
          <div
            className={'video-wrap' + (active ? ' active' : '') + (peek ? ' peek' : '') + (near ? ' near-' + near : '')}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - r.left
              setNear(x < NEAR_PX ? 'prev' : x > r.width - NEAR_PX ? 'next' : null)
              setActive(true)
              if (idleTimer.current) clearTimeout(idleTimer.current)
              idleTimer.current = setTimeout(() => setActive(false), 2500)
            }}
            onMouseLeave={() => {
              setNear(null)
              setActive(false)
              if (idleTimer.current) clearTimeout(idleTimer.current)
            }}
          >
            <video
              ref={videoRef}
              crossOrigin="anonymous"
              playsInline
              onClick={togglePlay}
              onPlay={() => {
                setPlaying(true)
                setIndicator((cur) => (cur?.kind === 'pause' ? { id: ++indicatorId.current, kind: 'play' } : cur))
              }}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onEnded={() => {
                if (settings.autoplayNext && !settings.loop) stepPlayer(1)
                else if (settings.autoplayNext) stepPlayer(1)
              }}
              onError={() => setError('This video could not be played. Its format may not be supported.')}
            />
            {indicator && !error && (
              <span
                key={indicator.id}
                className={'video-indicator ' + indicator.kind}
                aria-hidden="true"
                onClick={togglePlay}
                onAnimationEnd={() => indicator.kind === 'play' && setIndicator(null)}
              >
                <Pause size={26} fill="currentColor" strokeWidth={0} />
              </span>
            )}
            {index > 0 && (
              <button
                className="video-nav prev"
                aria-label="Previous clip"
                title={`Previous clip (${chord('prevClip')})`}
                onClick={() => stepPlayer(-1)}
              >
                <ChevronLeft size={22} strokeWidth={2} />
              </button>
            )}
            {index >= 0 && index < playerList.length - 1 && (
              <button
                className="video-nav next"
                aria-label="Next clip"
                title={`Next clip (${chord('nextClip')})`}
                onClick={() => stepPlayer(1)}
              >
                <ChevronRight size={22} strokeWidth={2} />
              </button>
            )}
            <span className="badge tl" style={{ top: 14, left: 14, padding: '4px 10px', fontSize: 12 }}>
              {folder?.name ?? ''}
              {clip.width ? ` · ${clip.width}×${clip.height}` : ''}
              {clip.fps ? ` · ${Math.round(clip.fps)} fps` : ''}
            </span>
            <span ref={frameRef} className="badge tr mono" style={{ top: 14, right: 14, padding: '4px 10px', fontSize: 12 }}>
              Frame 0
            </span>
            {error && (
              <div className="video-msg">
                <b>{error}</b>
                <button className="btn" onClick={() => void window.api.showInFolder(key)}>
                  <FolderOpen size={16} />
                  Show in folder
                </button>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="timeline-row">
              <span ref={timeRef} className="t">
                0:00.00
              </span>
              <div
                className="seek"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  seekFromEvent(e)
                }}
                onPointerMove={(e) => {
                  if (e.buttons === 1) seekFromEvent(e)
                }}
              >
                <div className="track">
                  <div ref={fillRef} className="fill" />
                </div>
                <div ref={headRef} className="head" />
              </div>
              <span className="t muted" style={{ textAlign: 'right' }}>
                {fmtSeconds(duration || (clip.durationMs ?? 0) / 1000)}
              </span>
            </div>
            <div className="transport">
              <button className="btn icon" aria-label="Previous frame" title={chord('frameBack')} onClick={() => stepFrame(-1)}>
                <StepBack size={16} />
              </button>
              <button className="btn primary" style={{ width: 52 }} aria-label={playing ? 'Pause' : 'Play'} title={chord('playPause')} onClick={togglePlay}>
                {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>
              <button className="btn icon" aria-label="Next frame" title={chord('frameForward')} onClick={() => stepFrame(1)}>
                <StepForward size={16} />
              </button>
              <div className="seg" style={{ marginLeft: 8 }} role="group" aria-label="Playback speed">
                {SPEEDS.map((s) => (
                  <button key={s} className={rate === s ? 'on' : ''} onClick={() => changeRate(s)}>
                    {s}×
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginLeft: 'auto' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings.loop} onChange={(e) => updateSettings({ loop: e.target.checked })} />
                  <Repeat size={14} /> Loop
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings.autoplayNext} onChange={(e) => updateSettings({ autoplayNext: e.target.checked })} />
                  Play next clip automatically
                </label>
              </div>
            </div>
            <div className="hints">
              {settings.showKeyHints && (
                <>
                <span><span className="kbd">{chord('playPause')}</span> play</span>
                <span><span className="kbd">{chord('frameBack')}</span> <span className="kbd">{chord('frameForward')}</span> frame step</span>
                <span><span className="kbd">{chord('speedDown')}</span> <span className="kbd">{chord('speedUp')}</span> speed</span>
                <span><span className="kbd">{chord('rate1')}–{chord('rate5')}</span> rate</span>
                <span><span className="kbd">{chord('focusTag')}</span> tag</span>
                <span><span className="kbd">{chord('random')}</span> random clip</span>
                </>
              )}
              <span style={{ marginLeft: 'auto' }}>A clip counts as watched when it plays to the end, or when you tag, rate or write a note.</span>
            </div>
          </div>

          <section className="panel">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20 }}>Audio tracks</h2>
              <span className="muted" style={{ fontSize: 13, flex: 1, minWidth: 240 }}>
                All tracks play together. Volumes and mutes are remembered for clips in this folder with the same tracks. Your files stay untouched.
              </span>
              {hasSavedLevels && (
                <button
                  className="btn small"
                  title="Forget the volumes and mutes saved for clips in this folder with these tracks"
                  onClick={resetLevels}
                >
                  Reset levels
                </button>
              )}
              <div className="seg" role="group" aria-label="Track labels">
                <button className={settings.trackNames === 'names' ? 'on' : ''} onClick={() => updateSettings({ trackNames: 'names' })}>
                  Names
                </button>
                <button className={settings.trackNames === 'numbers' ? 'on' : ''} onClick={() => updateSettings({ trackNames: 'numbers' })}>
                  Numbers
                </button>
              </div>
            </div>
            <div className="track-row" style={{ borderColor: 'var(--border-2)' }}>
              <button
                className={'btn icon' + (settings.masterMuted ? ' is-off' : '')}
                style={{ width: 36, height: 36 }}
                aria-label={settings.masterMuted ? 'Unmute everything' : 'Mute everything'}
                title={`${settings.masterMuted ? 'Unmute' : 'Mute'} everything (${chord('muteMaster')})`}
                onClick={() => updateSettings({ masterMuted: !settings.masterMuted })}
              >
                {settings.masterMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <div className="info">
                <div style={{ fontWeight: 600 }}>Master volume</div>
                <div className="src">{settings.masterMuted ? 'Muted' : 'Stays the same for every clip'}</div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.masterVolume * 100)}
                aria-label="Master volume"
                style={{ flex: '1 1 180px', minWidth: 120, opacity: settings.masterMuted ? 0.45 : 1 }}
                onChange={(e) => updateSettings({ masterVolume: Number(e.target.value) / 100, masterMuted: false })}
              />
              <span className="mono" style={{ width: 44, textAlign: 'right' }}>
                {Math.round(settings.masterVolume * 100)}%
              </span>
            </div>
            {!prepared && !error && <span className="muted">Preparing audio…</span>}
            {prepared && prepared.tracks.length === 0 && <span className="muted">This clip has no audio.</span>}
            {prepared?.tracks.map((t, i) => (
              <div key={t.label + i} className="track-row">
                <button
                  className={'btn icon' + (muted[i] ? ' is-off' : '')}
                  style={{ width: 36, height: 36 }}
                  aria-label={`${muted[i] ? 'Unmute' : 'Mute'} ${t.label}`}
                  onClick={() => toggleMute(i)}
                >
                  {muted[i] ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <div className="info">
                  <div style={{ fontWeight: 600 }}>{settings.trackNames === 'numbers' ? t.number : t.label}</div>
                  <div className="src">{t.kind === 'file' ? (aux ? baseName(aux) : 'Separate file') : 'Inside the video file'}</div>
                </div>
                <Meter mixer={mixer} index={i} muted={!!muted[i]} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((volumes[i] ?? 1) * 100)}
                  aria-label={`${t.label} volume`}
                  style={{ flex: '1 1 180px', minWidth: 120, opacity: muted[i] ? 0.45 : 1 }}
                  onChange={(e) => setTrackVolume(i, Number(e.target.value) / 100)}
                />
                <span className="mono" style={{ width: 44, textAlign: 'right' }}>
                  {Math.round((volumes[i] ?? 1) * 100)}%
                </span>
              </div>
            ))}
          </section>
        </main>

        <aside className="player-side">
          <section className="side-sec">
            <h2 className="h-label">Status</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="dot" style={{ background: STATUS_COLOR[status], width: 10, height: 10 }} />
              <b style={{ color: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</b>
              <span className="muted" style={{ fontSize: 12 }}>
                {status === 'tagged' ? 'has at least one tag' : status === 'watched' ? 'seen, no tag yet' : ''}
              </span>
            </div>
            <label className="toggle-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eye size={16} /> Watched
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={user.watched}
                className={'switch' + (user.watched ? ' on' : '')}
                title={chord('toggleWatched')}
                onClick={() => patch([key], { set: { watched: !user.watched } }, 'Watched')}
              />
            </label>
            <label className="toggle-row">
              <span>Already used in a video</span>
              <button
                type="button"
                role="switch"
                aria-checked={user.used}
                className={'switch' + (user.used ? ' on' : '')}
                onClick={() => patch([key], { set: { used: !user.used } }, 'Used')}
              />
            </label>
          </section>

          <section className="side-sec">
            <h2 className="h-label">Tags</h2>
            <div className="tag-chips">
              {tags.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No tags yet</span>}
              {tags.map((t) => (
                <span key={t.id} className="pill" style={{ fontSize: 13, padding: '3px 6px 3px 10px' }}>
                  {t.name}
                  <button aria-label={`Remove tag ${t.name}`} onClick={() => patch([key], { removeTags: [t.id] }, `Remove tag "${t.name}"`)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <TagInput
              inputRef={tagRef}
              exclude={user.tags}
              placeholder={settings.showKeyHints ? `Add a tag (${chord('focusTag')})` : 'Add a tag'}
              onAdd={(name) => void addTagByName([key], name)}
            />
            {nextTags.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="muted" style={{ fontSize: 12 }}>Suggested next</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {nextTags.map((t) => (
                    <span key={t.id} className="pill suggest next">
                      <button
                        className="add"
                        title={`Add "${t.name}"`}
                        onClick={() => void addTagByName([key], t.name)}
                      >
                        + {t.name}
                      </button>
                      <button
                        aria-label={`Skip ${t.name}`}
                        title="Not for this clip"
                        onClick={() => setSkipped((cur) => [...cur, t.id])}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="muted" style={{ fontSize: 12 }}>Suggested from the folder name</span>
                {suggestions.map((h) => (
                  <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="pill suggest" style={{ cursor: 'default' }}>{h}</span>
                    <button className="btn small" onClick={() => void addTagByName([key], h)}>Add tag</button>
                    <button className="btn small ghost" onClick={() => patch([key], { set: { ignoredHints: [...user.ignoredHints, h] } })}>Ignore</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="side-sec">
            <h2 className="h-label">Rating</h2>
            <Stars value={user.rating} onChange={(n) => patch([key], { set: { rating: n } }, 'Rate')} size={28} />
          </section>

          <NoteEditor key={key} clipKey={key} value={user.note} inputRef={noteRef} label={settings.showKeyHints ? chord('focusNote') : ''} />

          <section className="side-sec">
            <h2 className="h-label">Details</h2>
            <dl className="details">
              <dt>Length</dt><dd>{fmtDuration(clip.durationMs)}</dd>
              <dt>Size</dt><dd>{fmtBytes(clip.size)}</dd>
              <dt>Folder</dt><dd>{folder?.name}</dd>
              <dt>File</dt><dd className="mono" style={{ fontSize: 12 }}>{clip.files[0]?.path}</dd>
              {aux && (<><dt>Mic file</dt><dd className="mono" style={{ fontSize: 12 }}>{baseName(aux)}</dd></>)}
              {clip.files.length > 1 && (<><dt>Copies</dt><dd>{clip.files.length} (same clip in several places)</dd></>)}
            </dl>
          </section>

          <section className="side-sec" style={{ marginTop: 'auto' }}>
            <button
              className="btn primary grab"
              draggable
              title="Drag this button into your video editor"
              onDragStart={(e) => {
                e.preventDefault()
                startDrag([key])
              }}
            >
              <Download size={18} strokeWidth={2} />
              Drag to {editor}
            </button>
            <button className="btn" onClick={() => void window.api.showInFolder(key)}>
              <FolderOpen size={16} />
              Show in folder
            </button>
            <button className="btn danger" onClick={() => void remove()}>
              <Trash2 size={16} />
              Move to recycle bin
            </button>
          </section>
        </aside>
      </div>
    </div>
  )
}

interface NoteProps {
  clipKey: string
  value: string
  label: string
  inputRef: React.RefObject<HTMLTextAreaElement | null>
}

/** The note keeps its own text while typing and saves a moment after you stop. */
function NoteEditor({ clipKey, value, label, inputRef }: NoteProps): React.JSX.Element {
  const [text, setText] = useState(value)
  const patch = useApp((s) => s.patch)
  const saved = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(
    (next: string) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      if (next !== saved.current) {
        saved.current = next
        patch([clipKey], { set: { note: next } })
      }
    },
    [clipKey, patch]
  )
  // Save pending text when leaving the clip.
  const latest = useRef(text)
  latest.current = text
  useEffect(() => () => save(latest.current), [save])

  return (
    <section className="side-sec">
      <h2 className="h-label">Note</h2>
      <textarea
        ref={inputRef}
        className="field"
        rows={4}
        value={text}
        placeholder={label ? `Write something to find this clip later (${label})` : 'Write something to find this clip later'}
        onChange={(e) => {
          setText(e.target.value)
          if (timer.current) clearTimeout(timer.current)
          const v = e.target.value
          timer.current = setTimeout(() => save(v), 700)
        }}
        onBlur={() => save(text)}
      />
    </section>
  )
}
