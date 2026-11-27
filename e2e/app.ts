import { _electron, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'
import { existsSync, readFileSync, realpathSync } from 'fs'
import { join, resolve } from 'path'

const PROJECT_DIR = resolve(__dirname, '..')

/** One run of the built app, on a user data folder of its own. */
export class TestApp {
  /** Errors from the window since it was opened. */
  private windowErrors: string[] = []

  private constructor(
    private app: ElectronApplication,
    readonly page: Page,
    private dataDir: string
  ) {
    page.on('pageerror', (e) => this.windowErrors.push(e.stack ?? e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') this.windowErrors.push(m.text())
    })
  }

  static async launch(dataDir: string): Promise<TestApp> {
    const env = { ...process.env } as Record<string, string>
    // Load the built window instead of a dev server, and start as an app, not as plain Node.
    delete env.ELECTRON_RENDERER_URL
    delete env.ELECTRON_RUN_AS_NODE
    const app = await _electron.launch({
      args: ['.', `--user-data-dir=${dataDir}`],
      cwd: PROJECT_DIR,
      env
    })

    // Never go on when the app is not on the temporary folder: it would be working on real data.
    const used = await app.evaluate(({ app }) => app.getPath('userData'))
    if (realpathSync.native(used) !== realpathSync.native(dataDir)) {
      await app.close()
      throw new Error(`The app uses ${used} instead of the temporary folder ${dataDir}. Stopped.`)
    }

    await app.context().tracing.start({ screenshots: true, snapshots: true })
    const page = await app.firstWindow()
    return new TestApp(app, page, dataDir)
  }

  /** Everything that went wrong: errors in the window, and errors the app wrote to its log. */
  errors(): string[] {
    const log = join(this.dataDir, 'logs', 'main.log')
    const logged = existsSync(log)
      ? readFileSync(log, 'utf8')
          .split('\n')
          .filter((line) => / ERROR /.test(line))
      : []
    return [...this.windowErrors, ...logged]
  }

  /** Keep a screenshot and a trace of a failed step. */
  async saveEvidence(testInfo: TestInfo): Promise<void> {
    const shot = testInfo.outputPath('failure.png')
    const trace = testInfo.outputPath('trace.zip')
    // The window may be gone, which must not hide the real failure.
    await this.page.screenshot({ path: shot }).catch(() => undefined)
    await this.app
      .context()
      .tracing.stop({ path: trace })
      .catch(() => undefined)
    console.log(`Screenshot: ${shot}\nTrace: npx playwright show-trace "${trace}"`)
  }

  async close(): Promise<void> {
    await this.app.close()
  }
}
