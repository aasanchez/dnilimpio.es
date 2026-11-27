// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { LANGS } from '../../src/i18n/index.ts'
import { CRAWL_FILES, isPrecached } from '../../src/offline/precache.ts'
import { OG_LOCALE, normalizeSiteUrl, pageTitle, robotsTxt, sitemapXml, staticHead } from '../../src/seo/site.ts'
import es from '../../src/i18n/locales/es.json'

describe('site address', () => {
  it('ends with exactly one slash and drops query and fragment', () => {
    expect(normalizeSiteUrl('https://dnitapado.es')).toBe('https://dnitapado.es/')
    expect(normalizeSiteUrl('https://example.org/fork?x=1#y')).toBe('https://example.org/fork/')
  })
  it('refuses anything but http(s)', () => {
    expect(() => normalizeSiteUrl('javascript:alert(1)')).toThrow()
    expect(() => normalizeSiteUrl('not a url')).toThrow()
  })
})

describe('static head', () => {
  const head = staticHead('https://dnitapado.es/', es)
  it('has the Spanish title and description, and an absolute preview image', () => {
    expect(head).toContain(`<title>${es.seoTitle} · DNI Tapado.es</title>`)
    expect(head).toContain(`<meta name="description" content="${es.seoDescription}" />`)
    expect(head).toContain('content="https://dnitapado.es/icons/og-image.png"')
  })
  it('escapes text and carries no script or style', () => {
    const h = staticHead('https://dnitapado.es/', { seoTitle: '<b>"x" & y</b>', seoDescription: '"><script>' })
    expect(h).toContain('<title>&lt;b&gt;"x" &amp; y&lt;/b&gt; · DNI Tapado.es</title>')
    expect(h).toContain('content="&quot;&gt;&lt;script&gt;"')
    expect(h).not.toMatch(/<script|<style|style=/)
  })
  it('keeps the title short enough for search results', () => {
    expect(pageTitle(es.seoTitle).length).toBeLessThanOrEqual(65)
    expect(es.seoDescription.length).toBeLessThanOrEqual(160)
  })
})

describe('Open Graph locale', () => {
  it('exists for every language', () => {
    for (const l of LANGS) expect(OG_LOCALE[l]).toMatch(/^[a-z]{2}_[A-Z]{2}$/)
  })
})

describe('crawl files', () => {
  it('robots.txt allows everything and names the sitemap', () => {
    expect(robotsTxt('https://dnitapado.es/')).toBe('User-agent: *\nAllow: /\n\nSitemap: https://dnitapado.es/sitemap.xml\n')
  })
  it('sitemap.xml lists pages with their language versions, escaped', () => {
    const xml = sitemapXml([{ loc: 'https://dnitapado.es/?a=1&b=2', alternates: [{ hreflang: 'en', href: 'https://dnitapado.es/?lang=en' }] }])
    expect(xml).toContain('<loc>https://dnitapado.es/?a=1&amp;b=2</loc>')
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://dnitapado.es/?lang=en"/>')
  })
  it('are not cached by the service worker', () => {
    for (const f of CRAWL_FILES) expect(isPrecached(f)).toBe(false)
  })
})
