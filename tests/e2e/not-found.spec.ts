// SPDX-License-Identifier: AGPL-3.0-or-later
// Not-found pages (ADR 0045): an address the site does not have gets status 404 and a styled page with
// no script, in the language of its folder, at any depth the site has folders. The service worker
// answers the same, offline too. Known addresses keep their own page.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const dict = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8')) as Record<string, string>

/** Collects CSP reports, page errors and failed requests. */
function watch (page: Page): { problems: string[] } {
  const problems: string[] = []
  page.on('console', (m) => { if (/Content Security Policy|Trusted Type|integrity/i.test(m.text())) problems.push(m.text()) })
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`))
  page.on('response', (r) => { if (r.status() >= 400 && r.request().resourceType() !== 'document') problems.push(`${String(r.status())}: ${r.url()}`) })
  return { problems }
}

const CASES = [
  ['/nope', 'es'],
  ['/a/b/c', 'es'],
  ['/articles/nope', 'es'],
  ['/en/nope', 'en'],
  ['/en/articles/nope', 'en'],
  ['/en/articles/', 'en'],
  ['/ar/x', 'ar'],
] as const

for (const [path, lang] of CASES) {
  test(`${path} gets status 404 and the ${lang} not-found page, styled, with no script`, async ({ page }) => {
    const { problems } = watch(page)
    const res = await page.goto(path)
    expect(res?.status()).toBe(404)
    expect(res?.headers()['content-type']).toMatch(/^text\/html/)
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await expect(page.locator('h1')).toHaveText(dict(lang)['notFoundTitle'] ?? '')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('script')).toHaveCount(0)
    if (path !== '/a/b/c') {
      // The app's stylesheet applied: its paper background, not the browser's white.
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
      expect(problems).toEqual([])
    }
  })
}

test('the button goes to the start page in the same language', async ({ page }) => {
  await page.goto('/en/articles/nope')
  await page.locator('#not-found-home').click()
  await expect(page).toHaveURL(/\/en$/)
  await expect(page.locator('#start')).toBeVisible()
  await page.goto('/nope')
  await page.locator('#not-found-home').click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('h1')).toHaveText(dict('es')['homeTitle'] ?? '')
})

test('known addresses keep their own page and status', async ({ request }) => {
  for (const path of ['/', '/index.html', '/?lang=en', '/en', '/ca-es-valencia', '/thanks.html', '/guia-tie.html', '/robots.txt', '/sitemap.xml', '/articles/', '/404.html']) {
    expect((await request.get(path)).status(), path).toBe(200)
  }
  expect((await request.get('/en/', { maxRedirects: 0 })).status()).toBe(301)
})

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('answers an unknown address with the not-found page and status 404, offline too', async ({ page, context }) => {
    await page.goto('/')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    await context.setOffline(true)
    for (const [path, lang] of [['/nope', 'es'], ['/en/articles/nope', 'en']] as const) {
      const res = await page.goto(path)
      expect(res?.status()).toBe(404)
      await expect(page.locator('h1')).toHaveText(dict(lang)['notFoundTitle'] ?? '')
      await expect(page.locator('script')).toHaveCount(0)
      expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    }
    // The app's addresses still get the app.
    await page.goto('/?x=1')
    await expect(page.locator('#start')).toBeVisible()
  })
})
