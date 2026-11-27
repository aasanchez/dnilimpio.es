// SPDX-License-Identifier: AGPL-3.0-or-later
// Card guide pages (ADR 0040): each page says what the guide dialog says, with every citation and
// source, runs no script, uses relative links only and escapes its text.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GUIDE_CSP, GUIDE_CSP_DIRECTIVES } from '../../scripts/csp.ts'
import { GUIDE_PAGE_CSP, headersFor, hostHeaderRules } from '../../scripts/headers.ts'
import { GUIDE_PAGES } from '../../src/offline/precache.ts'
import { GENERAL_RISK, GUIDE, textOf } from '../../src/guide/entries.ts'
import { GUIDE_PAGE, PAGE_DOCS, esc, renderGuidePage } from '../../src/guide/page.ts'
import { SOURCES } from '../../src/guide/sources.ts'
import { sourceOrder } from '../../src/guide/view.ts'
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
        expect(html).not.toMatch(/<script|\son\w+=|javascript:/i)
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

      it('has a title and a description that name the document', () => {
        const name = t(`doc_${doc}`)
        expect(html).toContain(`<title>${esc(name)}: `)
        expect(html).toMatch(/<meta name="description" content="[^"]{50,160}" \/>/)
        expect(html).toContain('<html lang="es" dir="ltr">')
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
