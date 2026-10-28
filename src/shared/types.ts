// Types shared by the main process, the preload script and the renderer.

export interface FolderConfig {
  id: string
  path: string
  /** Name shown in the UI and on clip badges, for example "OBS". */
  name: string
  includeSubfolders: boolean
  /** Link a separate audio file with the same name (for example a mic .m4a) to the mp4. */
  pairAudio: boolean
  /** Offer subfolder names as tag suggestions. */
  suggestTags: boolean
}

export interface FolderInfo extends FolderConfig {
  online: boolean
  clipCount: number
  totalBytes: number
  scanning: boolean
}

export interface AudioTrackInfo {
  /** Index among the audio streams of the file (0 based). */
  index: number
  codec: string
  channels: number
  title?: string
}

export interface ClipFile {
  path: string
  folderId: string
  size: number
  mtimeMs: number
  /** A separate audio file that belongs to this video, if any. */
  audioPath?: string
}

export interface Clip {
  /** Stable id based on file name and size, so it survives moving a file to another folder. */
  key: string
  name: string
  /** Recording time in ms since epoch (from the file name, else the file date). */
  date: number
  size: number
  durationMs?: number
  width?: number
  height?: number
  fps?: number
  audioTracks?: AudioTrackInfo[]
  probeFailed?: boolean
  /** All copies of this clip. More than one means duplicates. */
  files: ClipFile[]
  /** Folder names the clip lives in, offered as tag suggestions. */
  hints: string[]
  hasThumb: boolean
}

export interface Tag {
  id: string
  name: string
  /**
   * Tags to suggest once this tag is on a clip, as tag ids. One way only: if A suggests B,
   * B does not suggest A unless it says so itself.
   */
  suggests?: string[]
  /** When the tag was last put on a clip (ms since 1970). Used for sorting by "Recent". */
  usedAt?: number
}

export type TagSort = 'name' | 'count' | 'recent'

/** The sidebar filters that are kept between sessions. The search text is not part of it. */
export interface SavedFilters {
  statuses: ('new' | 'watched' | 'tagged' | 'used')[]
  tagIds: string[]
  /** Clips with any of these tags are hidden, even when they also have a tag from tagIds. */
  excludeTagIds: string[]
  tagMode: 'any' | 'all'
  /** Stars from 1 to 5. Unrated clips (0) are shown or hidden by showUnrated, whatever the range. */
  minRating: number
  maxRating: number
  showUnrated: boolean
  dateMode: 'all' | 'day' | 'week' | 'month' | 'year' | 'range'
  /** Any time inside the chosen week, month or year. 0 when the date filter is off. */
  anchor: number
  /** yyyy-mm-dd, for the custom range. */
  rangeFrom: string
  rangeTo: string
  folderIds: string[]
}

/** The parts of the library view a preset can also keep, besides status, tags and rating. */
export interface PresetParts {
  date: boolean
  folders: boolean
  sort: boolean
}

/** A named combination of filters (and optionally a date, folders and a sort order) you can switch to. */
export interface Preset {
  id: string
  name: string
  /** The filters of the preset. Date and folders only count when `parts` says so. */
  filters: SavedFilters
  parts: PresetParts
  /** The sort rules. Only used when `parts.sort` is on. */
  sortRules: SortRule[]
  /** A key combination such as "Alt+1", or null. */
  hotkey: string | null
}

export interface ClipUser {
  tags: string[]
  /** 0 means not rated. */
  rating: number
  watched: boolean
  used: boolean
  note: string
  ignoredHints: string[]
}

export type ProjectStatus = 'idea' | 'working' | 'published'

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  link: string
  notes: string
  clipKeys: string[]
  createdAt: number
}

export interface TrackLevel {
  /** 0 to 1 */
  volume: number
  muted: boolean
}

export type SortField = 'date' | 'rating' | 'length' | 'size' | 'name' | 'random'
export interface SortRule {
  field: SortField
  dir: 'asc' | 'desc'
}

export type AnimationMode = 'system' | 'on' | 'off'
export type AnimationSpeed = 'slow' | 'normal' | 'fast'
/** Settings open as a window over the library, or as a page that replaces it. */
export type SettingsView = 'window' | 'page'

export interface Settings {
  editorName: string
  dragIncludeAudio: boolean
  autoplayNext: boolean
  loop: boolean
  /** Show keyboard shortcut hints next to buttons and fields. */
  showKeyHints: boolean
  /** Order of the tag lists in the sidebar and in Settings, Tags. */
  tagSort: TagSort
  /** Open Settings as a window over the library, or as a full page. */
  settingsView: SettingsView
  /** Open Settings on the tab you used last. When off it starts on the first tab. */
  rememberSettingsTab: boolean
  /** 'system' follows the operating system's reduced motion setting. */
  animations: AnimationMode
  animationSpeed: AnimationSpeed
  /** The filters as you left them, so the library opens where you stopped. */
  savedFilters: SavedFilters | null
  /** The presets, in the order they are shown. Null until the default presets have been added. */
  presets: Preset[] | null
  /** The preset the filters were taken from. The filters can have been changed since. */
  activePresetId: string | null
  /** The app version the user last saw, to show a "what's new" notice after an update. */
  lastSeenVersion: string
  /** Volume (0 to 1) that stays the same when switching clips. */
  masterVolume: number
  /** Master mute. Stays on when you switch to another clip. */
  masterMuted: boolean
  /** Show the track names stored in the file, or just "Track 1", "Track 2". */
  trackNames: 'names' | 'numbers'
  /** Remembered volume (0 to 1) per track label, for example "Microphone". */
  trackVolumes: Record<string, number>
  /**
   * Volume and mute per track, remembered for clips that live in the same folder and have the
   * same audio tracks. Keyed by the profile key (see trackProfileKey), then by track label.
   */
  trackProfiles: Record<string, Record<string, TrackLevel>>
  /** Only the actions the user changed. Missing actions use the defaults. */
  keymap: Record<string, string[]>
  ignorePatterns: string[]
  autoBackup: boolean
  thumbSize: number
  group: 'day' | 'week' | 'month' | 'none'
  /** How the clips are ordered. The first rule counts most, the next ones break ties. */
  sortRules: SortRule[]
  /** Decides the order when sorting at random. A new number shuffles again. */
  randomSeed: number
}

export interface UserData {
  v: 1
  folders: FolderConfig[]
  tags: Tag[]
  clips: Record<string, ClipUser>
  projects: Project[]
  settings: Settings
  lastBackupAt: number | null
}

export interface Snapshot {
  folders: FolderInfo[]
  clips: Clip[]
  user: UserData
  app: { version: string; platform: string; packaged: boolean }
  /** Latest update status, in case an update event came in before the window was listening. */
  update: UpdateStatus
}

export interface ClipBulkPatch {
  addTags?: string[]
  /** Where in the tag list addTags go. Missing means at the end. */
  addTagsAt?: number
  removeTags?: string[]
  set?: Partial<ClipUser>
}

export interface PreparedTrack {
  /** Stable name of the track: its real name from the file, else "Track N". Volumes are remembered by this. */
  label: string
  /** Always "Track N", for people who prefer numbers over names. */
  number: string
  url: string
  /** "embedded" tracks come out of the mp4, "file" tracks are separate audio files. */
  kind: 'embedded' | 'file'
}

export interface PreparedAudio {
  tracks: PreparedTrack[]
  /**
   * True when the first track is the video's own audio. The video element then plays it
   * (through the mixer) and must not be muted. False when every track is a separate file.
   */
  useVideoAudio: boolean
}

export interface TrashResult {
  trashed: number
  failed: string[]
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  message?: string
}

export interface LibraryDelta {
  upserts: Clip[]
  removes: string[]
}

export interface JobProgress {
  pending: number
  total: number
}

export interface ApiEvents {
  'library:delta': LibraryDelta
  'folders:changed': FolderInfo[]
  'thumb:ready': string[]
  'jobs:progress': JobProgress
  'user:replaced': UserData
  'updater:status': UpdateStatus
}

export type ApiEventName = keyof ApiEvents
