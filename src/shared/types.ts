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

export interface Settings {
  editorName: string
  dragIncludeAudio: boolean
  autoplayNext: boolean
  loop: boolean
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
  hideSorted: boolean
  thumbSize: number
  group: 'day' | 'week' | 'month' | 'none'
  sort: 'oldest' | 'newest'
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
}

export interface ClipBulkPatch {
  addTags?: string[]
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
