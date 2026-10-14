import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UserDataStore } from '../src/main/userData'

let dir: string
let user: UserDataStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'clipshelf-tags-'))
  user = new UserDataStore(join(dir, 'userdata.json'))
})

afterEach(() => {
  user.flush()
  rmSync(dir, { recursive: true, force: true })
})

describe('UserDataStore tag suggestions', () => {
  it('stores suggestions and drops unknown ids and the tag itself', () => {
    const air = user.createTag('Air dribble')
    const g2a = user.createTag('Ground to air')
    user.updateTag(air.id, { suggests: [g2a.id, g2a.id, air.id, 'nope'] })
    expect(user.data.tags.find((t) => t.id === air.id)?.suggests).toEqual([g2a.id])
  })

  it('removes the field when the list is emptied', () => {
    const air = user.createTag('Air dribble')
    const g2a = user.createTag('Ground to air')
    user.updateTag(air.id, { suggests: [g2a.id] })
    user.updateTag(air.id, { suggests: [] })
    expect('suggests' in user.data.tags.find((t) => t.id === air.id)!).toBe(false)
  })

  it('renames through updateTag', () => {
    const air = user.createTag('Air dribble')
    user.updateTag(air.id, { name: '  Air  ' })
    expect(user.data.tags[0].name).toBe('Air')
  })

  it('cleans suggestions when a tag is deleted or merged', () => {
    const air = user.createTag('Air dribble')
    const a = user.createTag('Ground to air')
    const b = user.createTag('G2A')
    const wall = user.createTag('Sidewall')
    user.updateTag(air.id, { suggests: [a.id, wall.id] })
    user.mergeTags([a.id], b.id)
    expect(user.data.tags.find((t) => t.id === air.id)?.suggests).toEqual([b.id, wall.id])
    user.deleteTag(wall.id)
    expect(user.data.tags.find((t) => t.id === air.id)?.suggests).toEqual([b.id])
    user.deleteTag(b.id)
    expect('suggests' in user.data.tags.find((t) => t.id === air.id)!).toBe(false)
  })
})
