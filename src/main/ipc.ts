import { BrowserWindow, app, dialog, ipcMain, nativeImage, shell } from 'electron'
import { readFileSync } from 'fs'
import icon from '../../resources/icon.png?asset'
import type { ApiEventName, ApiEvents, Snapshot } from '../shared/types'
import type { Library } from './library'
import type { Updater } from './updater'
import type { UserDataStore } from './userData'

interface IpcContext {
  library: Library
  user: UserDataStore
  updater: Updater
  getWindow: () => BrowserWindow | null
}

/** Send an event to the window. */
export function makeEmitter(getWindow: () => BrowserWindow | null) {
  return <E extends ApiEventName>(event: E, payload: ApiEvents[E]): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send('evt:' + event, payload)
  }
}

export function registerIpc(ctx: IpcContext): void {
  const { library, user, updater, getWindow } = ctx
  const emit = makeEmitter(getWindow)
  const handle = (name: string, fn: (...args: any[]) => unknown): void => {
    ipcMain.handle('api:' + name, (_e, ...args) => fn(...args))
  }

  handle('getSnapshot', (): Snapshot => ({
    folders: library.folderInfos(),
    clips: library.allClips(),
    user: user.data,
    app: { version: app.getVersion(), platform: process.platform, packaged: app.isPackaged },
    update: updater.current
  }))

  handle('pickFolder', async () => {
    const win = getWindow()
    const opts = { title: 'Choose a folder with clips', properties: ['openDirectory' as const] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })
  handle('addFolder', (cfg) => library.addFolder(cfg))
  handle('updateFolder', (id, patch) => library.updateFolder(id, patch))
  handle('removeFolder', (id) => library.removeFolder(id))
  handle('rescan', (id) => library.rescan(id))

  handle('patchClips', (keys, patch) => user.patchClips(keys, patch))
  handle('createTag', (name) => user.createTag(name))
  handle('renameTag', (id, name) => {
    user.renameTag(id, name)
    emit('user:replaced', user.data)
  })
  handle('updateTag', (id, patch) => user.updateTag(id, patch))
  handle('deleteTag', (id) => {
    user.deleteTag(id)
    emit('user:replaced', user.data)
  })
  handle('mergeTags', (sources, target) => {
    user.mergeTags(sources, target)
    emit('user:replaced', user.data)
  })
  handle('updateSettings', (patch) => {
    user.updateSettings(patch)
    if (patch && 'ignorePatterns' in patch) library.rescan()
  })

  handle('prepareAudio', (key) => library.prepareAudio(key))
  handle('showInFolder', (key) => {
    const p = library.primaryPath(key)
    if (p) shell.showItemInFolder(p)
  })
  handle('trashClips', (keys) => library.trashClips(keys, (p) => shell.trashItem(p)))

  handle('exportBackup', async () => {
    const win = getWindow()
    const name = `clip-shelf-backup-${new Date().toISOString().slice(0, 10)}.json`
    const opts = { title: 'Save backup', defaultPath: name, filters: [{ name: 'JSON', extensions: ['json'] }] }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    user.exportTo(res.filePath)
    return res.filePath
  })
  handle('importBackup', async () => {
    const win = getWindow()
    const opts = {
      title: 'Restore backup',
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) return false
    const ok = user.importFromJson(readFileSync(res.filePaths[0], 'utf8'))
    if (ok) emit('user:replaced', user.data)
    return ok
  })

  handle('checkForUpdates', () => updater.check())
  handle('installUpdate', () => updater.install())

  ipcMain.on('api:prioritizeThumbs', (_e, keys: string[]) => {
    if (Array.isArray(keys)) library.prioritize(keys)
  })

  // The renderer calls this from a dragstart event. Dropping the files on a video editor imports them.
  ipcMain.on('api:startDrag', (e, keys: string[]) => {
    if (!Array.isArray(keys)) return
    const files: string[] = []
    for (const key of keys.slice(0, 500)) {
      const video = library.primaryPath(key)
      if (!video) continue
      files.push(video)
      if (user.data.settings.dragIncludeAudio) {
        const aux = library.auxPath(key)
        if (aux) files.push(aux)
      }
    }
    if (files.length === 0) return
    const thumb = library.thumbPath(keys[0])
    let img = thumb ? nativeImage.createFromPath(thumb) : nativeImage.createEmpty()
    if (img.isEmpty()) img = nativeImage.createFromPath(icon)
    e.sender.startDrag({ file: files[0], files, icon: img.resize({ width: 128 }) })
  })
}
