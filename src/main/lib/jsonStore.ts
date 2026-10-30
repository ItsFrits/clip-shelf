import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  copyFileSync,
  statSync
} from 'fs'
import { promises as fsp } from 'fs'
import { dirname } from 'path'

/**
 * A small JSON file that lives in memory and is saved a moment after every change.
 * Writes are atomic (temp file + rename) and an older copy is kept as .bak.
 */
export class JsonStore<T extends object> {
  private data: T
  private timer: NodeJS.Timeout | null = null
  private saving: Promise<void> = Promise.resolve()
  private dirty = false

  constructor(
    private file: string,
    defaults: T,
    migrate?: (raw: unknown, defaults: T) => T
  ) {
    mkdirSync(dirname(file), { recursive: true })
    this.data = this.load(defaults, migrate)
  }

  private load(defaults: T, migrate?: (raw: unknown, defaults: T) => T): T {
    for (const f of [this.file, this.file + '.bak']) {
      try {
        if (!existsSync(f)) continue
        const raw = JSON.parse(readFileSync(f, 'utf8'))
        return migrate ? migrate(raw, defaults) : ({ ...defaults, ...raw } as T)
      } catch (err) {
        console.error(`Could not read ${f}:`, err)
      }
    }
    return defaults
  }

  get(): T {
    return this.data
  }

  /** Change the data in place and schedule a save. */
  mutate(fn: (data: T) => void, delayMs = 600): void {
    fn(this.data)
    this.touch(delayMs)
  }

  replace(data: T): void {
    this.data = data
    this.touch(0)
  }

  touch(delayMs = 600): void {
    this.dirty = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.saving = this.saving.then(() => this.writeAsync()).catch((e) => console.error(e))
    }, delayMs)
  }

  private async writeAsync(): Promise<void> {
    if (!this.dirty) return
    this.dirty = false
    const tmp = this.file + '.tmp'
    await fsp.writeFile(tmp, JSON.stringify(this.data))
    await this.rotateBackup()
    await fsp.rename(tmp, this.file)
  }

  private async rotateBackup(): Promise<void> {
    try {
      const bak = this.file + '.bak'
      const age = existsSync(bak) ? Date.now() - statSync(bak).mtimeMs : Infinity
      if (existsSync(this.file) && age > 10 * 60 * 1000) await fsp.copyFile(this.file, bak)
    } catch {
      /* a failed backup copy must never block saving */
    }
  }

  /** Save right now, synchronously. Used when the app quits. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.dirty) return
    this.dirty = false
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.data))
    try {
      if (existsSync(this.file) && !existsSync(this.file + '.bak'))
        copyFileSync(this.file, this.file + '.bak')
    } catch {
      /* ignore */
    }
    renameSync(tmp, this.file)
  }
}
