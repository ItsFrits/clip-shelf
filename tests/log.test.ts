import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendLog } from '../src/main/log'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'clipshelf-log-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('appendLog', () => {
  it('creates the folder and appends lines', () => {
    const file = join(dir, 'logs', 'main.log')
    appendLog(file, 'one')
    appendLog(file, 'two')
    expect(readFileSync(file, 'utf8')).toBe('one\ntwo\n')
  })

  it('starts a new file when the old one is too big and keeps one old copy', () => {
    const file = join(dir, 'main.log')
    appendLog(file, 'a'.repeat(50), 100)
    appendLog(file, 'b'.repeat(50), 100)
    appendLog(file, 'c'.repeat(50), 100)
    expect(existsSync(join(dir, 'main.old.log'))).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('c'.repeat(50) + '\n')
    expect(readFileSync(join(dir, 'main.old.log'), 'utf8')).toContain('a'.repeat(50))
  })

  it('never throws, even for a path that cannot be written', () => {
    expect(() => appendLog(join(dir, 'x\0y', 'main.log'), 'hello')).not.toThrow()
  })
})
