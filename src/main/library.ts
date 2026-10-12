import chokidar, { type FSWatcher } from 'chokidar'
import { existsSync, readdirSync, statSync } from 'fs'
import { promises as fsp } from 'fs'
import { basename, dirname, join } from 'path'
import type {
  ApiEventName,
  ApiEvents,
  Clip,
  ClipFile,
  FolderConfig,
  FolderInfo,
  PreparedAudio,
  PreparedTrack,
  TrashResult
} from '../shared/types'
import { JsonStore } from './lib/jsonStore'
import { makeClipKey, makeIgnoreMatcher, parseDateFromName, stem } from './lib/naming'
import { type ScannedVideo, isAudioFile, isVideoFile, scanFolder, scanOne } from './lib/scanner'
import { JobQueue, type MediaTools, type ProbeInfo } from './media'
import type { UserDataStore } from './userData'

/** One video file we know about. */
interface FileRecord {
  path: string
  folderId: string
  key: string
  name: string
  date: number
  size: number
  mtimeMs: number
  audioPath?: string
  hints: string[]
}

interface IndexData {
  v: 1
  files: Record<string, FileRecord>
  probes: Record<string, ProbeInfo>
}

interface FolderRuntime {
  online: boolean
  scanning: boolean
  watcher?: FSWatcher
}

export interface LibraryOptions {
  user: UserDataStore
  indexFile: string
  thumbDir: string
  audioDir: string
  tools: MediaTools
  emit: <E extends ApiEventName>(event: E, payload: ApiEvents[E]) => void
  /** How often to check if folders went offline or came back, in ms. */
  pollMs?: number
  /** How long a new file must stay unchanged before it is picked up, in ms. */
  settleMs?: number
}

const KEY_RE = /^[0-9a-f]{16}$/
const AUDIO_CACHE_LIMIT = 1024 * 1024 * 1024

async function isOnlineDir(path: string): Promise<boolean> {
  const check = fsp.stat(path).then((s) => s.isDirectory())
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000))
  try {
    return await Promise.race([check, timeout])
  } catch {
    return false
  }
}

export class Library {
  private index: JsonStore<IndexData>
  private user: UserDataStore
  private tools: MediaTools
  private emit: LibraryOptions['emit']
  private thumbDir: string
  private audioDir: string
  private pollMs: number
  private settleMs: number

  private byKey = new Map<string, Set<string>>()
  private clips = new Map<string, Clip>()
  private thumbs = new Set<string>()
  private thumbFailed = new Set<string>()
  private runtime = new Map<string, FolderRuntime>()
  private refreshTimers = new Map<string, NodeJS.Timeout>()
  private audioJobs = new Map<string, Promise<PreparedAudio>>()

  private pendingUp = new Set<string>()
  private pendingRm = new Set<string>()
  private deltaTimer: NodeJS.Timeout | null = null
  private foldersTimer: NodeJS.Timeout | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private queue: JobQueue
  private disposed = false

  constructor(opts: LibraryOptions) {
    this.user = opts.user
    this.tools = opts.tools
    this.emit = opts.emit
    this.thumbDir = opts.thumbDir
    this.audioDir = opts.audioDir
    this.pollMs = opts.pollMs ?? 5000
    this.settleMs = opts.settleMs ?? 2500
    this.index = new JsonStore<IndexData>(
      opts.indexFile,
      { v: 1, files: {}, probes: {} },
      (raw, defaults) => {
        const r = (raw ?? {}) as Partial<IndexData>
        if (r.v !== 1 || typeof r.files !== 'object' || !r.files) return defaults
        return { v: 1, files: r.files, probes: r.probes && typeof r.probes === 'object' ? r.probes : {} }
      }
    )
    this.queue = new JobQueue(
      3,
      (key) => this.ensureMedia(key),
      (p) => this.emit('jobs:progress', p)
    )
  }

  // ---------------------------------------------------------------- start / stop

  /** Load what we knew last time, then check every folder in the background. */
  async start(): Promise<void> {
    try {
      for (const f of readdirSync(this.thumbDir)) {
        if (f.endsWith('.jpg')) this.thumbs.add(f.slice(0, -4))
      }
    } catch {
      /* no thumbnails yet */
    }

    const folderIds = new Set(this.user.data.folders.map((f) => f.id))
    const files = this.index.get().files
    for (const [path, rec] of Object.entries(files)) {
      if (!folderIds.has(rec.folderId)) {
        delete files[path]
        continue
      }
      this.attach(rec.key, path)
    }
    for (const key of this.byKey.keys()) this.rebuild(key, false)

    for (const f of this.user.data.folders) this.runtime.set(f.id, { online: false, scanning: false })
    this.queueMedia([...this.clips.keys()])
    void this.cleanAudioCache()

    await this.poll()
    this.pollTimer = setInterval(() => void this.poll(), this.pollMs)
  }

  dispose(): void {
    this.disposed = true
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.deltaTimer) clearTimeout(this.deltaTimer)
    if (this.foldersTimer) clearTimeout(this.foldersTimer)
    for (const t of this.refreshTimers.values()) clearTimeout(t)
    for (const rt of this.runtime.values()) void rt.watcher?.close()
    this.index.flush()
  }

  /** Wait until every folder has finished scanning. Used by tests. */
  async idle(): Promise<void> {
    for (let i = 0; i < 400; i++) {
      const scanning = [...this.runtime.values()].some((r) => r.scanning)
      if (!scanning && this.queue.size === 0 && !this.deltaTimer && this.refreshTimers.size === 0) return
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  // ---------------------------------------------------------------- reading

  allClips(): Clip[] {
    return [...this.clips.values()]
  }

  getClip(key: string): Clip | undefined {
    return this.clips.get(key)
  }

  folderInfos(): FolderInfo[] {
    const stats = new Map<string, { n: number; bytes: number }>()
    for (const rec of Object.values(this.index.get().files)) {
      const s = stats.get(rec.folderId) ?? { n: 0, bytes: 0 }
      s.n++
      s.bytes += rec.size
      stats.set(rec.folderId, s)
    }
    return this.user.data.folders.map((f) => {
      const rt = this.runtime.get(f.id)
      const s = stats.get(f.id)
      return {
        ...f,
        online: rt?.online ?? false,
        scanning: rt?.scanning ?? false,
        clipCount: s?.n ?? 0,
        totalBytes: s?.bytes ?? 0
      }
    })
  }

  private folder(id: string): FolderConfig | undefined {
    return this.user.data.folders.find((f) => f.id === id)
  }

  private isOnline(folderId: string): boolean {
    return this.runtime.get(folderId)?.online ?? false
  }

  /** The copy of a clip we can actually read right now. */
  primaryFile(key: string): ClipFile | null {
    const clip = this.clips.get(key)
    if (!clip) return null
    return clip.files.find((f) => this.isOnline(f.folderId)) ?? null
  }

  primaryPath(key: string): string | null {
    return this.primaryFile(key)?.path ?? null
  }

  auxPath(key: string): string | null {
    const clip = this.clips.get(key)
    if (!clip) return null
    const online = clip.files.filter((f) => this.isOnline(f.folderId) && f.audioPath)
    return online[0]?.audioPath ?? null
  }

  thumbPath(key: string): string | null {
    return KEY_RE.test(key) && this.thumbs.has(key) ? join(this.thumbDir, key + '.jpg') : null
  }

  extractedAudioPath(key: string, index: number): string | null {
    if (!KEY_RE.test(key) || !Number.isInteger(index) || index < 0) return null
    const p = join(this.audioDir, key, `${index}.m4a`)
    return existsSync(p) ? p : null
  }

  // ---------------------------------------------------------------- records and clips

  private attach(key: string, path: string): void {
    let set = this.byKey.get(key)
    if (!set) this.byKey.set(key, (set = new Set()))
    set.add(path)
  }

  private detach(key: string, path: string): void {
    const set = this.byKey.get(key)
    if (!set) return
    set.delete(path)
    if (set.size === 0) this.byKey.delete(key)
  }

  /** Build the Clip for a key from its file records, and announce it. */
  private rebuild(key: string, announce = true): void {
    const files = this.index.get().files
    const paths = this.byKey.get(key)
    const recs = paths ? [...paths].sort().map((p) => files[p]).filter(Boolean) : []
    if (recs.length === 0) {
      this.clips.delete(key)
      if (announce) {
        this.pendingUp.delete(key)
        this.pendingRm.add(key)
        this.scheduleDelta()
      }
      return
    }
    const probe = this.index.get().probes[key]
    const hints: string[] = []
    for (const r of recs) {
      if (!this.folder(r.folderId)?.suggestTags) continue
      for (const h of r.hints) if (!hints.includes(h)) hints.push(h)
    }
    const clip: Clip = {
      key,
      name: stem(recs[0].name),
      date: Math.min(...recs.map((r) => r.date)),
      size: recs[0].size,
      durationMs: probe?.durationMs,
      width: probe?.width,
      height: probe?.height,
      fps: probe?.fps,
      audioTracks: probe?.audioTracks,
      probeFailed: probe?.failed,
      files: recs.map((r) => ({
        path: r.path,
        folderId: r.folderId,
        size: r.size,
        mtimeMs: r.mtimeMs,
        audioPath: r.audioPath
      })),
      hints,
      hasThumb: this.thumbs.has(key)
    }
    this.clips.set(key, clip)
    if (announce) {
      this.pendingRm.delete(key)
      this.pendingUp.add(key)
      this.scheduleDelta()
    }
  }

  private scheduleDelta(): void {
    if (this.deltaTimer || this.disposed) return
    this.deltaTimer = setTimeout(() => {
      this.deltaTimer = null
      const upserts = [...this.pendingUp].map((k) => this.clips.get(k)).filter((c): c is Clip => !!c)
      const removes = [...this.pendingRm]
      this.pendingUp.clear()
      this.pendingRm.clear()
      const CHUNK = 1000
      for (let i = 0; i < upserts.length; i += CHUNK) {
        this.emit('library:delta', { upserts: upserts.slice(i, i + CHUNK), removes: [] })
      }
      if (removes.length) this.emit('library:delta', { upserts: [], removes })
      this.emitFolders()
    }, 250)
  }

  private emitFolders(): void {
    if (this.foldersTimer || this.disposed) return
    this.foldersTimer = setTimeout(() => {
      this.foldersTimer = null
      this.emit('folders:changed', this.folderInfos())
    }, 200)
  }

  /** Add or update the record for one video. Returns the keys that changed. */
  private upsert(folder: FolderConfig, v: ScannedVideo): string[] {
    const files = this.index.get().files
    const old = files[v.path]
    if (old && old.folderId !== folder.id && this.folder(old.folderId)) return []
    const name = basename(v.path)
    const same =
      old &&
      old.folderId === folder.id &&
      old.size === v.size &&
      old.mtimeMs === v.mtimeMs &&
      old.audioPath === v.audioPath &&
      old.hints.join('/') === v.hints.join('/')
    if (same) return []
    const key = makeClipKey(name, v.size)
    const touched = [key]
    if (old && old.key !== key) {
      this.detach(old.key, v.path)
      touched.push(old.key)
    }
    files[v.path] = {
      path: v.path,
      folderId: folder.id,
      key,
      name,
      date: parseDateFromName(name) ?? Math.round(v.mtimeMs),
      size: v.size,
      mtimeMs: v.mtimeMs,
      audioPath: v.audioPath,
      hints: v.hints
    }
    this.attach(key, v.path)
    return touched
  }

  private removeRecord(path: string): string[] {
    const files = this.index.get().files
    const old = files[path]
    if (!old) return []
    delete files[path]
    this.detach(old.key, path)
    return [old.key]
  }

  private finishChange(touched: Iterable<string>): void {
    const keys = [...new Set(touched)]
    if (keys.length === 0) return
    for (const k of keys) this.rebuild(k)
    this.queueMedia(keys)
    this.index.touch(3000)
  }

  // ---------------------------------------------------------------- scanning and watching

  private ignoreMatcher(): (name: string) => boolean {
    return makeIgnoreMatcher(this.user.data.settings.ignorePatterns)
  }

  private async scan(f: FolderConfig): Promise<void> {
    const rt = this.runtime.get(f.id)
    if (!rt || !rt.online || rt.scanning) return
    rt.scanning = true
    this.emitFolders()
    try {
      const result = await scanFolder(f.path, {
        includeSubfolders: f.includeSubfolders,
        pairAudio: f.pairAudio,
        ignore: this.ignoreMatcher()
      })
      if (this.disposed || !this.folder(f.id)) return
      const touched: string[] = []
      const seen = new Set<string>()
      for (const v of result.videos) {
        seen.add(v.path)
        touched.push(...this.upsert(f, v))
      }
      // Only forget files if we could read the whole folder and it is still there.
      if (result.ok && (await isOnlineDir(f.path))) {
        for (const rec of Object.values(this.index.get().files)) {
          if (rec.folderId === f.id && !seen.has(rec.path)) touched.push(...this.removeRecord(rec.path))
        }
      }
      this.finishChange(touched)
    } catch (err) {
      console.error('Scan failed:', err)
    } finally {
      rt.scanning = false
      this.emitFolders()
    }
  }

  private startWatcher(f: FolderConfig): void {
    const rt = this.runtime.get(f.id)
    if (!rt) return
    void rt.watcher?.close()
    const ignore = this.ignoreMatcher()
    const watcher = chokidar.watch(f.path, {
      ignoreInitial: true,
      depth: f.includeSubfolders ? undefined : 0,
      awaitWriteFinish: { stabilityThreshold: this.settleMs, pollInterval: 500 },
      ignored: (p: string) => p !== f.path && ignore(basename(p))
    })
    const onFile = (p: string): void => {
      const name = basename(p)
      if (isVideoFile(name)) this.scheduleRefresh(f.id, p)
      else if (f.pairAudio && isAudioFile(name)) void this.refreshForAudio(f.id, p)
    }
    watcher.on('add', onFile).on('change', onFile).on('unlink', onFile)
    watcher.on('error', (err) => console.error('Watcher error:', err))
    rt.watcher = watcher
  }

  private async refreshForAudio(folderId: string, audioPath: string): Promise<void> {
    const dir = dirname(audioPath)
    const s = stem(audioPath).toLowerCase()
    try {
      for (const name of await fsp.readdir(dir)) {
        if (isVideoFile(name) && stem(name).toLowerCase() === s) this.scheduleRefresh(folderId, join(dir, name))
      }
    } catch {
      /* folder went away */
    }
  }

  private scheduleRefresh(folderId: string, path: string): void {
    const id = folderId + '|' + path
    const prev = this.refreshTimers.get(id)
    if (prev) clearTimeout(prev)
    this.refreshTimers.set(
      id,
      setTimeout(() => {
        this.refreshTimers.delete(id)
        void this.refreshVideo(folderId, path)
      }, 300)
    )
  }

  private async refreshVideo(folderId: string, path: string): Promise<void> {
    const f = this.folder(folderId)
    if (!f || this.disposed) return
    const v = await scanOne(f.path, path, dirname(path), f.pairAudio)
    if (v) {
      this.finishChange(this.upsert(f, v))
      return
    }
    // The file is gone. Make sure it is not just the whole drive that disappeared.
    if (await isOnlineDir(f.path)) this.finishChange(this.removeRecord(path))
  }

  /** Check which folders are reachable, and start or stop watching accordingly. */
  private async poll(): Promise<void> {
    let changed = false
    for (const f of this.user.data.folders) {
      let rt = this.runtime.get(f.id)
      if (!rt) this.runtime.set(f.id, (rt = { online: false, scanning: false }))
      const online = await isOnlineDir(f.path)
      if (this.disposed) return
      if (online === rt.online && (!online || rt.watcher)) continue
      changed = true
      rt.online = online
      if (online) {
        this.startWatcher(f)
        void this.scan(f)
      } else {
        void rt.watcher?.close()
        rt.watcher = undefined
      }
    }
    // The UI works out which clips are offline from the folder list, so clips need no update.
    if (changed) this.emitFolders()
  }

  // ---------------------------------------------------------------- folder management

  async addFolder(cfg: Omit<FolderConfig, 'id'>): Promise<FolderConfig> {
    const f = this.user.addFolder(cfg)
    this.runtime.set(f.id, { online: false, scanning: false })
    await this.poll()
    this.emitFolders()
    return f
  }

  async updateFolder(id: string, patch: Partial<Omit<FolderConfig, 'id'>>): Promise<void> {
    const f = this.user.updateFolder(id, patch)
    if (!f) return
    const rt = this.runtime.get(id)
    if (rt) {
      void rt.watcher?.close()
      rt.watcher = undefined
      rt.online = false
    }
    await this.poll()
    // Tag suggestions may have been switched on or off.
    for (const rec of Object.values(this.index.get().files)) if (rec.folderId === id) this.rebuild(rec.key)
  }

  async removeFolder(id: string): Promise<void> {
    const rt = this.runtime.get(id)
    void rt?.watcher?.close()
    this.runtime.delete(id)
    const touched: string[] = []
    for (const rec of Object.values(this.index.get().files)) {
      if (rec.folderId === id) touched.push(...this.removeRecord(rec.path))
    }
    this.user.removeFolder(id)
    this.finishChange(touched)
    this.emitFolders()
    // Folders that overlap with the removed one may now own some of its files.
    this.rescan()
  }

  rescan(id?: string): void {
    for (const f of this.user.data.folders) {
      if (!id || f.id === id) void this.scan(f)
    }
  }

  // ---------------------------------------------------------------- thumbnails and probing

  private needsMedia(key: string): boolean {
    const probe = this.index.get().probes[key]
    return !probe || (!this.thumbs.has(key) && !this.thumbFailed.has(key))
  }

  private queueMedia(keys: string[]): void {
    const need = keys.filter((k) => this.clips.has(k) && this.needsMedia(k))
    if (need.length) this.queue.add(need)
  }

  prioritize(keys: string[]): void {
    this.queue.bump(keys.slice(0, 200))
  }

  private async ensureMedia(key: string): Promise<void> {
    const file = this.primaryPath(key)
    if (!file || this.disposed) return
    await this.ensureProbe(key, file)
    if (this.thumbs.has(key) || this.thumbFailed.has(key)) return
    const probe = this.index.get().probes[key]
    const at = probe?.durationMs ? Math.round(probe.durationMs * 0.4) : 1000
    const out = join(this.thumbDir, key + '.jpg')
    let ok = await this.tools.thumbnail(file, at, out)
    if (!ok && at > 0) ok = await this.tools.thumbnail(file, 0, out)
    if (ok) {
      this.thumbs.add(key)
      this.rebuild(key)
    } else {
      this.thumbFailed.add(key)
    }
  }

  private async ensureProbe(key: string, file: string): Promise<ProbeInfo> {
    const known = this.index.get().probes[key]
    if (known) return known
    const probe = await this.tools.probe(file)
    this.index.get().probes[key] = probe
    this.index.touch(3000)
    this.rebuild(key)
    return probe
  }

  // ---------------------------------------------------------------- audio for the player

  prepareAudio(key: string): Promise<PreparedAudio> {
    const running = this.audioJobs.get(key)
    if (running) return running
    const job = this.doPrepareAudio(key).finally(() => this.audioJobs.delete(key))
    this.audioJobs.set(key, job)
    return job
  }

  private async doPrepareAudio(key: string): Promise<PreparedAudio> {
    const file = this.primaryPath(key)
    if (!file) throw new Error('This clip is on a folder that is offline.')
    const probe = await this.ensureProbe(key, file)
    const embedded = probe.audioTracks ?? []
    const aux = this.auxPath(key)
    const videoTrack = (label: string): PreparedTrack => ({ label, url: `clip://video/${key}`, kind: 'embedded' })
    const auxTrack: PreparedTrack | null = aux ? { label: 'Microphone', url: `clip://aux/${key}`, kind: 'file' } : null

    if (embedded.length <= 1) {
      const tracks: PreparedTrack[] = []
      if (embedded.length === 1) tracks.push(videoTrack(auxTrack ? 'Game audio' : 'Audio'))
      if (auxTrack) tracks.push(auxTrack)
      return { tracks, useVideoAudio: embedded.length === 1 }
    }

    // Several tracks inside the mp4: the browser can only play one of them, so copy them out.
    const dir = join(this.audioDir, key)
    const missing = embedded.filter((t) => !existsSync(join(dir, `${t.index}.m4a`)))
    if (missing.length > 0) {
      const ok = await this.tools.extractAudio(file, missing, dir)
      if (!ok) {
        console.error('Could not extract audio tracks for', file)
        const tracks = [videoTrack('Track 1')]
        if (auxTrack) tracks.push(auxTrack)
        return { tracks, useVideoAudio: true }
      }
    }
    const tracks: PreparedTrack[] = embedded.map((t) => ({
      label: t.title ?? `Track ${t.index + 1}`,
      url: `clip://audio/${key}/${t.index}`,
      kind: 'embedded'
    }))
    if (auxTrack) tracks.push(auxTrack)
    return { tracks, useVideoAudio: false }
  }

  /** Keep the extracted audio cache below a size limit by removing the least recently used clips. */
  private async cleanAudioCache(): Promise<void> {
    try {
      const dirs = readdirSync(this.audioDir).map((name) => {
        const p = join(this.audioDir, name)
        let size = 0
        try {
          for (const f of readdirSync(p)) size += statSync(join(p, f)).size
        } catch {
          /* ignore */
        }
        return { p, size, mtime: statSync(p).mtimeMs }
      })
      let total = dirs.reduce((a, d) => a + d.size, 0)
      dirs.sort((a, b) => a.mtime - b.mtime)
      for (const d of dirs) {
        if (total <= AUDIO_CACHE_LIMIT) break
        await fsp.rm(d.p, { recursive: true, force: true })
        total -= d.size
      }
    } catch {
      /* no cache yet */
    }
  }

  // ---------------------------------------------------------------- deleting

  /** Move every copy of the clips (and their separate audio files) to the recycle bin. */
  async trashClips(keys: string[], trash: (path: string) => Promise<void>): Promise<TrashResult> {
    const result: TrashResult = { trashed: 0, failed: [] }
    const touched: string[] = []
    for (const key of keys) {
      const clip = this.clips.get(key)
      if (!clip) continue
      let allGone = true
      for (const file of clip.files) {
        if (!this.isOnline(file.folderId)) {
          allGone = false
          result.failed.push(file.path)
          continue
        }
        try {
          await trash(file.path)
          if (file.audioPath && existsSync(file.audioPath)) await trash(file.audioPath).catch(() => undefined)
          touched.push(...this.removeRecord(file.path))
        } catch {
          allGone = false
          result.failed.push(file.path)
        }
      }
      if (allGone) result.trashed++
    }
    this.finishChange(touched)
    return result
  }
}
