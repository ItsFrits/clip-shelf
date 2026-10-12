import { create } from 'zustand'
import type {
  Clip,
  ClipBulkPatch,
  ClipUser,
  FolderInfo,
  JobProgress,
  Settings,
  Snapshot,
  Tag,
  UpdateStatus,
  UserData
} from '@shared/types'
import { EMPTY_CLIP_USER, applyPatch, isDefaultClipUser } from '@shared/userLogic'
import { DEFAULT_SETTINGS } from '@shared/userLogic'
import { DEFAULT_FILTERS, type Filters, computeVisible } from './filter'

export type View = 'library' | 'player' | 'settings'
export type SettingsTab = 'folders' | 'playback' | 'hotkeys' | 'backup'

export interface Toast {
  id: number
  message: string
  kind?: 'error'
  actionLabel?: string
  action?: () => void
  /** Stays until the user dismisses it. */
  sticky?: boolean
}

export interface ConfirmState {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

interface UndoEntry {
  label: string
  before: Record<string, ClipUser>
}

interface AppState {
  ready: boolean
  folders: FolderInfo[]
  clips: Map<string, Clip>
  user: UserData
  tagById: Map<string, Tag>
  appInfo: Snapshot['app']
  jobs: JobProgress
  update: UpdateStatus

  view: View
  settingsTab: SettingsTab
  filters: Filters
  /** Clips that pass the filters, in display order. */
  visible: Clip[]
  selected: Set<string>
  anchorKey: string | null

  playerKey: string | null
  playerList: string[]

  undo: UndoEntry[]
  toasts: Toast[]
  confirm: ConfirmState | null
  capturingKey: boolean

  init: () => Promise<void>
  setFilters: (patch: Partial<Filters>) => void
  resetFilters: () => void
  setView: (view: View) => void
  openSettings: (tab?: SettingsTab) => void

  select: (key: string, mode: 'only' | 'toggle' | 'range') => void
  selectAll: () => void
  clearSelection: () => void

  openPlayer: (key: string, list?: string[]) => void
  closePlayer: () => void
  stepPlayer: (dir: 1 | -1) => void
  randomClip: () => void

  patch: (keys: string[], patch: ClipBulkPatch, undoLabel?: string) => void
  addTagByName: (keys: string[], name: string) => Promise<void>
  undoLast: () => void
  updateSettings: (patch: Partial<Settings>) => void
  trashKeys: (keys: string[]) => Promise<boolean>
  startDrag: (keys: string[]) => void

  toast: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message'>>) => void
  dismissToast: (id: number) => void
  ask: (opts: Omit<ConfirmState, 'resolve'>) => Promise<boolean>
  setCapturing: (on: boolean) => void
}

const emptyUser = (): UserData => ({
  v: 1,
  folders: [],
  tags: [],
  clips: {},
  projects: [],
  settings: { ...DEFAULT_SETTINGS },
  lastBackupAt: null
})

let toastId = 1
let pendingSettings: Partial<Settings> = {}
let settingsTimer: ReturnType<typeof setTimeout> | null = null

function tagMap(tags: Tag[]): Map<string, Tag> {
  return new Map(tags.map((t) => [t.id, t]))
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  folders: [],
  clips: new Map(),
  user: emptyUser(),
  tagById: new Map(),
  appInfo: { version: '', platform: '', packaged: false },
  jobs: { pending: 0, total: 0 },
  update: { state: 'idle' },

  view: 'library',
  settingsTab: 'folders',
  filters: { ...DEFAULT_FILTERS, anchor: Date.now() },
  visible: [],
  selected: new Set(),
  anchorKey: null,

  playerKey: null,
  playerList: [],

  undo: [],
  toasts: [],
  confirm: null,
  capturingKey: false,

  init: async () => {
    const api = window.api
    api.on('library:delta', (d) => {
      set((s) => {
        const clips = new Map(s.clips)
        for (const c of d.upserts) clips.set(c.key, c)
        for (const k of d.removes) clips.delete(k)
        let selected = s.selected
        if (d.removes.some((k) => selected.has(k))) {
          selected = new Set([...selected].filter((k) => clips.has(k)))
        }
        return { clips, selected }
      })
    })
    api.on('folders:changed', (folders) => set({ folders }))
    api.on('jobs:progress', (jobs) => set({ jobs }))
    api.on('updater:status', (update) => {
      const before = get().update.state
      set({ update })
      if (update.state === 'downloading' && before !== 'downloading') {
        get().toast(`Update ${update.version ?? ''} found. Downloading it in the background.`)
      }
      if (update.state === 'ready' && before !== 'ready') {
        get().toast(`Update ${update.version ?? ''} is ready to install.`, {
          sticky: true,
          actionLabel: 'Restart now',
          action: () => void window.api.installUpdate()
        })
      }
    })
    api.on('user:replaced', (user) => set({ user, tagById: tagMap(user.tags) }))

    const snap = await api.getSnapshot()
    set({
      ready: true,
      folders: snap.folders,
      clips: new Map(snap.clips.map((c) => [c.key, c])),
      user: snap.user,
      tagById: tagMap(snap.user.tags),
      appInfo: snap.app
    })
  },

  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => {
    set((s) => ({ filters: { ...DEFAULT_FILTERS, anchor: Date.now(), query: s.filters.query } }))
    get().updateSettings({ hideSorted: false })
  },
  setView: (view) => set({ view }),
  openSettings: (tab) => set((s) => ({ view: 'settings', settingsTab: tab ?? s.settingsTab })),

  select: (key, mode) =>
    set((s) => {
      if (mode === 'only') return { selected: new Set([key]), anchorKey: key }
      if (mode === 'toggle') {
        const next = new Set(s.selected)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return { selected: next, anchorKey: key }
      }
      const order = s.visible.map((c) => c.key)
      const a = s.anchorKey ? order.indexOf(s.anchorKey) : -1
      const b = order.indexOf(key)
      if (a < 0 || b < 0) return { selected: new Set([key]), anchorKey: key }
      const [from, to] = a < b ? [a, b] : [b, a]
      return { selected: new Set(order.slice(from, to + 1)) }
    }),
  selectAll: () => set((s) => ({ selected: new Set(s.visible.map((c) => c.key)) })),
  clearSelection: () => set({ selected: new Set(), anchorKey: null }),

  openPlayer: (key, list) =>
    set((s) => ({
      view: 'player',
      playerKey: key,
      playerList: list ?? s.visible.map((c) => c.key)
    })),
  closePlayer: () => set({ view: 'library', playerKey: null }),
  stepPlayer: (dir) => {
    const { playerKey, playerList, clips } = get()
    if (!playerKey) return
    const i = playerList.indexOf(playerKey)
    for (let j = i + dir; j >= 0 && j < playerList.length; j += dir) {
      if (clips.has(playerList[j])) {
        set({ playerKey: playerList[j] })
        return
      }
    }
  },
  randomClip: () => {
    const { visible, playerKey, toast } = get()
    const pool = visible.filter((c) => c.key !== playerKey)
    if (pool.length === 0) {
      toast('No clips to pick from. Check your filters.')
      return
    }
    const pick = pool[Math.floor(Math.random() * pool.length)]
    get().openPlayer(pick.key, visible.map((c) => c.key))
  },

  patch: (keys, patch, undoLabel) => {
    const { user } = get()
    const before: Record<string, ClipUser> = {}
    const clips = { ...user.clips }
    for (const k of keys) {
      const cur = user.clips[k] ?? EMPTY_CLIP_USER
      before[k] = cur
      const next = applyPatch(cur, patch)
      if (isDefaultClipUser(next)) delete clips[k]
      else clips[k] = next
    }
    set((s) => ({
      user: { ...s.user, clips },
      undo: undoLabel ? [...s.undo.slice(-49), { label: undoLabel, before }] : s.undo
    }))
    void window.api.patchClips(keys, patch)
  },

  addTagByName: async (keys, name) => {
    const clean = name.trim()
    if (!clean || keys.length === 0) return
    let tag = get().user.tags.find((t) => t.name.toLowerCase() === clean.toLowerCase())
    if (!tag) {
      tag = await window.api.createTag(clean)
      const created = tag
      set((s) => {
        if (s.user.tags.some((t) => t.id === created.id)) return {}
        const tags = [...s.user.tags, created]
        return { user: { ...s.user, tags }, tagById: tagMap(tags) }
      })
    }
    get().patch(keys, { addTags: [tag.id] }, `Tag "${tag.name}"`)
  },

  undoLast: () => {
    const { undo, toast } = get()
    const entry = undo[undo.length - 1]
    if (!entry) {
      toast('Nothing to undo.')
      return
    }
    set({ undo: undo.slice(0, -1) })
    // Restore every clip to what it was, grouping clips that had the same state.
    const groups = new Map<string, { keys: string[]; value: ClipUser }>()
    for (const [k, v] of Object.entries(entry.before)) {
      const id = JSON.stringify(v)
      const g = groups.get(id) ?? { keys: [], value: v }
      g.keys.push(k)
      groups.set(id, g)
    }
    for (const g of groups.values()) {
      const patch: ClipBulkPatch = { set: { ...g.value } }
      const clips = { ...get().user.clips }
      for (const k of g.keys) {
        if (isDefaultClipUser(g.value)) delete clips[k]
        else clips[k] = g.value
      }
      set((s) => ({ user: { ...s.user, clips } }))
      void window.api.patchClips(g.keys, patch)
    }
    toast(`Undid: ${entry.label}`)
  },

  updateSettings: (patch) => {
    set((s) => ({ user: { ...s.user, settings: { ...s.user.settings, ...patch } } }))
    pendingSettings = { ...pendingSettings, ...patch }
    if (settingsTimer) clearTimeout(settingsTimer)
    settingsTimer = setTimeout(() => {
      const p = pendingSettings
      pendingSettings = {}
      settingsTimer = null
      void window.api.updateSettings(p)
    }, 250)
  },

  trashKeys: async (keys) => {
    const { clips, ask, toast } = get()
    const list = keys.map((k) => clips.get(k)).filter((c): c is Clip => !!c)
    if (list.length === 0) return false
    const copies = list.reduce((n, c) => n + c.files.length, 0)
    const withAudio = list.reduce((n, c) => n + c.files.filter((f) => f.audioPath).length, 0)
    const parts = [
      list.length === 1
        ? 'This clip will be moved to your recycle bin.'
        : `${list.length} clips will be moved to your recycle bin.`
    ]
    if (copies > list.length) parts.push(`Duplicates are included, so ${copies} files are affected.`)
    if (withAudio > 0) parts.push('Separate audio files that belong to them go along.')
    parts.push('Your tags and notes are kept, so restoring a file from the recycle bin brings them back.')
    const ok = await ask({
      title: list.length === 1 ? 'Move clip to recycle bin?' : `Move ${list.length} clips to recycle bin?`,
      body: parts.join(' '),
      confirmLabel: 'Move to recycle bin',
      danger: true
    })
    if (!ok) return false
    const res = await window.api.trashClips(keys)
    if (res.failed.length > 0) {
      toast(`${res.failed.length} file${res.failed.length === 1 ? '' : 's'} could not be moved (is the drive offline?).`, {
        kind: 'error'
      })
    } else {
      toast(`Moved ${res.trashed} clip${res.trashed === 1 ? '' : 's'} to the recycle bin.`)
    }
    set((s) => ({ selected: new Set([...s.selected].filter((k) => !keys.includes(k))) }))
    return res.trashed > 0
  },

  startDrag: (keys) => {
    if (keys.length > 0) window.api.startDrag(keys)
  },

  toast: (message, opts) => {
    const id = toastId++
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, ...opts }] }))
    if (!opts?.sticky) setTimeout(() => get().dismissToast(id), opts?.action ? 8000 : 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      set({
        confirm: {
          ...opts,
          resolve: (ok) => {
            set({ confirm: null })
            resolve(ok)
          }
        }
      })
    }),
  setCapturing: (on) => set({ capturingKey: on })
}))

// Keep the list of visible clips up to date whenever something it depends on changes.
useApp.subscribe((s, prev) => {
  const a = s.user.settings
  const b = prev.user.settings
  if (
    s.clips !== prev.clips ||
    s.user.clips !== prev.user.clips ||
    s.user.tags !== prev.user.tags ||
    s.filters !== prev.filters ||
    a.hideSorted !== b.hideSorted ||
    a.sort !== b.sort
  ) {
    const visible = computeVisible(
      s.clips.values(),
      { user: s.user, tags: s.user.tags, folders: s.folders },
      s.filters,
      a
    )
    useApp.setState({ visible })
  }
})

export function useSettings(): Settings {
  return useApp((s) => s.user.settings)
}
