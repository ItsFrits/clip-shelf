import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ClipBulkPatch, ClipUser, FolderConfig, Settings, Tag, UserData } from '../shared/types'
import {
  DEFAULT_SETTINGS,
  EMPTY_CLIP_USER,
  applyPatch,
  cleanSuggestions,
  isDefaultClipUser,
  markTagsUsed
} from '../shared/userLogic'
import { JsonStore } from './lib/jsonStore'

function emptyUserData(): UserData {
  return {
    v: 1,
    folders: [],
    tags: [],
    clips: {},
    projects: [],
    settings: { ...DEFAULT_SETTINGS },
    lastBackupAt: null
  }
}

function normalize(raw: unknown, defaults: UserData): UserData {
  const r = (raw ?? {}) as Partial<UserData>
  return {
    v: 1,
    folders: Array.isArray(r.folders) ? r.folders : defaults.folders,
    tags: Array.isArray(r.tags) ? r.tags : [],
    clips: r.clips && typeof r.clips === 'object' ? r.clips : {},
    projects: Array.isArray(r.projects) ? r.projects : [],
    settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) },
    lastBackupAt: typeof r.lastBackupAt === 'number' ? r.lastBackupAt : null
  }
}

/** Tags, notes, ratings, folders and settings. This is the part of the app you cannot recreate. */
export class UserDataStore {
  private store: JsonStore<UserData>

  constructor(file: string) {
    this.store = new JsonStore<UserData>(file, emptyUserData(), normalize)
  }

  get data(): UserData {
    return this.store.get()
  }

  flush(): void {
    this.store.flush()
  }

  clipUser(key: string): ClipUser {
    return this.data.clips[key] ?? EMPTY_CLIP_USER
  }

  // ---- folders
  addFolder(cfg: Omit<FolderConfig, 'id'>): FolderConfig {
    const folder: FolderConfig = { ...cfg, id: randomUUID() }
    this.store.mutate((d) => d.folders.push(folder))
    return folder
  }

  updateFolder(id: string, patch: Partial<Omit<FolderConfig, 'id'>>): FolderConfig | null {
    let result: FolderConfig | null = null
    this.store.mutate((d) => {
      const f = d.folders.find((x) => x.id === id)
      if (f) {
        Object.assign(f, patch)
        result = f
      }
    })
    return result
  }

  removeFolder(id: string): void {
    this.store.mutate((d) => {
      d.folders = d.folders.filter((f) => f.id !== id)
    })
  }

  // ---- clips
  patchClips(keys: string[], patch: ClipBulkPatch): void {
    this.store.mutate((d) => {
      for (const key of keys) {
        const next = applyPatch(d.clips[key] ?? EMPTY_CLIP_USER, patch)
        if (isDefaultClipUser(next)) delete d.clips[key]
        else d.clips[key] = next
      }
      d.tags = markTagsUsed(d.tags, patch.addTags, Date.now())
    })
  }

  // ---- tags
  createTag(name: string): Tag {
    const clean = name.trim()
    const existing = this.data.tags.find((t) => t.name.toLowerCase() === clean.toLowerCase())
    if (existing) return existing
    const tag: Tag = { id: randomUUID(), name: clean }
    this.store.mutate((d) => d.tags.push(tag))
    return tag
  }

  renameTag(id: string, name: string): void {
    const clean = name.trim()
    if (!clean) return
    this.store.mutate((d) => {
      const t = d.tags.find((x) => x.id === id)
      if (t) t.name = clean
    })
  }

  /** Change a tag's name or the list of tags it suggests. Unknown tag ids in the list are dropped. */
  updateTag(id: string, patch: { name?: string; suggests?: string[] }): void {
    this.store.mutate((d) => {
      const t = d.tags.find((x) => x.id === id)
      if (!t) return
      if (patch.name !== undefined && patch.name.trim()) t.name = patch.name.trim()
      if (patch.suggests !== undefined) {
        const known = new Set(d.tags.map((x) => x.id))
        const list = [...new Set(patch.suggests)].filter((s) => s !== id && known.has(s))
        if (list.length > 0) t.suggests = list
        else delete t.suggests
      }
    })
  }

  deleteTag(id: string): void {
    this.mergeTags([id], null)
  }

  /** Move every clip from the source tags to the target tag, then remove the source tags. */
  mergeTags(sourceIds: string[], targetId: string | null): void {
    const sources = new Set(sourceIds.filter((s) => s !== targetId))
    this.store.mutate((d) => {
      for (const key of Object.keys(d.clips)) {
        const u = d.clips[key]
        if (!u.tags.some((t) => sources.has(t))) continue
        const tags = u.tags.filter((t) => !sources.has(t))
        if (targetId && !tags.includes(targetId)) tags.push(targetId)
        u.tags = tags
        if (isDefaultClipUser(u)) delete d.clips[key]
      }
      // The target counts as used as recently as the most recent of the tags merged into it.
      const latest = Math.max(0, ...d.tags.filter((t) => sources.has(t.id)).map((t) => t.usedAt ?? 0))
      const kept = d.tags
        .filter((t) => !sources.has(t.id))
        .map((t) => (t.id === targetId && latest > (t.usedAt ?? 0) ? { ...t, usedAt: latest } : t))
      d.tags = cleanSuggestions(kept, sources, targetId)
    })
  }

  updateSettings(patch: Partial<Settings>): void {
    this.store.mutate((d) => {
      d.settings = { ...d.settings, ...patch }
    })
  }

  // ---- backup
  exportTo(file: string): void {
    this.store.flush()
    writeFileSync(file, JSON.stringify(this.data, null, 2))
  }

  /** Replace tags, notes, ratings, projects and settings with the ones from a backup file. */
  importFromJson(json: string): boolean {
    let raw: unknown
    try {
      raw = JSON.parse(json)
    } catch {
      return false
    }
    const r = raw as Partial<UserData>
    if (!r || r.v !== 1 || !Array.isArray(r.tags) || typeof r.clips !== 'object') return false
    const imported = normalize(raw, emptyUserData())
    // Folder paths belong to the computer, so keep the ones we have unless there are none yet.
    if (this.data.folders.length > 0) imported.folders = this.data.folders
    this.store.replace(imported)
    return true
  }

  /** Write a dated copy once per day and keep the last 14. */
  autoBackup(dir: string): void {
    if (!this.data.settings.autoBackup) return
    const today = new Date().toISOString().slice(0, 10)
    const name = `userdata-${today}.json`
    try {
      mkdirSync(dir, { recursive: true })
      if (!existsSync(join(dir, name))) {
        this.store.flush()
        writeFileSync(join(dir, name), JSON.stringify(this.data))
        this.store.mutate((d) => {
          d.lastBackupAt = Date.now()
        })
      }
      const files = readdirSync(dir)
        .filter((f) => /^userdata-\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort()
      for (const old of files.slice(0, Math.max(0, files.length - 14))) unlinkSync(join(dir, old))
    } catch (err) {
      console.error('Auto backup failed:', err)
    }
  }
}
