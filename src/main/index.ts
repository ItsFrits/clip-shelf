import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { BrowserWindow, app, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { makeEmitter, registerIpc } from './ipc'
import { Library } from './library'
import { handleClipProtocol, registerClipScheme } from './protocol'
import { TITLE_BAR_HEIGHT, titleBarColors } from '../shared/uiPrefs'
import { createMediaTools } from './tools'
import { initLogging, logLine } from './log'
import { loadWindowState, trackWindowState } from './windowState'
import { Updater } from './updater'
import { UserDataStore } from './userData'

registerClipScheme()

let mainWindow: BrowserWindow | null = null
let library: Library | null = null
let user: UserDataStore | null = null

const MIN_SIZE = { width: 1100, height: 700 }

function createWindow(): BrowserWindow {
  const stateFile = join(app.getPath('userData'), 'window-state.json')
  const state = loadWindowState(stateFile, { width: 1600, height: 900 }, MIN_SIZE)
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    backgroundColor: '#0E1014',
    autoHideMenuBar: true,
    title: 'Clip Shelf',
    icon,
    // The top bar of the app doubles as the title bar. Windows still draws the minimize, maximize and
    // close buttons (so snap layouts and keyboard shortcuts keep working), in the colours of the bar.
    ...(process.platform === 'darwin'
      ? {}
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { ...titleBarColors(0), height: TITLE_BAR_HEIGHT }
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (state.maximized) win.maximize()
  trackWindowState(win, stateFile)
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.itsfrits.clipshelf')
    app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

    const dataDir = app.getPath('userData')
    const logDir = join(dataDir, 'logs')
    initLogging(
      logDir,
      `Clip Shelf ${app.getVersion()} started (${process.platform} ${process.arch}, Electron ${process.versions.electron}, ${app.isPackaged ? 'installed' : 'development'})`
    )
    const cacheDir = join(dataDir, 'clip-cache')
    const getWindow = (): BrowserWindow | null => mainWindow
    const emit = makeEmitter(getWindow)

    user = new UserDataStore(join(dataDir, 'userdata.json'))
    user.autoBackup(join(dataDir, 'backups'))

    library = new Library({
      user,
      indexFile: join(dataDir, 'index.json'),
      thumbDir: join(cacheDir, 'thumbs'),
      audioDir: join(cacheDir, 'audio'),
      tools: createMediaTools(),
      emit
    })

    const updater = new Updater((status) => emit('updater:status', status))
    handleClipProtocol(library)
    registerIpc({ library, user, updater, getWindow, logDir })

    mainWindow = createWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })
    mainWindow.webContents.on('render-process-gone', (_e, details) => logLine('error', `The window crashed: ${details.reason} (code ${details.exitCode})`))
    mainWindow.on('unresponsive', () => logLine('warn', 'The window stopped responding.'))
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
        mainWindow.on('closed', () => {
          mainWindow = null
        })
      }
    })

    updater.init()
    await library.start()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    library?.dispose()
    user?.flush()
  })
}
