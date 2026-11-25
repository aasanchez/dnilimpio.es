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

test('a second open tab of the app holds the update back', async ({ page, context }) => {
  await page.goto(URL_)
  await controlled(page)
  const other = await context.newPage()
  await other.goto(URL_)
  await controlled(other)
  await page.evaluate(() => { document.documentElement.dataset['oldPage'] = '1' })
  await deployNextBuild(page)
  await expect.poll(async () => await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null), { timeout: 15_000 }).toBe(true)
  expect(await marked(page)).toBe('1')
})
