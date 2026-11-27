// SPDX-License-Identifier: AGPL-3.0-or-later
// Language pages (ADR 0044): the HTML sent at a language's address is already in that language, for
// link previews and crawlers that run no JavaScript. Same scripts and CSP as index.html. The service
// worker answers the address with the same page, offline too.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { pageCsp } from '../../scripts/headers.ts'
import { LANGUAGE_SEGMENTS } from '../../src/offline/precache.ts'

const dict = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8')) as Record<string, string>
const es = dict('es')
const en = dict('en')
const ar = dict('ar')

const attr = (html: string, re: RegExp): string => re.exec(html)?.[1] ?? 'missing'

test('the HTML at /en is English: lang, title, description, preview, canonical, start screen', async ({ request }) => {
  const res = await request.get('./en')
  expect(res.status()).toBe(200)
  const html = await res.text()
  expect(html).toContain('<html lang="en" dir="ltr">')
  expect(attr(html, /<title>([^<]*)<\/title>/)).toBe(`${en['seoTitle'] ?? ''} · DNI Tapado.es`)
  expect(attr(html, /<meta name="description" content="([^"]*)"/)).toBe(en['seoDescription'])
  expect(attr(html, /<meta property="og:title" content="([^"]*)"/)).toBe(`${en['seoTitle'] ?? ''} · DNI Tapado.es`)
  expect(attr(html, /<meta property="og:locale" content="([^"]*)"/)).toBe('en_GB')
  expect(attr(html, /<link rel="canonical" href="([^"]*)"/)).toBe('https://dnitapado.es/en')
  const main = /<main id="app"[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1] ?? ''
  expect(main).toMatch(new RegExp(`<h1[^>]*>${en['homeTitle'] ?? 'missing'}</h1>`))
  expect(html).not.toContain(es['homeTitle'])
  expect(html).not.toContain(es['seoDescription'])
  // The same page CSP as the Spanish page: same scripts and import map.
  expect(res.headers()['content-security-policy']).toBe(pageCsp(await (await request.get('./')).text()))
})

test('every language address sends its own language, and Arabic right to left', async ({ request }) => {
  for (const seg of LANGUAGE_SEGMENTS) {
    const html = await (await request.get(`./${seg}`)).text()
    expect(html, seg).toMatch(new RegExp(`<html lang="${seg}" dir="(ltr|rtl)">`, 'i'))
    expect(attr(html, /<link rel="canonical" href="([^"]*)"/), seg).toBe(`https://dnitapado.es/${seg}`)
  }
  const html = await (await request.get('./ar')).text()
  expect(html).toContain('<html lang="ar" dir="rtl">')
  expect(html).toContain(ar['homeTitle'])
})

test('the Spanish page names its own canonical address in the HTML', async ({ request }) => {
  const html = await (await request.get('./')).text()
  expect(html).toContain('<html lang="es">')
  expect(attr(html, /<link rel="canonical" href="([^"]*)"/)).toBe('https://dnitapado.es/')
  expect(html).toContain(`<noscript>${es['noScript'] ?? 'missing'}</noscript>`)
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })
  test('the English address shows the English start screen', async ({ page }) => {
    await page.goto('./en')
    await expect(page.locator('h1')).toHaveText(en['homeTitle'] ?? '')
    await expect(page.locator('noscript')).toHaveCount(1)
  })
})

test('the app starts on the language page with no Spanish left, and switches language', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (m) => { if (/Content Security Policy|Trusted Type|integrity/i.test(m.text())) problems.push(m.text()) })
  page.on('pageerror', (e) => problems.push(e.message))
  await page.goto('./fr')
  await expect(page.locator('#start')).toHaveCount(1)
  await expect(page.locator('[data-prerendered]')).toHaveCount(0)
  await expect(page.locator('h1')).toHaveText(dict('fr')['homeTitle'] ?? '')
  await page.locator('#lang').selectOption('es')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('h1')).toHaveText(es['homeTitle'] ?? '')
  expect(problems).toEqual([])
})

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('serves the language page at its address, offline too', async ({ page, context }) => {
    await page.goto('/')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    await context.setOffline(true)
    const res = await page.goto('./en')
    expect(await res?.text()).toContain('<html lang="en" dir="ltr">')
    await expect(page.locator('h1')).toHaveText(en['homeTitle'] ?? '')
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
  })
})
