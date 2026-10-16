import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'
import { format } from 'util'

const MAX_BYTES = 512 * 1024

let logFile: string | null = null

/** Append a line to a log file. When the file gets big it becomes `<name>.old.log` and a new one starts. */
export function appendLog(file: string, line: string, maxBytes = MAX_BYTES): void {
  try {
    mkdirSync(join(file, '..'), { recursive: true })
    if (existsSync(file) && statSync(file).size > maxBytes) renameSync(file, file.replace(/\.log$/, '.old.log'))
    appendFileSync(file, line + '\n')
  } catch {
    // Logging must never crash the app.
  }
}

export function logLine(level: 'info' | 'warn' | 'error', message: string): void {
  if (!logFile) return
  appendLog(logFile, `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`)
}

/** Send warnings and errors from the main process to `<dir>/main.log`, so a bug report can include them. */
export function initLogging(dir: string, header: string): void {
  logFile = join(dir, 'main.log')
  logLine('info', header)
  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      logLine(level, format(...args))
    }
  }
  process.on('uncaughtExceptionMonitor', (err) => logLine('error', 'Uncaught exception: ' + (err.stack ?? err.message)))
  process.on('unhandledRejection', (reason) =>
    logLine('error', 'Unhandled rejection: ' + (reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)))
  )
}
