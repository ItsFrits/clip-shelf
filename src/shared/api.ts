import type {
  ApiEventName,
  ApiEvents,
  ClipBulkPatch,
  FolderConfig,
  Project,
  PreparedAudio,
  Settings,
  Snapshot,
  Tag,
  TrashResult
} from './types'

/** Everything the renderer can ask the main process to do. */
export interface ClipShelfApi {
  getSnapshot(): Promise<Snapshot>

  pickFolder(): Promise<string | null>
  addFolder(cfg: Omit<FolderConfig, 'id'>): Promise<FolderConfig>
  updateFolder(id: string, patch: Partial<Omit<FolderConfig, 'id'>>): Promise<void>
  removeFolder(id: string): Promise<void>
  rescan(id?: string): Promise<void>

  patchClips(keys: string[], patch: ClipBulkPatch): Promise<void>
  createTag(name: string): Promise<Tag>
  renameTag(id: string, name: string): Promise<void>
  deleteTag(id: string): Promise<void>
  updateTag(id: string, patch: { name?: string; suggests?: string[] }): Promise<void>
  mergeTags(sourceIds: string[], targetId: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>

  createProject(name: string): Promise<Project>
  renameProject(id: string, name: string): Promise<void>
  deleteProject(id: string): Promise<void>
  duplicateProject(id: string): Promise<Project | null>
  addToProject(id: string, keys: string[]): Promise<void>
  removeFromProject(id: string, keys: string[]): Promise<void>
  /** Set the order of a project: the clips that have a place, first to last. */
  setProjectOrder(id: string, order: string[]): Promise<void>

  prepareAudio(key: string): Promise<PreparedAudio>
  prioritizeThumbs(keys: string[]): void
  startDrag(keys: string[]): void
  showInFolder(key: string): Promise<void>
  trashClips(keys: string[]): Promise<TrashResult>

  exportBackup(): Promise<string | null>
  importBackup(): Promise<boolean>

  checkForUpdates(): Promise<void>
  installUpdate(): Promise<void>

  openLogsFolder(): Promise<void>
  /** Write an error from the window to the log file. */
  logError(message: string): void
  /**
   * Darken the system title bar buttons to match a dark layer over the page (0 is none, 1 is black).
   * The change takes fadeMs milliseconds. Only on Windows and Linux.
   */
  setTitleBarDim(alpha: number, fadeMs: number): void

  on<E extends ApiEventName>(event: E, cb: (payload: ApiEvents[E]) => void): () => void
}

/** Methods that are plain request/response calls over IPC. */
export const INVOKE_METHODS = [
  'getSnapshot',
  'pickFolder',
  'addFolder',
  'updateFolder',
  'removeFolder',
  'rescan',
  'patchClips',
  'createTag',
  'renameTag',
  'deleteTag',
  'updateTag',
  'mergeTags',
  'updateSettings',
  'createProject',
  'renameProject',
  'deleteProject',
  'duplicateProject',
  'addToProject',
  'removeFromProject',
  'setProjectOrder',
  'prepareAudio',
  'showInFolder',
  'trashClips',
  'exportBackup',
  'importBackup',
  'checkForUpdates',
  'installUpdate',
  'openLogsFolder'
] as const

/** Fire and forget messages. */
export const SEND_METHODS = ['prioritizeThumbs', 'startDrag', 'logError', 'setTitleBarDim'] as const
