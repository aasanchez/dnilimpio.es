// SPDX-License-Identifier: AGPL-3.0-or-later
// Card guide pages (ADR 0040): each page says what the guide dialog says, with every citation and
// source, runs no script, uses relative links only and escapes its text.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GUIDE_CSP, GUIDE_CSP_DIRECTIVES } from '../../scripts/csp.ts'
import { GUIDE_PAGE_CSP, headersFor, hostHeaderRules } from '../../scripts/headers.ts'
import { GUIDE_PAGES } from '../../src/offline/precache.ts'
import { GENERAL_RISK, GUIDE, textOf } from '../../src/guide/entries.ts'
import { GUIDE_PAGE, PAGE_DOCS, esc, guidePageDate, renderGuidePage } from '../../src/guide/page.ts'
import { SOURCES } from '../../src/guide/sources.ts'
import { sourceOrder } from '../../src/guide/view.ts'
import { withoutDataBlocks } from '../../src/seo/site.ts'
import { DOCUMENTS } from '../../src/zones/documents.ts'

const json = (path: string): Record<string, string> => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Record<string, string>
const gEs = json('../../src/guide/locales/es.json')
const tEs = json('../../src/i18n/locales/es.json')
const g = (k: string): string => gEs[k] ?? `MISSING:${k}`
const t = (k: string): string => tEs[k] ?? `MISSING:${k}`
const render = (doc: (typeof PAGE_DOCS)[number], over: Partial<{ g: (k: string) => string }> = {}): string =>
  renderGuidePage({ doc, lang: 'es', dir: 'ltr', g: over.g ?? g, t, css: './assets/app-x.css', brand: 'DNI Tapado.es', csp: GUIDE_CSP, canonical: `https://dnitapado.es/${GUIDE_PAGE[doc]}` })

describe('guide pages', () => {
  it('has one page per supported document, and route() knows each of them', () => {
    expect([...PAGE_DOCS].sort()).toEqual(DOCUMENTS.map((d) => d.model).sort())
    expect(Object.values(GUIDE_PAGE).sort()).toEqual([...GUIDE_PAGES].sort())
  })

  for (const doc of PAGE_DOCS) {
    describe(doc, () => {
      const html = render(doc)

      it('shows every element of the dialog, with its title and text', () => {
        for (const e of GUIDE[doc]) {
          expect(html).toContain(`id="${e.id}"`)
          expect(html).toContain(esc(g(`${textOf(e)}_title`)))
          if (e.what.length > 0) expect(html).toContain(esc(g(`${textOf(e)}_what`)))
          if (e.risk.length > 0) expect(html).toContain(esc(g(`${textOf(e)}_risk`)))
        }
      })

      it('cites every source the dialog cites, numbered the same way, with its link', () => {
        const order = sourceOrder(GUIDE[doc])
        order.forEach((s, i) => {
          expect(html).toContain(`<li id="src-${s}">`)
          expect(html).toContain(`href="${esc(SOURCES[s].url)}"`)
          // The list is in citation order, so its n-th item is source n.
          expect(html.indexOf(`<li id="src-${s}">`)).toBeGreaterThan(i === 0 ? 0 : html.indexOf(`<li id="src-${order[i - 1] ?? ''}">`))
        })
        for (const c of [...GENERAL_RISK, ...GUIDE[doc].flatMap((e) => [...e.what, ...e.risk])]) {
          expect(html).toContain(`href="#src-${c.src}">[${String(order.indexOf(c.src) + 1)}, ${esc(c.at)}]`)
        }
      })

      it('runs no script and carries the strict guide CSP', () => {
        // The one <script> element is the JSON-LD data block, which the browser never runs (ADR 0048).
        expect(html.match(/<script\b/g)).toHaveLength(1)
        expect(withoutDataBlocks(html)).not.toMatch(/<script|\son\w+=|javascript:/i)
        expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${esc(GUIDE_CSP)}" />`)
        expect(html).toContain('<meta name="referrer" content="no-referrer" />')
      })

      it('links within the site by relative URLs only (rule 6), and outside only to https sources', () => {
        // The canonical URL is the one absolute link to the site itself: search engines need it.
        expect(html).toContain(`<link rel="canonical" href="https://dnitapado.es/${GUIDE_PAGE[doc]}" />`)
        for (const [, url] of html.replace(/<link rel="canonical"[^>]*>/, '').matchAll(/(?:href|src)="([^"]*)"/g)) {
          expect(url, url).not.toMatch(/^\/(?!\/)/)
          if (/^[a-z]+:/i.test(url ?? '')) expect(url).toMatch(/^https:\/\//)
        }
        expect(html).toContain('aria-current="page"')
        for (const d of PAGE_DOCS) expect(html).toContain(`href="./${GUIDE_PAGE[d]}"`)
        expect(html).toContain('<a class="button" href="./">')
      })

      it('has a short title and a description that name the document', () => {
        const name = t(`doc_${doc}`).replace(/\s*\(.*\)$/, '')
        const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
        expect(title.startsWith(`${esc(name)}: `)).toBe(true)
        expect(title.endsWith(' · DNI Tapado.es')).toBe(true)
        // Search results cut a title at about 60 characters.
        expect(title.length).toBeLessThanOrEqual(65)
        expect(html).toMatch(/<meta name="description" content="[^"]{50,160}" \/>/)
        expect(html).toContain('<html lang="es" dir="ltr">')
      })

      it('has the tags a link preview reads, with an absolute image', () => {
        const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
        expect(html).toContain(`<meta property="og:title" content="${title}" />`)
        expect(html).toContain(`<meta property="og:url" content="https://dnitapado.es/${GUIDE_PAGE[doc]}" />`)
        expect(html).toContain('<meta property="og:type" content="article" />')
        expect(html).toContain('<meta property="og:locale" content="es_ES" />')
        expect(html).toContain('<meta property="og:image" content="https://dnitapado.es/icons/og-image.png" />')
        expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
        expect(html).toMatch(/<meta property="og:description" content="[^"]{50,160}" \/>/)
      })

      it('tells search engines it is an article that cites its sources, and where it sits in the site', () => {
        const block = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html)?.[1] ?? 'null'
        const graph = (JSON.parse(block) as { '@graph': Array<Record<string, unknown>> })['@graph']
        const article = graph.find((x) => x['@type'] === 'Article') ?? {}
        expect(article['headline']).toBe(/<h1>([^<]*)<\/h1>/.exec(html)?.[1]?.replace(/&#39;/g, "'"))
        expect(String(article['headline']).length).toBeLessThanOrEqual(110)
        expect(article['url']).toBe(`https://dnitapado.es/${GUIDE_PAGE[doc]}`)
        expect(article['inLanguage']).toBe('es')
        expect(article['image']).toBe('https://dnitapado.es/icons/og-image.png')
        expect(article['dateModified']).toBe(guidePageDate(doc))
        expect(article['author']).toEqual({ '@type': 'Organization', name: 'DNI Tapado.es', url: 'https://dnitapado.es/' })
        expect(article['citation']).toEqual(sourceOrder(GUIDE[doc]).map((s) => SOURCES[s].url))
        const crumbs = graph.find((x) => x['@type'] === 'BreadcrumbList') ?? {}
        expect(crumbs['itemListElement']).toEqual([
          { '@type': 'ListItem', position: 1, name: 'DNI Tapado.es', item: 'https://dnitapado.es/' },
          { '@type': 'ListItem', position: 2, name: t(`doc_${doc}`).replace(/\s*\(.*\)$/, ''), item: `https://dnitapado.es/${GUIDE_PAGE[doc]}` },
        ])
      })

      it('dates the page by the newest check of its sources', () => {
        const dates = sourceOrder(GUIDE[doc]).map((s) => SOURCES[s].checked)
        expect(guidePageDate(doc)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(dates).toContain(guidePageDate(doc))
        for (const d of dates) expect(d <= guidePageDate(doc)).toBe(true)
      })

      it('has no empty text and no unfilled placeholder', () => {
        expect(html).not.toContain('MISSING:')
        expect(html).not.toMatch(/\{\w+\}/)
        expect(html).not.toMatch(/<p>\s*<\/p>|<h[1-4][^>]*>\s*<\/h[1-4]>/)
      })
    })
  }

  it('escapes the guide text, so a translation can never add markup', () => {
    const html = render('tie', { g: (k) => (k === 'nie_title' ? '<img src=x onerror=alert(1)>"&' : g(k)) })
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;&amp;')
    expect(html).not.toContain('<img')
    const short = render('tie', { g: (k) => (k === 'pageSeoTitle' ? '"><b>{doc}' : g(k)) })
    expect(short).toContain('<title>&quot;&gt;&lt;b&gt;TIE · DNI Tapado.es</title>')
    expect(short).toContain('content="&quot;&gt;&lt;b&gt;TIE · DNI Tapado.es"')
    expect(short).not.toContain('<b>')
    // No translated text can close the data block.
    const closing = render('tie', { g: (k) => (k === 'pageTitle' ? '{doc}</script><script>alert(1)</script>' : g(k)) })
    expect(closing.match(/<script\b/g)).toHaveLength(1)
    expect(closing).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>')
  })

  it('their CSP allows no script, no connection and no frame', () => {
    expect(GUIDE_CSP_DIRECTIVES).toContain("script-src 'none'")
    expect(GUIDE_CSP_DIRECTIVES).toContain("connect-src 'none'")
    expect(GUIDE_CSP).toMatch(/^default-src 'none'/)
    expect(GUIDE_CSP).not.toMatch(/https?:|'unsafe-|\*|wasm|worker-src|frame-src|trusted-types/)
  })

  it('the host sends each page that CSP instead of the app\'s, with frame-ancestors', () => {
    const rules = hostHeaderRules('<html></html>')
    for (const page of GUIDE_PAGES) {
      expect(headersFor(rules, `/${page}`)['content-security-policy']).toBe(GUIDE_PAGE_CSP)
    }
    expect(GUIDE_PAGE_CSP).toBe(`${GUIDE_CSP}; frame-ancestors 'none'`)
  })
})
