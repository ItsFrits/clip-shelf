import { expect, test, type Locator } from '@playwright/test'
import { rmSync } from 'fs'
import { TestApp } from './app'
import { type Fixture, type FixtureClip, makeFixture, TRACK_NAMES } from './library'

// One story: every step builds on the ones before it, so a failure skips the rest.
test.describe.configure({ mode: 'serial' })

const PROJECT = 'Smoke video'
const TAG = 'Aerial'

let fixture: Fixture
let app: TestApp
let failed = false

const card = (clip: FixtureClip): Locator => app.page.locator('.card', { hasText: clip.name })
const button = (name: string): Locator => app.page.getByRole('button', { name, exact: true })

/** The names of the clips in the order of the open project, first to last. */
async function orderNames(): Promise<(string | undefined)[]> {
  const keys = await app.page
    .locator('.ord-row')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-key')))
  // Names instead of keys, so a failure is readable.
  return keys.map((key) => fixture.clips.find((c) => c.key === key)?.name)
}

/** The keys of the two clips on the rank screen, left first. Empty when there is no question. */
const rankPair = (): Promise<(string | null)[]> =>
  app.page.locator('.rank-side').evaluateAll((all) => all.map((s) => s.getAttribute('data-key')))

async function openProjectOrder(): Promise<void> {
  await button('Projects').click()
  await app.page.getByRole('heading', { name: PROJECT }).click()
  await app.page.getByRole('tab', { name: /^Order/ }).click()
}

test.beforeAll(async () => {
  fixture = makeFixture()
  app = await TestApp.launch(fixture.dataDir)
})

// Playwright wants the first argument to be a destructuring pattern, also when it is not used.
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
  const errors = app.errors()
  if (testInfo.status !== testInfo.expectedStatus || errors.length > 0) {
    failed = true
    await app.saveEvidence(testInfo)
  }
  expect(errors, 'errors in the window or in the log').toEqual([])
})

test.afterAll(async () => {
  await app?.close()
  // Without an app the start itself failed.
  if (failed || !app) console.log(`The temporary folder is kept: ${fixture.root}`)
  // Windows can hold on to files for a moment after the app has closed.
  else rmSync(fixture.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
})

test('start: the library shows the clips with thumbnails', async () => {
  await expect(app.page.locator('.card')).toHaveCount(fixture.clips.length)
  const thumbs = app.page.locator('.card .thumb img')
  await expect(thumbs).toHaveCount(fixture.clips.length)
  await expect
    .poll(() =>
      thumbs.evaluateAll((all) => all.every((img) => (img as HTMLImageElement).naturalWidth > 0))
    )
    .toBe(true)
})

test('player: the video loads and shows both audio tracks', async () => {
  await card(fixture.clips[2]).locator('.thumb').click()
  const video = app.page.locator('video')
  await expect
    .poll(() =>
      video.evaluate(
        (v: HTMLVideoElement) => v.readyState >= 2 && v.videoWidth > 0 && v.duration > 0
      )
    )
    .toBe(true)
  for (const track of TRACK_NAMES) await expect(button(`Mute ${track}`)).toBeVisible()
  await button('Library').click()
  await expect(app.page.locator('.card')).toHaveCount(fixture.clips.length)
})

test('tag and rate: the card shows the tag and the rating', async () => {
  const clip = fixture.clips[0]
  await card(clip).locator('.thumb').click()
  const tagInput = app.page.getByPlaceholder(/^Add a tag/)
  await expect(tagInput).toBeVisible()
  // The player is ready for its hotkeys once the audio is there.
  await expect(button(`Mute ${TRACK_NAMES[0]}`)).toBeVisible()

  await app.page.keyboard.press('t')
  await expect(tagInput).toBeFocused()
  await app.page.keyboard.type(TAG)
  await app.page.keyboard.press('Enter')
  await expect(button(`Remove tag ${TAG}`)).toBeVisible()

  // Leave the text field, or the 3 is typed into it.
  await tagInput.blur()
  await app.page.keyboard.press('3')
  await expect(app.page.getByRole('radio', { name: '3 stars' })).toBeChecked()

  await button('Library').click()
  await expect(card(clip)).toContainText(TAG)
  await expect(card(clip).locator('.rating-mini')).toHaveText('3')
})

test('project: three selected clips go into a new project', async () => {
  await button('Projects').click()
  await app.page.getByRole('textbox', { name: 'Name of a new project' }).fill(PROJECT)
  await button('New project').click()
  await expect(app.page.getByRole('heading', { name: PROJECT })).toBeVisible()

  await button('Home').click()
  for (const clip of fixture.clips.slice(0, 3)) {
    await card(clip).hover()
    await card(clip).getByRole('button', { name: 'Select clip' }).click()
  }
  await button('Add to project').click()
  await app.page.locator('.proj-pick-row', { hasText: PROJECT }).click()
  await expect(app.page.getByText(`Added 3 clips to “${PROJECT}”.`)).toBeVisible()
})

test('order: clips get a place and one moves up', async () => {
  const [a, b, c] = fixture.clips
  await openProjectOrder()

  const select = async (clip: FixtureClip): Promise<void> => {
    const todo = app.page.locator(`.ord-card[data-key="${clip.key}"]`)
    await todo.hover()
    await todo.getByRole('button', { name: 'Select clip' }).click()
  }
  for (const clip of [a, b]) {
    await select(clip)
    await button('Place at end').click()
  }
  await select(c)
  await app.page.getByRole('textbox', { name: 'Place at this number' }).fill('1')
  // The toast of the previous step can lie over this button, the click waits until it is gone.
  await button('Place at #').click()
  await expect.poll(orderNames).toEqual([c.name, a.name, b.name])

  await app.page
    .locator(`.ord-row[data-key="${b.key}"]`)
    .getByRole('button', { name: 'Move up' })
    .click()
  await expect.poll(orderNames).toEqual([c.name, b.name, a.name])
  await expect(app.page.getByRole('tab', { name: 'Order (3/3)' })).toBeVisible()
})

test('rank: comparing two clips gives them their place back', async () => {
  const [a, b, c] = fixture.clips
  // The order is c, b, a. Take two out and let rank mode put them back, by answering as if c is the
  // best clip and a the worst.
  const best = [c.key, b.key, a.key]
  for (const clip of [a, b]) {
    await app.page
      .locator(`.ord-row[data-key="${clip.key}"]`)
      .getByRole('button', { name: 'Take out of the order' })
      .click()
  }
  await expect.poll(orderNames).toEqual([c.name])

  await button('Rank').click()
  const rank = app.page.getByRole('dialog', { name: 'Rank mode' })
  await expect(rank).toBeVisible()
  // Both videos load, and neither plays by itself.
  const videos = rank.locator('video')
  const state = (): Promise<{ loaded: boolean; paused: boolean; muted: boolean }[]> =>
    videos.evaluateAll((all) =>
      (all as HTMLVideoElement[]).map((v) => ({
        loaded: v.readyState >= 2,
        paused: v.paused,
        muted: v.muted
      }))
    )
  const idle = { loaded: true, paused: true, muted: false }
  await expect.poll(state).toEqual([idle, idle])

  // Each one is started on its own, so both can play at once.
  const leftSide = rank.getByRole('region', { name: 'Left clip' })
  const rightSide = rank.getByRole('region', { name: 'Right clip' })
  const playing = { ...idle, paused: false }
  await leftSide.getByRole('button', { name: 'Play clip' }).click()
  await expect.poll(state).toEqual([playing, idle])
  await rightSide.getByRole('button', { name: 'Play clip' }).click()
  await expect.poll(state).toEqual([playing, playing])
  await leftSide.getByRole('button', { name: 'Pause clip' }).click()
  await expect.poll(state).toEqual([idle, playing])

  // A click on the progress bar jumps to that moment.
  await leftSide.locator('.seek').click()
  const time = (): Promise<number> =>
    leftSide.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime / v.duration)
  await expect.poll(time).toBeCloseTo(0.5, 1)

  // The same with only the keyboard: the left video was paused, the right one still plays.
  await app.page.keyboard.press('q')
  await expect.poll(time).toBe(0)
  await app.page.keyboard.press('w')
  await expect.poll(state).toEqual([playing, playing])
  await app.page.keyboard.press('s')
  await expect.poll(state).toEqual([playing, idle])
  await app.page.keyboard.press('w')
  await expect.poll(state).toEqual([idle, idle])
  // Tab never leaves rank mode.
  for (let i = 0; i < 12; i++) {
    await app.page.keyboard.press('Tab')
    expect(await rank.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }

  // Skip a clip, then take that back.
  const first = await rankPair()
  await app.page.keyboard.press('ArrowUp')
  await expect.poll(rankPair).not.toEqual(first)
  await app.page.keyboard.press('Control+z')
  await expect.poll(rankPair).toEqual(first)

  // Two clips never need more than a few questions.
  for (let asked = 0; asked < 6; asked++) {
    const pair = await rankPair()
    if (pair.length === 0) break
    const [left, right] = pair.map((key) => best.indexOf(key!))
    await app.page.keyboard.press(left < right ? 'ArrowLeft' : 'ArrowRight')
    await expect.poll(rankPair).not.toEqual(pair)
  }
  await expect(rank.getByRole('heading', { name: '2 clips got a place' })).toBeVisible()

  await app.page.keyboard.press('Escape')
  await expect(rank).toBeHidden()
  await expect.poll(orderNames).toEqual([c.name, b.name, a.name])
  await expect(app.page.getByRole('tab', { name: 'Order (3/3)' })).toBeVisible()
})

test('restart: tag, rating, project and order are still there', async () => {
  const [a, b, c] = fixture.clips
  // One more change and close right away: the app saves a moment after a change, so this one is
  // usually still waiting and has to be written while quitting.
  await app.page
    .locator(`.ord-row[data-key="${c.key}"]`)
    .getByRole('button', { name: 'Move down' })
    .click()
  await expect.poll(orderNames).toEqual([b.name, c.name, a.name])
  await app.close()
  app = await TestApp.launch(fixture.dataDir)

  await expect(card(a)).toContainText(TAG)
  await expect(card(a).locator('.rating-mini')).toHaveText('3')
  await openProjectOrder()
  await expect.poll(orderNames).toEqual([b.name, c.name, a.name])
})
