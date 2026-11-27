// SPDX-License-Identifier: AGPL-3.0-or-later
// A new deploy reaches tabs that stay open (src/offline/update.ts). The service worker keeps serving
// the build it installed; these tests publish a "next build" and check who switches to it.
// The next build is a copy of dist/ served by its own preview server, whose sw.js is then changed,
// as a deploy would. The browser fetches sw.js itself, so page.route() cannot fake it.
import { expect, test, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { blockModel, fixture } from './helpers.ts'

test.use({ locale: 'es-ES', serviceWorkers: 'allow' })
test.describe.configure({ mode: 'serial' })

const PORT = 4174
const URL_ = `http://localhost:${String(PORT)}/`
let dir = ''
let server: ChildProcess | undefined

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dnilimpio-next-'))
  cpSync('dist', dir, { recursive: true })
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dir, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  await expect.poll(async () => await fetch(URL_).then((r) => r.ok, () => false), { timeout: 15_000 }).toBe(true)
})

test.afterEach(async () => {
  server?.kill()
  await expect.poll(async () => await fetch(URL_).then(() => true, () => false)).toBe(false)
  rmSync(dir, { recursive: true, force: true })
})

/** Waits until the worker controls the page. */
async function controlled (page: Page): Promise<void> {
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
}

/** Publishes a new build (a changed sw.js) and makes the browser look for it. */
async function deployNextBuild (page: Page): Promise<void> {
  appendFileSync(join(dir, 'sw.js'), '\n// next build\n')
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update() })
}

const marked = async (page: Page): Promise<string | undefined> => await page.evaluate(() => document.documentElement.dataset['oldPage'])

test('an open, idle tab switches to the new build by itself (no need to close the tab)', async ({ page }) => {
  await page.goto(URL_)
  await controlled(page)
  await page.evaluate(() => { document.documentElement.dataset['oldPage'] = '1' })
  const reloaded = page.waitForEvent('load')
  await deployNextBuild(page)
  await reloaded
  await expect(page.locator('h1')).toBeVisible()
  expect(await marked(page)).toBeUndefined()
  await expect.poll(async () => await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return reg?.waiting === null && navigator.serviceWorker.controller !== null
  })).toBe(true)
})

test('a tab with photos keeps its build; the new one waits', async ({ page }) => {
  await page.goto(URL_)
  await controlled(page)
  await blockModel(page)
  await page.locator('#start').click()
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await page.evaluate(() => { document.documentElement.dataset['oldPage'] = '1' })
  await deployNextBuild(page)
  await expect.poll(async () => await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null), { timeout: 15_000 }).toBe(true)
  expect(await marked(page)).toBe('1')
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
})

const waiting = async (page: Page): Promise<boolean> => await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null)

/** Opens a second window of the app, controlled by the current build. */
async function openOther (page: Page): Promise<Page> {
  const other = await page.context().newPage()
  await other.goto(URL_)
  await controlled(other)
  await other.evaluate(() => { document.documentElement.dataset['oldPage'] = '1' })
  return other
}

test('a second idle window does not hold the update back: both switch to the new build', async ({ page }) => {
  await page.goto(URL_)
  await controlled(page)
  const other = await openOther(page)
  await page.evaluate(() => { document.documentElement.dataset['oldPage'] = '1' })
  const reloaded = page.waitForEvent('load')
  const otherReloaded = other.waitForEvent('load')
  await deployNextBuild(page)
  await reloaded
  await otherReloaded
  expect(await marked(page)).toBeUndefined()
  expect(await marked(other)).toBeUndefined()
  await expect(page.locator('#update-ready')).toHaveCount(0)
})

test('a second window that is busy holds the update back, and the start screen offers "Update now"', async ({ page }) => {
  await page.goto(URL_)
  await controlled(page)
  const other = await openOther(page)
  await other.locator('#start').click()
  await expect(other.locator('#file-front')).toBeAttached()
  await page.evaluate(() => { document.documentElement.dataset['oldPage'] = '1' })
  await deployNextBuild(page)
  await expect(page.locator('#update-ready')).toBeVisible({ timeout: 15_000 })
  expect(await waiting(page)).toBe(true)
  expect(await marked(page)).toBe('1')
  expect(await marked(other)).toBe('1')
})

// The cause of "I have to clear the app's data to get the new version": any second window of the app
// held every update back, even an idle one (a tab left open, the installed app). Now idle windows
// answer and switch too. A window that cannot answer (frozen by the phone, or stuck) still holds the
// automatic switch back, so the person sees "Update now", and pressing it applies the update.
test('a window that cannot answer no longer blocks updates: "Update now" applies the new build', async ({ page }) => {
  await page.goto(URL_)
  await controlled(page)
  const other = await openOther(page)
  // Its page runs no code for 20 s, as if the phone had frozen it.
  void other.evaluate(() => { const end = Date.now() + 20_000; while (Date.now() < end) { /* frozen */ } }).catch(() => undefined)
  await page.evaluate(() => { document.documentElement.dataset['oldPage'] = '1' })
  await deployNextBuild(page)
  await expect(page.locator('#update-ready')).toBeVisible({ timeout: 15_000 })
  expect(await marked(page)).toBe('1')
  const reloaded = page.waitForEvent('load')
  await page.locator('#update-now').click()
  await reloaded
  expect(await marked(page)).toBeUndefined()
  expect(await waiting(page)).toBe(false)
  await expect(page.locator('#update-ready')).toHaveCount(0)
  // The stuck window was idle: once it runs again, it reloads into the new build too.
  await expect.poll(async () => await other.evaluate(() => document.documentElement.dataset['oldPage']).catch(() => '1'), { timeout: 30_000 }).toBeUndefined()
})

test('a busy window keeps its photos when another window applies the update', async ({ page }) => {
  await page.goto(URL_)
  await controlled(page)
  const other = await openOther(page)
  await blockModel(other)
  await other.locator('#start').click()
  await other.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(other.locator('#status-front')).toHaveText('Imagen cargada.')
  await deployNextBuild(page)
  await expect(page.locator('#update-ready')).toBeVisible({ timeout: 15_000 })
  const reloaded = page.waitForEvent('load')
  await page.locator('#update-now').click()
  await reloaded
  // The busy window still holds its photo and its old page.
  await expect.poll(async () => await other.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')).toContain('sw.js')
  await other.waitForTimeout(500)
  expect(await marked(other)).toBe('1')
  await expect(other.locator('#status-front')).toHaveText('Imagen cargada.')
})

test('a window back on the start screen after another window applied the update reloads into it', async ({ page }) => {
  await page.goto(URL_)
  await controlled(page)
  const other = await openOther(page)
  await other.locator('#start').click()
  await expect(other.locator('#file-front')).toBeAttached()
  await deployNextBuild(page)
  await expect(page.locator('#update-ready')).toBeVisible({ timeout: 15_000 })
  const reloaded = page.waitForEvent('load')
  await page.locator('#update-now').click()
  await reloaded
  await other.waitForTimeout(500)
  expect(await marked(other)).toBe('1')
  const otherReloaded = other.waitForEvent('load')
  await other.locator('#back').click()
  await otherReloaded
  expect(await marked(other)).toBeUndefined()
})

test('a page that leaves the start screen while the other windows answer keeps its photos', async ({ page }) => {
  await page.goto(URL_)
  await controlled(page)
  const other = await openOther(page)
  await blockModel(page)
  await page.locator('#start').click()
  await expect(page.locator('#file-front')).toBeAttached()
  await deployNextBuild(page)
  await expect.poll(async () => await waiting(page), { timeout: 15_000 }).toBe(true)
  await page.evaluate(() => { document.documentElement.dataset['oldPage'] = '1' })
  // The other window answers late (its page is busy for 1 s), while this page asks and moves on.
  void other.evaluate(() => { const end = Date.now() + 1000; while (Date.now() < end) { /* busy */ } }).catch(() => undefined)
  await page.locator('#back').click()
  await page.locator('#start').click()
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await page.waitForTimeout(3000)
  expect(await marked(page)).toBe('1')
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
})

test('once the busy window closes, the update is applied by itself when the tab comes back to the foreground', async ({ page }) => {
  await page.goto(URL_)
  await controlled(page)
  const other = await openOther(page)
  await other.locator('#start').click()
  await expect(other.locator('#file-front')).toBeAttached()
  await page.evaluate(() => { document.documentElement.dataset['oldPage'] = '1' })
  await deployNextBuild(page)
  await expect(page.locator('#update-ready')).toBeVisible({ timeout: 15_000 })
  await other.close()
  const reloaded = page.waitForEvent('load')
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')) })
  await reloaded
  expect(await marked(page)).toBeUndefined()
})
