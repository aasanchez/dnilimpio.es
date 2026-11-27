// SPDX-License-Identifier: AGPL-3.0-or-later
// Articles (ADR 0039): static pages built from the Markdown in content/articles/. Each one is served
// as HTML at its clean address, with the strict article CSP on top of the page CSP and no script at
// all; each language lists only its own articles; the app links to the list; the sitemap names every
// article; the service worker serves them after one visit, offline too.
import { readdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { ARTICLE_CSP } from '../../scripts/csp.ts'
import { ARTICLE_CONTENT_TYPE } from '../../scripts/headers.ts'

/** Every published Spanish article of this build (the build reads the same folder). */
const SPANISH = readdirSync('dist/articles').filter((f) => f !== 'index.html')

/** Collects CSP reports, page errors and requests to any other host. */
function watch (page: Page): { problems: string[] } {
  const problems: string[] = []
  page.on('console', (m) => { if (/Content Security Policy|Trusted Type|integrity/i.test(m.text())) problems.push(m.text()) })
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('request', (r) => { if (new URL(r.url()).hostname !== 'localhost') problems.push(`outside: ${r.url()}`) })
  page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`))
  return { problems }
}

test('the build has at least one Spanish article to check', () => {
  expect(SPANISH.length).toBeGreaterThan(0)
})

test('an article loads as HTML at its clean address, with the strict CSP and no script', async ({ page }) => {
  const { problems } = watch(page)
  const slug = SPANISH[0] ?? ''
  const res = await page.goto(`./articles/${slug}`)
  expect(res?.status()).toBe(200)
  expect(res?.headers()['content-type']).toBe(ARTICLE_CONTENT_TYPE)
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', ARTICLE_CSP)
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.locator('script')).toHaveCount(0)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://dnitapado.es/articles/${slug}`)
  // The app's stylesheet applied: its paper background, not the browser's white.
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  // An inline script added to the page does not run: the CSP has no script-src at all.
  expect(await page.evaluate(() => {
    const s = document.createElement('script')
    s.textContent = 'document.body.dataset.ran = "yes"'
    document.body.append(s)
    return document.body.dataset['ran'] ?? 'no'
  }).catch(() => 'no')).toBe('no')
  expect(problems.filter((p) => !/Content Security Policy/.test(p) || !/inline/i.test(p))).toEqual([])
})

test('the list shows only Spanish articles, links to each, and back to the app', async ({ page }) => {
  const { problems } = watch(page)
  const res = await page.goto('./articles')
  await expect(page).toHaveURL(/\/articles\/$/)
  expect(res?.headers()['content-type']).toMatch(/^text\/html/)
  await expect(page.locator('h1')).toHaveText('Artículos')
  await expect(page.locator('main li h3 a')).toHaveCount(SPANISH.length)
  await page.locator('main li h3 a').first().click()
  await expect(page).toHaveURL(/\/articles\/[a-z0-9-]+$/)
  await page.locator('a', { hasText: 'Todos los artículos' }).click()
  await expect(page).toHaveURL(/\/articles\/$/)
  await page.locator('a.button').click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('#brand')).toBeVisible()
  expect(problems).toEqual([])
})

test('a language with no articles has no list and no link in the app', async ({ page }) => {
  // The only articles of this build are Spanish.
  await page.goto('./en')
  await expect(page.locator('#start')).toBeVisible()
  await expect(page.locator('#articles-link')).toHaveCount(0)
  await page.goto('./')
  await expect(page.locator('#articles-link')).toHaveAttribute('href', './articles/')
  await expect(page.locator('#articles-link')).toHaveAttribute('target', '_blank')
})

test('the prerendered start screen links to the articles, for crawlers', async ({ request }) => {
  const html = await (await request.get('./')).text()
  expect(html).toContain('id="articles-link" href="./articles/"')
})

test('the sitemap names the list and every article', async ({ request }) => {
  const sitemap = await (await request.get('./sitemap.xml')).text()
  expect(sitemap).toContain('<loc>https://dnitapado.es/articles/</loc>')
  for (const slug of SPANISH) expect(sitemap).toContain(`<loc>https://dnitapado.es/articles/${slug}</loc>`)
})

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('serves an article and the list after one visit, offline too, never the app', async ({ page, context }) => {
    await page.goto('/')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    const slug = SPANISH[0] ?? ''
    // First visits, online: the worker downloads each page, checks its hash and saves it.
    for (const path of [`./articles/${slug}`, './articles/']) {
      await page.goto(path)
      await expect(page.locator('script')).toHaveCount(0)
    }
    await context.setOffline(true)
    for (const [path, heading] of [[`./articles/${slug}`, null], ['./articles/', 'Artículos'], ['./articles', 'Artículos']] as const) {
      const { problems } = watch(page)
      await page.goto(path)
      await expect(page.locator('h1')).toHaveCount(1)
      if (heading !== null) await expect(page.locator('h1')).toHaveText(heading)
      await expect(page.locator('script')).toHaveCount(0)
      await expect(page.locator('#start')).toHaveCount(0)
      expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
      expect(problems).toEqual([])
    }
  })
})
