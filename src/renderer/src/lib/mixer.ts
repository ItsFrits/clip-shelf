import type { PreparedAudio } from '@shared/types'

interface Channel {
  label: string
  /** The video element itself (true) or a separate audio element. */
  isVideo: boolean
  audio?: HTMLAudioElement
  source?: MediaElementAudioSourceNode
  gain: GainNode
  analyser: AnalyserNode
  buffer: Float32Array<ArrayBuffer>
  volume: number
  muted: boolean
}

let sharedContext: AudioContext | null = null
function getContext(): AudioContext {
  if (!sharedContext) sharedContext = new AudioContext({ latencyHint: 'interactive' })
  return sharedContext
}

/**
 * Plays several audio tracks in sync with one video element.
 *
 * The browser can only play one audio track of an mp4, so every other track is a separate
 * audio element that follows the video. Each track has its own volume and level meter.
 * The same video element is used for the whole life of the mixer, because a media element
 * can only be connected to the Web Audio graph once.
 */
export class Mixer {
  private ctx = getContext()
  private videoSource: MediaElementAudioSourceNode
  private videoGain: GainNode
  private videoAnalyser: AnalyserNode
  private master: GainNode
  private videoBuffer = new Float32Array(1024) as Float32Array<ArrayBuffer>
  private channels: Channel[] = []
  private driftTimer: ReturnType<typeof setInterval> | null = null
  private listeners: [string, () => void][] = []
  private videoIsChannel = false
  private loadId = 0

  constructor(private video: HTMLVideoElement) {
    this.videoSource = this.ctx.createMediaElementSource(video)
    this.videoGain = this.ctx.createGain()
    this.videoAnalyser = this.ctx.createAnalyser()
    this.videoAnalyser.fftSize = 1024
    this.videoSource.connect(this.videoGain)
    this.videoGain.connect(this.videoAnalyser)
    // Every track ends up in one master volume before it reaches the speakers.
    this.master = this.ctx.createGain()
    this.master.connect(this.ctx.destination)
    this.videoAnalyser.connect(this.master)

    const on = (type: string, fn: () => void): void => {
      video.addEventListener(type, fn)
      this.listeners.push([type, fn])
    }
    on('play', () => {
      void this.ctx.resume()
      this.forEachAudio((a) => {
        a.currentTime = video.currentTime
        void a.play().catch(() => undefined)
      })
    })
    on('pause', () => this.forEachAudio((a) => a.pause()))
    on('waiting', () => this.forEachAudio((a) => a.pause()))
    on('playing', () => {
      this.forEachAudio((a) => {
        a.currentTime = video.currentTime
        void a.play().catch(() => undefined)
      })
    })
    on('seeking', () => this.forEachAudio((a) => (a.currentTime = video.currentTime)))
    on('seeked', () => this.forEachAudio((a) => (a.currentTime = video.currentTime)))
    on('ratechange', () => this.forEachAudio((a) => (a.playbackRate = video.playbackRate)))
    on('ended', () => this.forEachAudio((a) => a.pause()))
    this.driftTimer = setInterval(() => this.correctDrift(), 250)
  }

  private forEachAudio(fn: (a: HTMLAudioElement) => void): void {
    for (const c of this.channels) if (c.audio) fn(c.audio)
  }

  private correctDrift(): void {
    if (this.video.paused || this.video.seeking) return
    for (const c of this.channels) {
      const a = c.audio
      if (!a || a.readyState < 2) continue
      if (Math.abs(a.currentTime - this.video.currentTime) > 0.08) a.currentTime = this.video.currentTime
    }
  }

  private makeNodes(): { gain: GainNode; analyser: AnalyserNode; buffer: Float32Array<ArrayBuffer> } {
    const gain = this.ctx.createGain()
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 1024
    gain.connect(analyser)
    analyser.connect(this.master)
    return { gain, analyser, buffer: new Float32Array(1024) as Float32Array<ArrayBuffer> }
  }

  /** Set up the tracks for a clip. Resolves when the separate audio elements can play. */
  async load(prepared: PreparedAudio, volumes: Record<string, number>): Promise<void> {
    this.clear()
    const id = ++this.loadId
    this.videoIsChannel = prepared.useVideoAudio
    const ready: Promise<void>[] = []

    prepared.tracks.forEach((t, i) => {
      const volume = volumes[t.label] ?? 1
      if (i === 0 && prepared.useVideoAudio) {
        this.videoGain.gain.value = volume
        this.channels.push({
          label: t.label,
          isVideo: true,
          gain: this.videoGain,
          analyser: this.videoAnalyser,
          buffer: this.videoBuffer,
          volume,
          muted: false
        })
        return
      }
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.preload = 'auto'
      audio.src = t.url
      audio.playbackRate = this.video.playbackRate
      const source = this.ctx.createMediaElementSource(audio)
      const nodes = this.makeNodes()
      nodes.gain.gain.value = volume
      source.connect(nodes.gain)
      this.channels.push({ label: t.label, isVideo: false, audio, source, volume, muted: false, ...nodes })
      ready.push(
        new Promise<void>((resolve) => {
          const done = (): void => resolve()
          audio.addEventListener('canplay', done, { once: true })
          audio.addEventListener('error', done, { once: true })
          setTimeout(done, 4000)
        })
      )
    })

    // The video's own sound is silent when every track is a separate audio element.
    if (!prepared.useVideoAudio) this.videoGain.gain.value = 0
    await Promise.all(ready)
    if (id !== this.loadId) return
    if (!this.video.paused) {
      this.forEachAudio((a) => {
        a.currentTime = this.video.currentTime
        void a.play().catch(() => undefined)
      })
    }
  }

  /** Remove the tracks of the current clip. */
  clear(): void {
    this.loadId++
    for (const c of this.channels) {
      if (c.isVideo) continue
      c.audio?.pause()
      c.audio?.removeAttribute('src')
      c.audio?.load()
      c.source?.disconnect()
      c.gain.disconnect()
      c.analyser.disconnect()
    }
    this.channels = []
    this.videoGain.gain.value = 1
  }

  setMaster(volume: number): void {
    this.master.gain.value = volume
  }

  get trackCount(): number {
    return this.channels.length
  }

  private apply(c: Channel): void {
    c.gain.gain.value = c.muted ? 0 : c.volume
  }

  setVolume(index: number, volume: number): void {
    const c = this.channels[index]
    if (!c) return
    c.volume = volume
    this.apply(c)
  }

  setMuted(index: number, muted: boolean): void {
    const c = this.channels[index]
    if (!c) return
    c.muted = muted
    this.apply(c)
  }

  /** Peak level of a track in dB (about -60 for silence). */
  level(index: number): number {
    const c = this.channels[index]
    if (!c) return -60
    c.analyser.getFloatTimeDomainData(c.buffer)
    let peak = 0
    for (let i = 0; i < c.buffer.length; i++) {
      const v = Math.abs(c.buffer[i])
      if (v > peak) peak = v
    }
    return peak > 0 ? Math.max(-60, 20 * Math.log10(peak)) : -60
  }

  get usesVideoAudio(): boolean {
    return this.videoIsChannel
  }

  destroy(): void {
    this.clear()
    if (this.driftTimer) clearInterval(this.driftTimer)
    for (const [type, fn] of this.listeners) this.video.removeEventListener(type, fn)
    this.listeners = []
    try {
      this.videoSource.disconnect()
      this.videoGain.disconnect()
      this.videoAnalyser.disconnect()
      this.master.disconnect()
    } catch {
      /* already disconnected */
    }
  }
}
