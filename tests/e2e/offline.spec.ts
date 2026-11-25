// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline support (spec phase 2): after one visit the whole app, including the PDF code loaded on
// demand, works with the network off. Service workers are on here (blocked in the other specs).
import { expect, test, type Page } from '@playwright/test'
import { fixture, loadBoth, openCapture, toEditor } from './helpers.ts'

test.use({ locale: 'es-ES', serviceWorkers: 'allow' })

/** Waits until the worker controls the page and its cache holds the build. Returns the cache's entries. */
async function offlineReady (page: Page): Promise<string[]> {
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
  return await page.evaluate(async () => {
    const keys = (await caches.keys()).filter((k) => k.startsWith('dnilimpio-'))
    if (keys.length !== 1) return []
    const cache = await caches.open(keys[0] ?? '')
    return (await cache.keys()).map((r) => new URL(r.url).pathname)
  })
}

test('works offline after one visit, through to the PDF download', async ({ page, context }) => {
  const violations: string[] = []
  page.on('console', (m) => { if (/Content Security Policy|Trusted Type/i.test(m.text())) violations.push(m.text()) })
  page.on('pageerror', (e) => violations.push(e.message))
  await page.goto('/')
  const cached = await offlineReady(page)
  expect(cached).toContain('/index.html')
  expect(cached.some((p) => /^\/assets\/export-.*\.js$/.test(p))).toBe(true)
  expect(cached.some((p) => p.endsWith('.map') || p.endsWith('/sw.js'))).toBe(false)
  // The corner model is not downloaded at install: only when a photo first needs it.
  expect(cached.some((p) => p.startsWith('/assets/ml/'))).toBe(false)

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('h1')).toBeVisible()
  await toEditor(page)
  await page.locator('#review').click()
  await page.locator('#review-confirm').check()
  const download = page.waitForEvent('download')
  await page.locator('#download').click()
  expect((await download).suggestedFilename()).toBe('protected-document.pdf')
  expect(violations).toEqual([])
})

test('a tampered file stops the install and leaves no cache behind', async ({ page, context }) => {
  // context.route also sees the worker's own requests.
  let fromWorker = 0
  await context.route('**/assets/export-*.js', async (route) => {
    if (route.request().serviceWorker()) fromWorker++
    const res = await route.fetch()
    await route.fulfill({ response: res, body: (await res.text()) + '\n// tampered' })
  })
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
  await expect.poll(() => fromWorker).toBeGreaterThan(0) // the worker did try to install
  await expect.poll(async () => await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return reg?.active ?? reg?.installing ?? reg?.waiting ?? null
  }), { timeout: 10_000 }).toBeNull()
  expect(await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('dnilimpio-')))).toEqual([])
  // The browser may still be fetching the file (e.g. a retried install) when the test ends; that
  // request's route.fetch() would then fail after the context closes.
  await context.unrouteAll({ behavior: 'ignoreErrors' })
})

/** Paths of the app's cache entries. */
async function cachedPaths (page: Page): Promise<string[]> {
  return await page.evaluate(async () => {
    const out: string[] = []
    for (const k of (await caches.keys()).filter((n) => n.startsWith('dnilimpio-'))) {
      for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname)
    }
    return out
  })
}

test('offline before the model was ever used: classic edge detection places the corners, silently', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await offlineReady(page)
  await context.setOffline(true)
  await page.reload()
  await loadBoth(page)
  await page.locator('#capture-continue').click()
  await page.locator('#doc-continue').click()
  await expect(page.locator('[data-source]')).toHaveAttribute('data-source', 'edges', { timeout: 10_000 })
  await expect(page.locator('#align-continue')).toBeEnabled()
  expect(errors).toEqual([])
})

test('the model is kept after its first use and then works offline', async ({ page, context }) => {
  await page.goto('/')
  await offlineReady(page)
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  // Choosing a photo starts loading the model; the worker keeps its files.
  await expect.poll(async () => (await cachedPaths(page)).filter((p) => p.startsWith('/assets/ml/')).length, { timeout: 20_000 }).toBe(2)

  await context.setOffline(true)
  await page.reload()
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await page.locator('#capture-continue').click()
  await page.locator('#doc-continue').click()
  await expect(page.locator('#align-auto')).toHaveText(/Hemos colocado las esquinas/, { timeout: 30_000 })
  await expect(page.locator('[data-source]')).toHaveAttribute('data-source', 'model')
})

test('a tampered model file is refused and classic edge detection takes over', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await context.route('**/assets/ml/model-*.js', async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, body: (await res.text()) + '\n// tampered' })
  })
  await page.goto('/')
  await offlineReady(page)
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await page.locator('#capture-continue').click()
  await page.locator('#doc-continue').click()
  await expect(page.locator('[data-source]')).toHaveAttribute('data-source', 'edges', { timeout: 10_000 })
  expect((await cachedPaths(page)).some((p) => p.startsWith('/assets/ml/model-'))).toBe(false)
  expect(errors).toEqual([])
})
