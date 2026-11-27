// SPDX-License-Identifier: AGPL-3.0-or-later
// Not-found pages (ADR 0045): one static page per folder people reach, with no script, in the
// folder's language; the preview server picks the nearest one, as the host does.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NOT_FOUND_CSP } from '../../scripts/csp.ts'
import { notFoundFor } from '../../scripts/vite-plugins.ts'
import { LANGS } from '../../src/i18n/langs.ts'
import { NOT_FOUND_FILE, notFoundPages, renderNotFoundPage, type NotFoundPage } from '../../src/notfound/page.ts'
import en from '../../src/i18n/locales/en.json'
import es from '../../src/i18n/locales/es.json'

const dict = (d: Record<string, string>) => (key: string): string => d[key] ?? `?${key}`
const render = (page: NotFoundPage, d: Record<string, string> = es): string => renderNotFoundPage({ page, t: dict(d), brand: 'DNI Tapado.es', csp: NOT_FOUND_CSP, css: 'assets/app-x.css' })

describe('not-found pages', () => {
  it('one at the root and in the Spanish articles folder, and two per other language', () => {
    const pages = notFoundPages()
    expect(pages).toHaveLength(2 + 2 * (LANGS.length - 1))
    expect(pages.slice(0, 2)).toEqual([{ path: '404.html', lang: 'es', depth: 0 }, { path: 'articles/404.html', lang: 'es', depth: 1 }])
    expect(pages).toContainEqual({ path: 'en/404.html', lang: 'en', depth: 1 })
    expect(pages).toContainEqual({ path: 'ca-es-valencia/articles/404.html', lang: 'ca-ES-valencia', depth: 2 })
    for (const p of pages) expect(p.path.split('/')).toHaveLength(p.depth + 1)
  })
  it('is in its language, not indexed, with no script and only relative links', () => {
    const html = render({ path: 'en/articles/404.html', lang: 'en', depth: 2 }, en)
    expect(html).toContain('<html lang="en" dir="ltr">')
    expect(html).toContain(`<title>${en.notFoundTitle} · DNI Tapado.es</title>`)
    expect(html).toContain('<meta name="robots" content="noindex" />')
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${NOT_FOUND_CSP.replaceAll("'", '&#39;')}" />`)
    expect(html).toContain('<link rel="stylesheet" href="../../assets/app-x.css" />')
    expect(html).toContain('href="../../en"')
    expect(html).not.toMatch(/<script|\sstyle=|\son[a-z]+=/i)
    expect(html).not.toMatch(/(href|src)="\//)
  })
  it('links the start page from any depth, and writes Arabic right to left', () => {
    expect(render({ path: '404.html', lang: 'es', depth: 0 })).toContain('id="not-found-home" href="./"')
    expect(render({ path: 'articles/404.html', lang: 'es', depth: 1 })).toContain('id="not-found-home" href="../"')
    expect(render({ path: 'ar/404.html', lang: 'ar', depth: 1 })).toContain('<html lang="ar" dir="rtl">')
  })
  it('escapes the text', () => {
    const html = renderNotFoundPage({ page: { path: '404.html', lang: 'es', depth: 0 }, t: () => '<b>"x"</b>', brand: 'B', csp: NOT_FOUND_CSP, css: 'a.css' })
    expect(html).toContain('&lt;b&gt;&quot;x&quot;&lt;/b&gt;')
    expect(html).not.toContain('<b>')
  })
})

describe('preview server: nearest not-found page', () => {
  const dist = mkdtempSync(join(tmpdir(), 'nf-'))
  for (const p of ['index.html', 'en.html', NOT_FOUND_FILE, `en/${NOT_FOUND_FILE}`, `en/articles/${NOT_FOUND_FILE}`, 'articles/hola', `articles/${NOT_FOUND_FILE}`]) {
    mkdirSync(join(dist, p, '..'), { recursive: true })
    writeFileSync(join(dist, p), p)
  }
  it('answers a file of the build itself', () => {
    for (const p of ['/index.html', '/en.html', '/articles/hola', '/404.html']) expect(notFoundFor(dist, p)).toBeNull()
  })
  it('picks the 404.html of the nearest folder above the path', () => {
    expect(notFoundFor(dist, '/nope')).toBe(join(dist, NOT_FOUND_FILE))
    expect(notFoundFor(dist, '/a/b/c')).toBe(join(dist, NOT_FOUND_FILE))
    expect(notFoundFor(dist, '/en/x')).toBe(join(dist, `en/${NOT_FOUND_FILE}`))
    expect(notFoundFor(dist, '/en/articles/x')).toBe(join(dist, `en/articles/${NOT_FOUND_FILE}`))
    expect(notFoundFor(dist, '/articles/')).toBe(join(dist, `articles/${NOT_FOUND_FILE}`))
    expect(notFoundFor(dist, '/en')).toBe(join(dist, NOT_FOUND_FILE))
    expect(notFoundFor(dist, '/%E0')).toBe(join(dist, NOT_FOUND_FILE))
  })
  it('never looks outside the build', () => {
    expect(notFoundFor(dist, '/../etc/passwd')).toBe(join(dist, NOT_FOUND_FILE))
    expect(notFoundFor(dist, '/en/../../x')).toBe(join(dist, NOT_FOUND_FILE))
  })
})
