// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { LANGS } from '../../src/i18n/index.ts'
import { isPrecached } from '../../src/offline/precache.ts'
import { HREFLANG_LANGS, OG_LOCALE, canonicalUrl, hreflangAlternates, langUrl, normalizeSiteUrl, pageTitle, robotsTxt, sitemapXml, startPageSitemap, staticHead } from '../../src/seo/site.ts'
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
    const xml = sitemapXml([{ loc: 'https://dnitapado.es/?a=1&b=2', alternates: [{ hreflang: 'en', href: 'https://dnitapado.es/en' }] }])
    expect(xml).toContain('<loc>https://dnitapado.es/?a=1&amp;b=2</loc>')
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://dnitapado.es/en"/>')
  })
  it('are files of the build the service worker serves', () => {
    for (const f of ['robots.txt', 'sitemap.xml', 'icons/og-image.png']) expect(isPrecached(f)).toBe(true)
  })
})

describe('one address per language (ADR 0038)', () => {
  const site = 'https://dnitapado.es/'
  it('Spanish is the site address; every other language is a path of its own', () => {
    expect(langUrl(site, 'es')).toBe(site)
    expect(langUrl(site, 'en')).toBe('https://dnitapado.es/en')
    expect(langUrl(site, 'ca-ES-valencia')).toBe('https://dnitapado.es/ca-es-valencia')
    expect(langUrl('https://example.org/sub/', 'ar')).toBe('https://example.org/sub/ar')
  })
  it('each language version is its own canonical page', () => {
    for (const l of LANGS) expect(canonicalUrl(site, l)).toBe(langUrl(site, l))
  })
  it('lists hreflang for every language but Valencian, plus x-default on the Spanish address', () => {
    const alt = hreflangAlternates(site)
    expect(alt.map((a) => a.hreflang)).toEqual([...LANGS.filter((l) => l !== 'ca-ES-valencia'), 'x-default'])
    expect(alt.find((a) => a.hreflang === 'x-default')?.href).toBe(site)
    // Language and optional region only: the form search engines accept.
    for (const l of HREFLANG_LANGS) expect(l).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/)
  })
  it('the static head carries the hreflang links, the same on every version', () => {
    const head = staticHead(site, es)
    expect(head).toContain('<link rel="alternate" hreflang="en" href="https://dnitapado.es/en" />')
    expect(head).toContain('<link rel="alternate" hreflang="x-default" href="https://dnitapado.es/" />')
    expect(head).not.toContain('hreflang="ca-ES-valencia"')
    expect(head).not.toContain('rel="canonical"')
  })
  it('the sitemap lists every language address, with alternates', () => {
    const urls = startPageSitemap(site)
    expect(urls.map((u) => u.loc)).toEqual(LANGS.map((l) => langUrl(site, l)))
    expect(urls[0]?.alternates).toHaveLength(HREFLANG_LANGS.length + 1)
    expect(urls.find((u) => u.loc.endsWith('ca-es-valencia'))?.alternates).toEqual([])
  })
})
