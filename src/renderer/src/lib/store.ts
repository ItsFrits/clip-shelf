import { create } from 'zustand'
import type {
  Clip,
  ClipBulkPatch,
  PresetParts,
  ClipUser,
  FolderInfo,
  JobProgress,
  Settings,
  Snapshot,
  Tag,
  UpdateStatus,
  UserData
} from '@shared/types'
import { cleanOrder, sortByOrder } from '@shared/projects'
import { DEFAULT_SAVED_FILTERS, sanitizeSavedFilters, toSavedFilters } from '@shared/savedFilters'
import { effectiveKeymap } from '@shared/keymap'
import {
  capturePreset,
  filtersWithPreset,
  freeKey,
  isDefaultFilters,
  isPresetModified,
  scopedFilters,
  uniqueName
} from '@shared/presets'
import {
  EMPTY_CLIP_USER,
  applyPatch,
  isDefaultClipUser,
  markTagsUsed,
  whatsNewNotice
} from '@shared/userLogic'
import { DEFAULT_SETTINGS } from '@shared/userLogic'
import { settingsTabOnOpen } from '@shared/uiPrefs'
import { DEFAULT_FILTERS, type Filters, computeVisible } from './filter'
import { plural } from './format'

export type View = 'library' | 'player' | 'settings' | 'projects'
export type SettingsTab =
  'general' | 'folders' | 'playback' | 'tags' | 'presets' | 'hotkeys' | 'backup' | 'about'

export interface Toast {
  id: number
  message: string
  kind?: 'error'
  actionLabel?: string
  action?: () => void
  /** Stays until the user dismisses it. */
  sticky?: boolean
}

export interface ConfirmCheck {
  id: string
  label: string
  checked: boolean
}

export interface ConfirmState {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  /** Check boxes under the text. Their values come back when the user confirms. */
  checks?: ConfirmCheck[]
  resolve: (ok: boolean, values?: Record<string, boolean>) => void
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
  /** Where closing Settings goes: the library, or the projects page. */
  returnView: 'library' | 'projects'
  /** The project that is open in the library view, or null for the whole library. */
  projectId: string | null
  settingsTab: SettingsTab
  filters: Filters
  /** Clips that pass the filters, in display order. */
  visible: Clip[]
  selected: Set<string>
  anchorKey: string | null

  playerKey: string | null
  /** The clip that was open when the player closed, so the library can scroll back to it. */
  focusKey: string | null
  playerList: string[]

  undo: UndoEntry[]
  toasts: Toast[]
  confirm: ConfirmState | null
  capturingKey: boolean

  init: () => Promise<void>
  setFilters: (patch: Partial<Filters>) => void
  resetFilters: () => void
  /** Switch to a preset, or to all clips (null). Gives a toast to go back when there were unsaved changes. */
  applyPreset: (id: string | null) => void
  /** Save the changes made to the active preset. */
  savePresetChanges: () => void
  /** Make a new preset from the filters as they are now, and make it the active one. */
  createPreset: (name: string, parts: PresetParts) => string
  /** Keep the filters but stop following the active preset. */
  ignorePreset: () => void
  setView: (view: View) => void
  openSettings: (tab?: SettingsTab) => void

  openProjects: () => void
  /** Show only the clips of this project in the library view. */
  openProject: (id: string) => void
  /** Back from a project to the projects page. */
  leaveProject: () => void
  /** Make a project and give back its id. */
  createProject: (name: string) => Promise<string>
  /** Add clips to a project. Gives a toast with Undo. */
  addToProject: (id: string, keys: string[]) => void
  removeFromProject: (id: string, keys: string[]) => void
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (id: string | null) => void
  /** The tab of the open project: its clips, or the order of the clips. */
  projectTab: 'clips' | 'order'
  setProjectTab: (tab: 'clips' | 'order') => void
  /** Change the order of a project. With a label there is a toast with Undo. */
  setProjectOrder: (id: string, order: string[], undoLabel?: string) => void
  /** Back and forward through the places you have been (library, projects, a project, the player). */
  navBack: () => void
  navForward: () => void

  select: (key: string, mode: 'only' | 'toggle' | 'range') => void
  selectAll: () => void
  clearSelection: () => void

  openPlayer: (key: string, list?: string[]) => void
  closePlayer: () => void
  stepPlayer: (dir: 1 | -1) => void
  randomClip: () => void

  patch: (keys: string[], patch: ClipBulkPatch, undoLabel?: string) => void
  /** Add a tag by name, creating it when it is new. `at` is the place in the tag list, default the end. */
  addTagByName: (keys: string[], name: string, at?: number) => Promise<void>
  updateTag: (id: string, patch: { name?: string; suggests?: string[] }) => void
  addSuggestion: (tagId: string, name: string) => Promise<void>
  undoLast: () => void
  updateSettings: (patch: Partial<Settings>) => void
  trashKeys: (keys: string[]) => Promise<boolean>
  startDrag: (keys: string[]) => void

  toast: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message'>>) => void
  dismissToast: (id: number) => void
  ask: (opts: Omit<ConfirmState, 'resolve'>) => Promise<boolean>
  /** Like ask, with check boxes. Gives the checked state of each box, or null when cancelled. */
  askChecks: (opts: Omit<ConfirmState, 'resolve'>) => Promise<Record<string, boolean> | null>
  setCapturing: (on: boolean) => void
  /** The dialog for making a new preset from the current filters. */
  newPresetOpen: boolean
  setNewPresetOpen: (open: boolean) => void
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
  returnView: 'library',
  projectId: null,
  projectTab: 'clips',
  settingsTab: 'general',
  filters: { ...DEFAULT_FILTERS, anchor: Date.now() },
  visible: [],
  selected: new Set(),
  anchorKey: null,

  playerKey: null,
  focusKey: null,
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
    const onUpdate = (update: UpdateStatus): void => {
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
    }
    api.on('updater:status', onUpdate)
    api.on('user:replaced', (user) =>
      set((s) => {
        // A project that was deleted closes itself.
        const gone = s.projectId !== null && !user.projects.some((p) => p.id === s.projectId)
        return {
          user,
          tagById: tagMap(user.tags),
          ...(gone ? { projectId: null, view: s.view === 'library' ? 'projects' : s.view } : {})
        }
      })
    )

    const snap = await api.getSnapshot()
    set({
      ready: true,
      folders: snap.folders,
      clips: new Map(snap.clips.map((c) => [c.key, c])),
      user: snap.user,
      tagById: tagMap(snap.user.tags),
      appInfo: snap.app,
      // Open the library with the filters you left it with (not the search text).
      filters: {
        ...get().filters,
        ...sanitizeSavedFilters(
          snap.user.settings.savedFilters,
          snap.user.tags.map((t) => t.id),
          snap.user.folders.map((f) => f.id),
          Date.now()
        )
      }
    })
    // The check starts a couple of seconds after launch, which can be before this window is listening.
    if (snap.update.state !== get().update.state) onUpdate(snap.update)

    // After an update, point to the release notes once. Only for the installed app, so developing
    // does not touch this. A brand new install (no folders or clips yet) gets no notice.
    if (snap.app.packaged) {
      const hadData = snap.user.folders.length > 0 || Object.keys(snap.user.clips).length > 0
      const notice = whatsNewNotice(snap.user.settings.lastSeenVersion, snap.app.version, hadData)
      if (notice.remember) get().updateSettings({ lastSeenVersion: snap.app.version })
      if (notice.notify) {
        get().toast(`Updated to Clip Shelf ${snap.app.version}.`, {
          actionLabel: 'See what’s new',
          action: () => get().openSettings('about')
        })
      }
    }
  },

  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => {
    set((s) => ({ filters: { ...DEFAULT_FILTERS, anchor: Date.now(), query: s.filters.query } }))
  },
  applyPreset: (id) => {
    const s = get()
    const settings = s.user.settings
    const presets = settings.presets ?? []
    const target = id ? presets.find((p) => p.id === id) : null
    if (id && !target) return
    const tagIds = s.user.tags.map((t) => t.id)
    const folderIds = s.user.folders.map((f) => f.id)
    const resolve = (p: (typeof presets)[number]): typeof p => ({
      ...p,
      filters: scopedFilters(sanitizeSavedFilters(p.filters, tagIds, folderIds, 0), p.parts)
    })
    const current = toSavedFilters(s.filters)
    const active = presets.find((p) => p.id === settings.activePresetId)
    const unsaved = active
      ? isPresetModified(resolve(active), current, settings.sortRules)
      : !isDefaultFilters(current)
    const before = {
      filters: s.filters,
      activePresetId: settings.activePresetId,
      sortRules: settings.sortRules
    }

    if (target) {
      const next = sanitizeSavedFilters(
        filtersWithPreset(resolve(target), current),
        tagIds,
        folderIds,
        Date.now()
      )
      set({ filters: { ...s.filters, ...next } })
      get().updateSettings({
        activePresetId: target.id,
        ...(target.parts.sort ? { sortRules: target.sortRules } : {})
      })
    } else {
      set({ filters: { ...DEFAULT_FILTERS, anchor: Date.now(), query: s.filters.query } })
      get().updateSettings({ activePresetId: null })
    }
    if (unsaved) {
      const message = !target
        ? 'Showing all clips. Your changes were not saved.'
        : target.id === before.activePresetId
          ? `Went back to “${target.name}” as it was saved.`
          : `Switched to “${target.name}”. Your changes were not saved.`
      get().toast(message, {
        actionLabel: 'Undo',
        action: () => {
          set({ filters: before.filters })
          get().updateSettings({
            activePresetId: before.activePresetId,
            sortRules: before.sortRules
          })
        }
      })
    }
  },
  savePresetChanges: () => {
    const s = get()
    const settings = s.user.settings
    const presets = settings.presets ?? []
    const active = presets.find((p) => p.id === settings.activePresetId)
    if (!active) return
    const saved = capturePreset(active, toSavedFilters(s.filters), active.parts, settings.sortRules)
    // A preset that does not keep the sort order keeps the one it had.
    const next = active.parts.sort ? saved : { ...saved, sortRules: active.sortRules }
    get().updateSettings({ presets: presets.map((p) => (p.id === active.id ? next : p)) })
  },
  createPreset: (name, parts) => {
    const s = get()
    const settings = s.user.settings
    const presets = settings.presets ?? []
    const id = crypto.randomUUID()
    const taken = Object.values(effectiveKeymap(settings.keymap)).flat()
    const preset = capturePreset(
      { id, name: uniqueName(name, presets), hotkey: freeKey(presets, taken) },
      toSavedFilters(s.filters),
      parts,
      settings.sortRules
    )
    get().updateSettings({ presets: [...presets, preset], activePresetId: id })
    return id
  },
  ignorePreset: () => get().updateSettings({ activePresetId: null }),
  setView: (view) =>
    set((s) => ({
      view: view === 'library' && s.view === 'settings' ? s.returnView : view,
      // Leaving the projects page for the library means the whole library.
      ...(view === 'library' && s.view === 'projects' ? { projectId: null } : {})
    })),
  openSettings: (tab) =>
    set((s) => ({
      view: 'settings',
      returnView: s.view === 'projects' ? 'projects' : 'library',
      settingsTab: settingsTabOnOpen(
        tab,
        s.settingsTab,
        s.user.settings.rememberSettingsTab,
        'general'
      )
    })),

  openProjects: () =>
    set({ view: 'projects', projectId: null, selected: new Set(), anchorKey: null }),
  openProject: (id) =>
    set((s) => ({
      view: 'library',
      projectId: id,
      projectTab: 'clips',
      // Coming from the player: the project scrolls to the clip you had open, when it is in it.
      playerKey: null,
      focusKey: s.view === 'player' ? s.playerKey : null,
      selected: new Set(),
      anchorKey: null
    })),
  leaveProject: () =>
    set({ view: 'projects', projectId: null, selected: new Set(), anchorKey: null }),
  createProject: async (name) => {
    const project = await window.api.createProject(name)
    // The update from the main process may not have arrived yet.
    set((s) =>
      s.user.projects.some((p) => p.id === project.id)
        ? {}
        : { user: { ...s.user, projects: [...s.user.projects, project] } }
    )
    return project.id
  },
  addToProject: (id, keys) => {
    const project = get().user.projects.find((p) => p.id === id)
    if (!project || keys.length === 0) return
    const have = new Set(project.clipKeys)
    const added = [...new Set(keys)].filter((k) => !have.has(k))
    if (added.length === 0) {
      get().toast(
        keys.length === 1
          ? `Already in “${project.name}”.`
          : `All of these are already in “${project.name}”.`
      )
      return
    }
    void window.api.addToProject(id, added)
    const skipped = new Set(keys).size - added.length
    get().toast(
      `Added ${plural(added.length, 'clip')} to “${project.name}”.` +
        (skipped > 0 ? ` ${skipped} ${skipped === 1 ? 'was' : 'were'} already in it.` : ''),
      { actionLabel: 'Undo', action: () => void window.api.removeFromProject(id, added) }
    )
  },
  removeFromProject: (id, keys) => {
    const project = get().user.projects.find((p) => p.id === id)
    if (!project || keys.length === 0) return
    const drop = new Set(keys)
    const removed = project.clipKeys.filter((k) => drop.has(k))
    if (removed.length === 0) return
    void window.api.removeFromProject(id, removed)
    set((s) => ({ selected: new Set([...s.selected].filter((k) => !drop.has(k))) }))
    get().toast(`Removed ${plural(removed.length, 'clip')} from “${project.name}”.`, {
      actionLabel: 'Undo',
      // The clips go back at the end of the project.
      action: () => void window.api.addToProject(id, removed)
    })
  },
  deleteProject: async (id) => {
    const project = get().user.projects.find((p) => p.id === id)
    if (!project) return
    const ok = await get().ask({
      title: `Delete “${project.name}”?`,
      body: 'The project is removed. Your clips, tags and ratings stay as they are.',
      confirmLabel: 'Delete project',
      danger: true
    })
    if (!ok) return
    await window.api.deleteProject(id)
  },
  setActiveProject: (id) => get().updateSettings({ activeProjectId: id }),
  setProjectTab: (tab) => set({ projectTab: tab, selected: new Set(), anchorKey: null }),
  setProjectOrder: (id, order, undoLabel) => {
    const project = get().user.projects.find((p) => p.id === id)
    if (!project) return
    const next = cleanOrder(order, project.clipKeys)
    const before = project.order
    if (next.length === before.length && next.every((k, i) => k === before[i])) return
    set((s) => ({
      user: {
        ...s.user,
        projects: s.user.projects.map((p) => (p.id === id ? { ...p, order: next } : p))
      }
    }))
    void window.api.setProjectOrder(id, next)
    if (undoLabel)
      get().toast(undoLabel, {
        actionLabel: 'Undo',
        action: () => get().setProjectOrder(id, before)
      })
  },
  navBack: () => stepHistory(-1),
  navForward: () => stepHistory(1),

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
  closePlayer: () => set((s) => ({ view: 'library', playerKey: null, focusKey: s.playerKey })),
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
    get().openPlayer(
      pick.key,
      visible.map((c) => c.key)
    )
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
      user: { ...s.user, clips, tags: markTagsUsed(s.user.tags, patch.addTags, Date.now()) },
      undo: undoLabel ? [...s.undo.slice(-49), { label: undoLabel, before }] : s.undo
    }))
    void window.api.patchClips(keys, patch)
  },

  addTagByName: async (keys, name, at) => {
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
    get().patch(keys, { addTags: [tag.id], addTagsAt: at }, `Tag "${tag.name}"`)
  },

  updateTag: (id, patch) => {
    set((s) => {
      const tags = s.user.tags.map((t) => {
        if (t.id !== id) return t
        const next = { ...t }
        if (patch.name !== undefined && patch.name.trim()) next.name = patch.name.trim()
        if (patch.suggests !== undefined) {
          const list = [...new Set(patch.suggests)].filter((x) => x !== id)
          if (list.length > 0) next.suggests = list
          else delete next.suggests
        }
        return next
      })
      return { user: { ...s.user, tags }, tagById: tagMap(tags) }
    })
    void window.api.updateTag(id, patch)
  },

  /** Make `name` one of the tags suggested after the tag `tagId`. Creates the tag if it is new. */
  addSuggestion: async (tagId, name) => {
    const clean = name.trim()
    if (!clean) return
    let target = get().user.tags.find((t) => t.name.toLowerCase() === clean.toLowerCase())
    if (!target) {
      target = await window.api.createTag(clean)
      const created = target
      set((s) => {
        if (s.user.tags.some((t) => t.id === created.id)) return {}
        const tags = [...s.user.tags, created]
        return { user: { ...s.user, tags }, tagById: tagMap(tags) }
      })
    }
    if (target.id === tagId) return
    const current = get().user.tags.find((t) => t.id === tagId)?.suggests ?? []
    if (current.includes(target.id)) return
    get().updateTag(tagId, { suggests: [...current, target.id] })
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
    if (copies > list.length)
      parts.push(`Duplicates are included, so ${copies} files are affected.`)
    if (withAudio > 0) parts.push('Separate audio files that belong to them go along.')
    parts.push(
      'Your tags and notes are kept, so restoring a file from the recycle bin brings them back.'
    )
    const ok = await ask({
      title:
        list.length === 1
          ? 'Move clip to recycle bin?'
          : `Move ${list.length} clips to recycle bin?`,
      body: parts.join(' '),
      confirmLabel: 'Move to recycle bin',
      danger: true
    })
    if (!ok) return false
    const res = await window.api.trashClips(keys)
    if (res.failed.length > 0) {
      toast(
        `${res.failed.length} file${res.failed.length === 1 ? '' : 's'} could not be moved (is the drive offline?).`,
        {
          kind: 'error'
        }
      )
    } else {
      toast(`Moved ${res.trashed} clip${res.trashed === 1 ? '' : 's'} to the recycle bin.`)
    }
    set((s) => ({ selected: new Set([...s.selected].filter((k) => !keys.includes(k))) }))
    return res.trashed > 0
  },

  startDrag: (keys) => {
    if (keys.length === 0) return
    // Inside a project the clips go to the editor in the order of the project.
    const s = get()
    const project = s.projectId ? s.user.projects.find((p) => p.id === s.projectId) : null
    window.api.startDrag(project ? sortByOrder(keys, project.order) : keys)
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
  askChecks: (opts) =>
    new Promise<Record<string, boolean> | null>((resolve) => {
      set({
        confirm: {
          ...opts,
          resolve: (ok, values) => {
            set({ confirm: null })
            resolve(ok ? (values ?? {}) : null)
          }
        }
      })
    }),
  setCapturing: (on) => set({ capturingKey: on }),
  newPresetOpen: false,
  setNewPresetOpen: (open) => set({ newPresetOpen: open })
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
    s.projectId !== prev.projectId ||
    s.user.projects !== prev.user.projects ||
    a.sortRules !== b.sortRules ||
    a.randomSeed !== b.randomSeed
  ) {
    // A project shows its own clips, and only the search box still filters them.
    const project = s.projectId ? s.user.projects.find((p) => p.id === s.projectId) : null
    const source = project
      ? project.clipKeys.flatMap((k) => {
          const c = s.clips.get(k)
          return c ? [c] : []
        })
      : s.clips.values()
    const filters = project
      ? { ...DEFAULT_FILTERS, anchor: s.filters.anchor, query: s.filters.query }
      : s.filters
    const visible = computeVisible(
      source,
      { user: s.user, tags: s.user.tags, folders: s.folders },
      filters,
      a
    )
    useApp.setState({ visible })
  }
})

// Remember the sidebar filters. Only changes after the first load are saved, so opening the app never
// overwrites what was saved with the defaults.
useApp.subscribe((s, prev) => {
  if (!s.ready || !prev.ready || s.filters === prev.filters) return
  const next = toSavedFilters(s.filters)
  const current = s.user.settings.savedFilters ?? toSavedFilters(DEFAULT_SAVED_FILTERS)
  if (JSON.stringify(next) !== JSON.stringify(current)) s.updateSettings({ savedFilters: next })
})

// ---- Back and forward. Every place you land on is remembered, so the mouse side buttons (and
// Alt+Left and Alt+Right) can walk back through them. Settings is not part of it, it just closes.
interface Place {
  view: 'library' | 'projects' | 'player'
  projectId: string | null
  playerKey: string | null
  playerList: string[]
}
const MAX_PLACES = 50
let places: Place[] = []
let placeIndex = -1
let travelling = false

function placeOf(s: AppState): Place | null {
  if (s.view === 'settings') return null
  return { view: s.view, projectId: s.projectId, playerKey: s.playerKey, playerList: s.playerList }
}

function samePlace(a: Place, b: Place): boolean {
  return a.view === b.view && a.projectId === b.projectId && a.playerKey === b.playerKey
}

useApp.subscribe((s) => {
  if (travelling || !s.ready) return
  const here = placeOf(s)
  if (!here) return
  const last = places[placeIndex]
  if (last && samePlace(last, here)) return
  places = places.slice(0, placeIndex + 1)
  // Going to the next clip in the player replaces the clip instead of adding a step.
  if (last?.view === 'player' && here.view === 'player') places[placeIndex] = here
  else places.push(here)
  if (places.length > MAX_PLACES) places = places.slice(-MAX_PLACES)
  placeIndex = places.length - 1
})

function stepHistory(dir: 1 | -1): void {
  const s = useApp.getState()
  if (s.view === 'settings') {
    if (dir === -1) s.setView('library')
    return
  }
  const clips = s.clips
  for (let i = placeIndex + dir; i >= 0 && i < places.length; i += dir) {
    const p = places[i]
    // Skip places that are gone: a deleted project, or a clip that left the library.
    if (p.projectId && !s.user.projects.some((x) => x.id === p.projectId)) continue
    if (p.view === 'player' && (!p.playerKey || !clips.has(p.playerKey))) continue
    placeIndex = i
    travelling = true
    useApp.setState({
      view: p.view,
      projectId: p.projectId,
      playerKey: p.view === 'player' ? p.playerKey : null,
      playerList: p.view === 'player' ? p.playerList : s.playerList,
      focusKey: s.view === 'player' ? s.playerKey : null,
      selected: new Set(),
      anchorKey: null
    })
    travelling = false
    return
  }
}

export function useSettings(): Settings {
  return useApp((s) => s.user.settings)
}
