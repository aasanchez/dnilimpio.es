// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline support (spec phase 2): after one visit the whole app, including the PDF code loaded on
// demand, works with the network off. Service workers are on here (blocked in the other specs).
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { adjustFront, fixture, frameApp, loadBoth, openCapture, toAuto } from './helpers.ts'
import { PAGE_HEADERS, SECURITY_HEADERS } from '../../src/offline/precache.ts'

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
  // The network is off, so the model cannot load anyway: no route that blocks it (in Firefox a
  // route takes requests away from the service worker).
  await toAuto(page, 'dni-4.0', { model: true })
  await page.locator('#review').click()
  await page.locator('#review-confirm').check()
  const download = page.waitForEvent('download')
  await page.locator('#download').click()
  expect((await download).suggestedFilename()).toBe('redacted-dni.pdf')
  expect(violations).toEqual([])
})

test('works offline with the front alone (the back is optional), through to a one-page PDF', async ({ page, context }) => {
  await page.goto('/')
  await offlineReady(page)
  await context.setOffline(true)
  await page.reload()
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#capture-skip-back').click()
  await page.locator('#doc-dni').check()
  await page.locator('#doc-continue').click()
  await expect(page.locator('#front-only')).toBeVisible()
  await page.locator('#review').click()
  await page.locator('#review-confirm').check()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  expect(readFileSync(await download.path()).toString('latin1')).toMatch(/\/Count 1\b/)
})

test('the card guide opens offline, in another language too', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await offlineReady(page)
  await context.setOffline(true)
  await page.reload()
  await page.locator('#guide-open').click()
  await expect(page.locator('#guide-title')).toHaveText('¿Qué hay en tu tarjeta?')
  await page.locator('#guide-close').click()
  await page.locator('#lang').selectOption('uk')
  await page.locator('#guide-open').click()
  await expect(page.locator('#guide-title')).not.toHaveText('¿Qué hay en tu tarjeta?')
  expect(errors).toEqual([])
})

test('the worker refuses every request that is not a file of this build (deny by default)', async ({ page, context }) => {
  // Only requests that reach the network show up here: the worker's own fetches included.
  const leaked: string[] = []
  await context.route(/leak|secret|evil/, async (route) => { leaked.push(route.request().url()); await route.fulfill({ status: 200, body: '' }) })
  await page.goto('/')
  await offlineReady(page)
  // Same-origin requests the CSP allows (img-src 'self', script-src 'self'), with data in the path
  // or the query string: what a compromised dependency could try.
  const results = await page.evaluate(async () => {
    const load = async (url: string): Promise<string> => await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => { resolve('loaded') }
      img.onerror = () => { resolve('blocked') }
      img.src = url
    })
    return [
      await load('leak.png?dni=12345678Z'),
      await load('assets/secret-12345678Z.png'),
      await load('../evil.png'),
      await load(`${document.querySelector<HTMLScriptElement>('script[type=module][src]')?.src ?? ''}?dni=12345678Z`),
    ]
  })
  expect(results).toEqual(['blocked', 'blocked', 'blocked', 'blocked'])
  expect(leaked).toEqual([])
  // The app itself still works: page loads with a query string get index.html.
  await page.goto('/?utm=1')
  await expect(page.locator('h1')).toBeVisible()
})

test('no source map is published, and the worker refuses any .map (ADR 0022)', async ({ page, context }) => {
  const leaked: string[] = []
  await context.route(/\.map(\?|$)|leak/, async (route) => { leaked.push(route.request().url()); await route.fulfill({ status: 200, body: '' }) })
  await page.goto('/')
  const cached = await offlineReady(page)
  expect(cached.some((p) => p.endsWith('.map'))).toBe(false)
  // A script asking for a map the way the developer tools would: refused before the network.
  const main = await page.locator('script[type=module][src]').first().evaluate((s) => (s as HTMLScriptElement).src)
  const results = await page.evaluate(async (src) => {
    const load = async (url: string): Promise<string> => await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => { resolve('loaded') }
      img.onerror = () => { resolve('blocked') }
      img.src = url
    })
    return [await load(`${src}.map`), await load('ocr/worker.min.js.map'), await load(`${src}.map?dni=12345678Z`)]
  }, main)
  expect(results).toEqual(['blocked', 'blocked', 'blocked'])
  expect(leaked).toEqual([])
})

test('page loads from the worker carry the security headers, whatever the cached entry held', async ({ page, context, baseURL }) => {
  const first = await page.goto('/')
  await offlineReady(page)
  const host = first?.headers() ?? {}
  const res = await page.reload()
  expect(res?.fromServiceWorker()).toBe(true)
  const h = res?.headers() ?? {}
  // The worker keeps no header of a cached entry (ADR 0026) and sets PAGE_HEADERS itself (ADR 0027).
  for (const [k, v] of Object.entries(PAGE_HEADERS)) expect([k, h[k.toLowerCase()]]).toEqual([k, v])
  // A returning visitor gets the same security headers as a first visit from the host. The full CSP
  // is the page's <meta> policy, which equals the host's header apart from frame-ancestors.
  for (const k of Object.keys(SECURITY_HEADERS)) expect([k, h[k.toLowerCase()]]).toEqual([k, host[k.toLowerCase()]])
  const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(host['content-security-policy']).toBe(`${meta ?? ''}; frame-ancestors 'none'`)
  // Another site that frames the app: the host's frame-ancestors refuses it, so nothing of the app runs.
  const framer = await context.newPage()
  await frameApp(framer, baseURL ?? '')
  await expect(framer.frameLocator('iframe').locator('h1')).toHaveCount(0)
  // Not even the page's own frame guard (#app with a link to itself): the host refused the page.
  await expect(framer.frameLocator('iframe').locator('#app')).toHaveCount(0)
})

test('a tampered file stops the install and leaves no cache behind', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', "Playwright routes and reports a service worker's own requests only in Chromium: the tampered file must reach the worker.")
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
  // No route that blocks the model: the network is off (in Firefox a route takes requests away from
  // the service worker).
  await loadBoth(page, { model: true })
  await page.locator('#capture-continue').click()
  await page.locator('#doc-dni').check()
  await page.locator('#doc-continue').click()
  await adjustFront(page)
  await expect(page.locator('[data-source]')).toHaveAttribute('data-source', 'edges')
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
  await page.locator('#doc-dni').check()
  await page.locator('#doc-continue').click()
  await adjustFront(page)
  await expect(page.locator('#align-auto')).toHaveText(/Hemos colocado las esquinas/)
  await expect(page.locator('[data-source]')).toHaveAttribute('data-source', 'model')
})

test('a tampered model file is refused and classic edge detection takes over', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', "Playwright routes and reports a service worker's own requests only in Chromium: the tampered model must reach the worker.")
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
  await page.locator('#doc-dni').check()
  await page.locator('#doc-continue').click()
  await adjustFront(page)
  await expect(page.locator('[data-source]')).toHaveAttribute('data-source', 'edges')
  expect((await cachedPaths(page)).some((p) => p.startsWith('/assets/ml/model-'))).toBe(false)
  expect(errors).toEqual([])
})

/**
 * Writes a forged entry into the app's cache, as any same-origin script could. The body is a marker
 * that shows whether it ever ran: a page with #poisoned, or a worker that posts on a BroadcastChannel.
 */
async function poison (page: Page, path: string, body: string, type: string): Promise<void> {
  await page.evaluate(async ({ path, body, type }) => {
    const key = (await caches.keys()).find((k) => k.startsWith('dnilimpio-')) ?? ''
    await (await caches.open(key)).put(new URL(path, document.baseURI).href, new Response(body, { headers: { 'Content-Type': type } }))
  }, { path, body, type })
}

/** The text of one cache entry of the app ('' when it is missing). */
async function cachedText (page: Page, path: string): Promise<string> {
  return await page.evaluate(async (path) => {
    const res = await caches.match(new URL(path, document.baseURI).href)
    return res ? await res.text() : ''
  }, path)
}

const POISONED_PAGE = '<!doctype html><title>poisoned</title><p id="poisoned">poisoned</p>'
const POISONED_WORKER = "new BroadcastChannel('poisoned').postMessage('ran')"

/** Starts the OCR worker the way the app does, and reports whether the forged one ran. */
async function startWorker (page: Page): Promise<{ ran: boolean; failed: boolean }> {
  return await page.evaluate(async () => await new Promise((resolve) => {
    const channel = new BroadcastChannel('poisoned')
    const state = { ran: false, failed: false }
    channel.onmessage = () => { state.ran = true }
    const w = new Worker(new URL('ocr/worker.min.js', document.baseURI).href)
    w.onerror = () => { state.failed = true }
    setTimeout(() => { w.terminate(); channel.close(); resolve(state) }, 3000)
  }))
}

test('a rewritten cached index.html is never served: the worker refetches the real one', async ({ page }) => {
  await page.goto('/')
  await offlineReady(page)
  const real = await cachedText(page, 'index.html')
  await poison(page, 'index.html', POISONED_PAGE, 'text/html')
  await page.reload()
  await expect(page.locator('#guide-open')).toBeVisible()
  await expect(page.locator('#poisoned')).toHaveCount(0)
  // The forged entry is gone and the cache holds the build's bytes again.
  expect(await cachedText(page, 'index.html')).toBe(real)
})

test('offline, a rewritten cached index.html is refused, never shown', async ({ page, context, browserName }) => {
  await page.goto('/')
  await offlineReady(page)
  await poison(page, 'index.html', POISONED_PAGE, 'text/html')
  await context.setOffline(true)
  // No verified copy and no network: a network error instead of the forged page.
  const failed = await page.reload().then(() => false, () => true)
  // The forged page never shows, in any browser.
  await expect(page.locator('#poisoned')).toHaveCount(0)
  if (browserName === 'firefox') {
    // Playwright's offline mode in Firefox does not cut the service worker's own requests (seen in
    // CI): the worker fetches the real page instead of failing. Still safe; only the network error differs.
    test.info().annotations.push({ type: 'browser difference', description: 'Firefox: the service worker still reaches the network in Playwright offline mode' })
  } else {
    expect(failed).toBe(true)
  }
  await context.setOffline(false)
  await page.goto('/')
  await expect(page.locator('#guide-open')).toBeVisible()
  expect(await cachedText(page, 'index.html')).not.toContain('poisoned')
})

test('a rewritten cached OCR worker never runs: online it is replaced, offline it is refused', async ({ page, context, browserName }) => {
  await page.goto('/')
  await offlineReady(page)
  await poison(page, 'ocr/worker.min.js', POISONED_WORKER, 'text/javascript')
  expect(await startWorker(page)).toEqual({ ran: false, failed: false })
  // The real worker, downloaded again with its integrity, replaced the forged entry.
  expect(await cachedText(page, 'ocr/worker.min.js')).not.toContain('poisoned')

  await poison(page, 'ocr/worker.min.js', POISONED_WORKER, 'text/javascript')
  await context.setOffline(true)
  const offline = await startWorker(page)
  // The forged worker never runs, in any browser.
  expect(offline.ran).toBe(false)
  if (browserName === 'firefox') {
    // As above: in Firefox the worker still reaches the network, so it loads the real file.
    test.info().annotations.push({ type: 'browser difference', description: 'Firefox: the service worker still reaches the network in Playwright offline mode' })
    expect(await cachedText(page, 'ocr/worker.min.js')).not.toContain('poisoned')
  } else {
    expect(offline.failed).toBe(true)
    expect(await cachedText(page, 'ocr/worker.min.js')).toBe('')
  }
})
