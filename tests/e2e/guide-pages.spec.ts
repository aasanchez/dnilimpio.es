// SPDX-License-Identifier: AGPL-3.0-or-later
// Card guide pages (ADR 0040): static, crawlable pages built from the guide data. Each one loads with
// its own strict CSP (no script at all), shows the guide in Spanish with its sources, links to the
// other pages and the app, requests nothing outside the site, and is served by the service worker,
// offline too.
import { expect, test, type Page } from '@playwright/test'
import { GUIDE_PAGE_CSP } from '../../scripts/headers.ts'
import { GUIDE_PAGES } from '../../src/offline/precache.ts'

/** Collects CSP reports, page errors and requests to any other host. */
function watch (page: Page): { problems: string[] } {
  const problems: string[] = []
  page.on('console', (m) => { if (/Content Security Policy|Trusted Type|integrity/i.test(m.text())) problems.push(m.text()) })
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('request', (r) => { if (new URL(r.url()).hostname !== 'localhost') problems.push(`outside: ${r.url()}`) })
  page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`))
  return { problems }
}

for (const file of GUIDE_PAGES) {
  test(`${file} loads with its own CSP, no script, styled, in Spanish, with its sources`, async ({ page }) => {
    const { problems } = watch(page)
    const res = await page.goto(`./${file}`)
    expect(res?.status()).toBe(200)
    expect(res?.headers()['content-type']).toMatch(/^text\/html/)
    expect(res?.headers()['content-security-policy']).toBe(GUIDE_PAGE_CSP)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.locator('h1')).toContainText(': qué es cada dato')
    await expect(page.locator('script')).toHaveCount(0)
    // The app's stylesheet applied: its paper background, not the browser's white.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    // Every citation points to a numbered source on the page.
    const sources = page.locator('.guide-sources > li')
    expect(await sources.count()).toBeGreaterThan(5)
    for (const a of await page.locator('.guide-cite a').all()) {
      const id = (await a.getAttribute('href'))?.slice(1) ?? ''
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(1)
    }
    for (const a of await page.locator('.guide-sources a').all()) expect(await a.getAttribute('href')).toMatch(/^https:\/\//)
    expect(problems).toEqual([])
  })
}

test('the pages link to each other and to the app', async ({ page }) => {
  await page.goto('./guia-dni-4.html')
  await expect(page.locator('nav a[aria-current="page"]')).toHaveText('DNI 4.0')
  await page.locator('nav a', { hasText: 'TIE' }).click()
  await expect(page).toHaveURL(/\/guia-tie\.html$/)
  await expect(page.locator('#nie')).toContainText('¿Qué es el NIE?')
  await page.locator('a.button').click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('#brand')).toBeVisible()
})

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('serves each page, not the app, and offline after one visit', async ({ page, context }) => {
    await page.goto('/')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    await context.setOffline(true)
    for (const file of GUIDE_PAGES) {
      const { problems } = watch(page)
      await page.goto(`./${file}`)
      await expect(page.locator('h1')).toContainText(': qué es cada dato')
      await expect(page.locator('script')).toHaveCount(0)
      expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
      expect(problems).toEqual([])
    }
  })
})

test('the sitemap lists each page, and each page names its own address as canonical', async ({ page, request }) => {
  const sitemap = await (await request.get('./sitemap.xml')).text()
  for (const file of GUIDE_PAGES) {
    expect(sitemap).toContain(`<loc>https://dnitapado.es/${file}</loc>`)
    await page.goto(`./${file}`)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://dnitapado.es/${file}`)
  }
})
