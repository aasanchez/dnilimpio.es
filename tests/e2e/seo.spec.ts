// SPDX-License-Identifier: AGPL-3.0-or-later
// Search and link-preview metadata (src/seo/): the HTML the host sends already holds the Spanish
// title, description and Open Graph tags; the page keeps them in its own language; robots.txt and
// sitemap.xml are real files, not the app; and none of it adds a request to another site.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const dict = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8')) as Record<string, string>
const es = dict('es')
const en = dict('en')

test('the served HTML holds the Spanish title, description and preview tags', async ({ request }) => {
  const html = await (await request.get('./')).text()
  expect(html).toContain(`<title>${es['seoTitle'] ?? ''} · DNI Tapado.es</title>`)
  expect(html).toContain(`<meta name="description" content="${es['seoDescription'] ?? ''}" />`)
  expect(html).toContain('<meta property="og:image" content="https://dnitapado.es/icons/og-image.png" />')
  expect(html).toContain('<meta property="og:locale" content="es_ES" />')
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
  // The preview image exists and is a PNG.
  const img = await request.get('./icons/og-image.png')
  expect(img.status()).toBe(200)
  expect(img.headers()['content-type']).toBe('image/png')
})

test('robots.txt and sitemap.xml are real files with the site address', async ({ request }) => {
  const robots = await request.get('./robots.txt')
  expect(robots.status()).toBe(200)
  expect(await robots.text()).toBe('User-agent: *\nAllow: /\n\nSitemap: https://dnitapado.es/sitemap.xml\n')
  const sitemap = await request.get('./sitemap.xml')
  expect(sitemap.status()).toBe(200)
  const xml = await sitemap.text()
  expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset /)
  expect(xml).toContain('<loc>https://dnitapado.es/</loc>')
  // One address per language, each with its alternates (ADR 0038).
  expect(xml).toContain('<loc>https://dnitapado.es/en</loc>')
  expect(xml).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://dnitapado.es/"/>')
})

test('the server sends the hreflang links in the HTML itself', async ({ request }) => {
  const html = await (await request.get('./fr')).text()
  expect(html).toContain('<link rel="alternate" hreflang="fr" href="https://dnitapado.es/fr" />')
  expect(html).toContain('<link rel="alternate" hreflang="es" href="https://dnitapado.es/" />')
})

test('each language address is its own canonical page', async ({ page }) => {
  await page.goto('/en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://dnitapado.es/en')
  await page.locator('#lang').selectOption('es')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://dnitapado.es/')
})

test.describe('Spanish browser', () => {
  test.use({ locale: 'es-ES' })

  test('the page has one canonical address and keeps the Spanish head', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(`${es['seoTitle'] ?? ''} · DNI Tapado.es`)
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://dnitapado.es/')
  })

  test('a language change updates the title, description and preview text', async ({ page }) => {
    await page.goto('/')
    await page.locator('#lang').selectOption('en')
    await expect(page).toHaveTitle(`${en['seoTitle'] ?? ''} · DNI Tapado.es`)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', en['seoDescription'] ?? '')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', `${en['seoTitle'] ?? ''} · DNI Tapado.es`)
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_GB')
    await expect(page.locator('meta[name="description"]')).toHaveCount(1)
  })
})

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('a controlled page still reaches robots.txt, sitemap.xml and the preview image', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.reload()
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    for (const file of ['robots.txt', 'sitemap.xml', 'icons/og-image.png']) {
      const res = await page.context().request.get(file) // baseline: the host serves it
      expect(res.status()).toBe(200)
      // From the page: answered through the worker's route(), not refused.
      const status = await page.evaluate(async (f) => {
        const img = f.endsWith('.png')
        if (img) {
          return await new Promise<number>((resolve) => {
            const i = new Image()
            i.onload = () => { resolve(200) }
            i.onerror = () => { resolve(0) }
            i.src = f
          })
        }
        return (await caches.match(new URL(f, location.href).href)) ? 200 : 0
      }, file)
      expect(status, file).toBe(200)
    }
  })
})
