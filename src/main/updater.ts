import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'
import { logLine } from './log'

/** Checks GitHub Releases for a newer version and downloads it in the background. */
export class Updater {
  private status: UpdateStatus = { state: 'idle' }
  private timer: NodeJS.Timeout | null = null

  constructor(private send: (status: UpdateStatus) => void) {}

  get current(): UpdateStatus {
    return this.status
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.send(status)
  }

  init(): void {
    if (!app.isPackaged) {
      this.set({ state: 'idle', message: 'Updates are only checked in the installed app.' })
      return
    }
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      this.set({ state: 'downloading', version: info.version, percent: 0 })
    )
    autoUpdater.on('update-not-available', () => this.set({ state: 'none' }))
    autoUpdater.on('download-progress', (p) =>
      this.set({
        state: 'downloading',
        version: this.status.version,
        percent: Math.round(p.percent)
      })
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ state: 'ready', version: info.version })
    )
    autoUpdater.on('error', (err) => {
      logLine('warn', 'Update problem: ' + (err?.message ?? String(err)))
      this.set({ state: 'error', message: err?.message ?? String(err) })
    })

    // A check is one small request, so start almost right away. The download runs in the background.
    setTimeout(() => void this.check(), 2000)
    this.timer = setInterval(() => void this.check(), 4 * 60 * 60 * 1000)
  }

  async check(): Promise<void> {
    if (!app.isPackaged) return
    if (this.status.state === 'checking' || this.status.state === 'downloading') return
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      this.set({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  install(): void {
    if (this.status.state === 'ready') autoUpdater.quitAndInstall()
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
  }
}
