import type {
  ApiEventName,
  ApiEvents,
  ClipBulkPatch,
  FolderConfig,
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
  mergeTags(sourceIds: string[], targetId: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>

  prepareAudio(key: string): Promise<PreparedAudio>
  prioritizeThumbs(keys: string[]): void
  startDrag(keys: string[]): void
  showInFolder(key: string): Promise<void>
  trashClips(keys: string[]): Promise<TrashResult>

  exportBackup(): Promise<string | null>
  importBackup(): Promise<boolean>

  checkForUpdates(): Promise<void>
  installUpdate(): Promise<void>

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
  'mergeTags',
  'updateSettings',
  'prepareAudio',
  'showInFolder',
  'trashClips',
  'exportBackup',
  'importBackup',
  'checkForUpdates',
  'installUpdate'
] as const

/** Fire and forget messages. */
export const SEND_METHODS = ['prioritizeThumbs', 'startDrag'] as const
