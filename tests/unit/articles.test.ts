// SPDX-License-Identifier: AGPL-3.0-or-later
// Articles (ADR 0039): addresses, front matter, Markdown rules, the pages, loading from disk, the
// sitemap, the host's rules and the service worker's routes.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARTICLE_CSP, GUIDE_CSP } from '../../scripts/csp.ts'
import { checkLink, renderMarkdown } from '../../scripts/article-markdown.ts'
import { articleLangs, articleSitemap, dayOf, imageFileName, loadArticles } from '../../scripts/articles.ts'
import { ARTICLE_CONTENT_TYPE, headersFor, hostHeaderRules, redirectFor, rewriteFor } from '../../scripts/headers.ts'
import { isDay, parseArticle } from '../../src/articles/front-matter.ts'
import { alternatesOf, byDate, formatDay, renderArticlePage, renderIndexPage, type Article, type PageContext } from '../../src/articles/page.ts'
import { articleDepth, articleFolder, articleIndexFile, articlePath, articleRoute, isArticleFile, isArticlePage } from '../../src/articles/paths.ts'
import { answersIdle, isOnDemand, route } from '../../src/offline/precache.ts'
import es from '../../src/i18n/locales/es.json' with { type: 'json' }
import en from '../../src/i18n/locales/en.json' with { type: 'json' }

const SITE = 'https://dnitapado.es/'
const FM = '---\ntitle: Un título\ndescription: Una descripción corta.\ntype: news\ndate: 2026-11-27\n---\n'

describe('article addresses', () => {
  it('puts Spanish at articles/ and every other language under its lowercase tag', () => {
    expect(articleFolder('es')).toBe('articles/')
    expect(articleFolder('en')).toBe('en/articles/')
    expect(articleFolder('ca-ES-valencia')).toBe('ca-es-valencia/articles/')
    expect(articlePath('fr', 'mi-guia')).toBe('fr/articles/mi-guia')
    expect(articleIndexFile('es')).toBe('articles/index.html')
    expect(articleDepth('es')).toBe(1)
    expect(articleDepth('ca-ES-valencia')).toBe(2)
  })
  it('knows an article page by its shape, and nothing else', () => {
    expect(isArticlePage('articles/hola')).toBe(true)
    expect(isArticlePage('en/articles/index.html')).toBe(true)
    expect(isArticlePage('ca-es-valencia/articles/a-1')).toBe(true)
    for (const p of ['articles/', 'articles/Hola', 'articles/a.html', 'articles/a/b', 'assets/articles/x.png', 'index.html', 'thanks.html', 'english/articles/x', 'articles/a--b']) {
      expect(isArticlePage(p), p).toBe(false)
    }
    expect(isArticleFile('assets/articles/x-0123456789.png')).toBe(true)
    expect(isArticleFile('assets/app-x.css')).toBe(false)
  })
  it('answers page loads as the host does: folder to its list, no slash to a redirect', () => {
    expect(articleRoute('articles')).toEqual({ redirect: 'articles/' })
    expect(articleRoute('en/articles')).toEqual({ redirect: 'en/articles/' })
    expect(articleRoute('articles/')).toEqual({ file: 'articles/index.html' })
    expect(articleRoute('en/articles/x')).toEqual({ file: 'en/articles/x' })
    expect(articleRoute('en')).toBeNull()
    expect(articleRoute('')).toBeNull()
    expect(articleRoute('articles/x/')).toBeNull()
  })
})

describe('front matter', () => {
  it('reads the fixed keys', () => {
    const { meta, body } = parseArticle(`${FM}\n## Hola\n`, 'a.md', true)
    expect(meta).toEqual({ title: 'Un título', description: 'Una descripción corta.', type: 'news', date: '2026-11-27', draft: false, sources: [] })
    expect(body).toBe('\n## Hola\n')
  })
  it('reads optional keys, quotes, Windows line ends and a byte order mark', () => {
    const text = '﻿---\r\ntitle: "Con: dos puntos"\r\ndescription: d\r\ntype: guide\r\ndate: 2026-01-01\r\nupdated: 2026-02-01\r\ntranslationOf: hola\r\ndraft: true\r\nsources: [rd255, aepdCopy]\r\n---\r\nx'
    const { meta } = parseArticle(text, 'a.md', false)
    expect(meta).toMatchObject({ title: 'Con: dos puntos', type: 'guide', updated: '2026-02-01', translationOf: 'hola', draft: true, sources: ['rd255', 'aepdCopy'] })
  })
  it.each([
    ['no front matter', '# x', /must start/],
    ['no closing line', '---\ntitle: x\n', /closing/],
    ['an unknown key', FM.replace('type: news', 'type: news\nauthor: x'), /unknown front matter key "author"/],
    ['a key twice', FM.replace('type: news', 'type: news\ntype: info'), /twice/],
    ['a line that is not key: value', FM.replace('type: news', 'type: news\njust text'), /key: value/],
    ['a missing title', FM.replace('title: Un título\n', ''), /needs "title"/],
    ['a long title', FM.replace('Un título', 'x'.repeat(71)), /title is longer/],
    ['a long description', FM.replace('Una descripción corta.', 'x'.repeat(161)), /description is longer/],
    ['an unknown type', FM.replace('type: news', 'type: blog'), /type must be/],
    ['a day that does not exist', FM.replace('2026-11-27', '2026-02-30'), /date must be/],
    ['updated before date', FM.replace('type: news', 'type: news\nupdated: 2026-01-01'), /updated must be/],
    ['draft that is not true or false', FM.replace('type: news', 'type: news\ndraft: yes'), /draft must be/],
    ['sources that are not a list', FM.replace('type: news', 'type: news\nsources: rd255'), /must be a list/],
    ['an unknown source', FM.replace('type: news', 'type: news\nsources: [nope]'), /unknown source "nope"/],
    ['a source twice', FM.replace('type: news', 'type: news\nsources: [rd255, rd255]'), /twice/],
    ['a guide with no sources', FM.replace('type: news', 'type: guide'), /must cite its sources/],
  ])('refuses %s, naming the file', (_name, text, why) => {
    expect(() => parseArticle(text, 'content/articles/es/a.md', false)).toThrow(why)
    expect(() => parseArticle(text, 'content/articles/es/a.md', false)).toThrow(/^content\/articles\/es\/a\.md: /)
  })
  it('translationOf only on a translation, and only a slug', () => {
    expect(() => parseArticle(FM.replace('type: news', 'type: news\ntranslationOf: x'), 'a.md', true)).toThrow(/Spanish article is the original/)
    expect(() => parseArticle(FM.replace('type: news', 'type: news\ntranslationOf: Not A Slug'), 'a.md', false)).toThrow(/slug/)
  })
  it('isDay checks the calendar', () => {
    expect(isDay('2024-02-29')).toBe(true)
    expect(isDay('2026-02-29')).toBe(false)
    expect(isDay('2026-1-01')).toBe(false)
  })
})

describe('Markdown rules', () => {
  const md = (s: string, image = (src: string): string => `../${src}`): string => renderMarkdown(s, { file: 'a.md', image })
  it('turns Markdown into HTML, escaping text and code', () => {
    const html = md('## Hola\n\nA & B < C **fuerte**\n\n```\n<script>\n```\n')
    expect(html).toContain('<h2>Hola</h2>')
    expect(html).toContain('A &amp; B &lt; C <strong>fuerte</strong>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
  it('opens outside links in a new tab with no referrer, and keeps relative links', () => {
    expect(md('[BOE](https://www.boe.es/ "El BOE")')).toContain('<a href="https://www.boe.es/" title="El BOE" target="_blank" rel="noopener noreferrer">BOE</a>')
    expect(md('[otra](./otra)')).toContain('<a href="./otra">otra</a>')
    expect(md('[arriba](#arriba)')).toContain('<a href="#arriba">arriba</a>')
  })
  it('copies local images through the caller and needs a description', () => {
    expect(md('![Una tarjeta ficticia](tarjeta.png)', (s) => `../assets/articles/${s}`)).toContain('<img src="../assets/articles/tarjeta.png" alt="Una tarjeta ficticia" loading="lazy" />')
    expect(() => md('![](tarjeta.png)')).toThrow(/needs a description/)
    expect(() => md('![x](https://example.org/x.png)')).toThrow(/file next to the article/)
  })
  it.each([
    ['raw HTML', '<div>x</div>', /raw HTML/],
    ['inline HTML', 'a <span onclick="x()">b</span>', /raw HTML/],
    ['a # heading', '# Título', /## for headings/],
    ['a root-absolute link', '[x](/icons/x.png)', /root-absolute/],
    ['a protocol-relative link', '[x](//evil.example/x)', /protocol-relative/],
    ['a javascript: link', '[x](javascript:alert(1))', /not allowed/],
    ['a data: link', '[x](data:text/html,x)', /not allowed/],
  ])('refuses %s with the file name', (_name, text, why) => {
    expect(() => md(text)).toThrow(why)
    expect(() => md(text)).toThrow(/^a\.md: /)
  })
  it('checkLink sorts links', () => {
    expect(checkLink('mailto:a@b.c')).toBe('external')
    expect(checkLink('../en/articles/x')).toBe('internal')
    expect(checkLink('')).toEqual({ refused: 'an empty link' })
  })
})

const t = (dict: Record<string, string>) => (k: string): string => {
  const v = dict[k]
  if (v === undefined) throw new Error(k)
  return v
}
const ctx = (lang: 'es' | 'en' | 'ar'): PageContext => ({ lang, t: t(lang === 'en' ? en : es), brand: 'DNI Tapado.es', csp: ARTICLE_CSP, css: 'assets/app-x.css', site: SITE })
const art = (lang: Article['lang'], slug: string, over: Partial<Article['meta']> = {}, group = slug): Article => ({
  lang, slug, group, html: '<p>Cuerpo &amp; texto</p>\n', meta: { title: `T ${slug}`, description: `D ${slug}`, type: 'news', date: '2026-11-27', draft: false, sources: [], ...over },
})

describe('article page', () => {
  const a = art('es', 'hola', { updated: '2026-11-28', sources: ['rd255'] })
  const b = art('en', 'hello', {}, 'hola')
  const html = renderArticlePage(a, [a, b], ctx('es'))
  it('is a complete page with the strict CSP, no script and relative links only', () => {
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<html lang="es" dir="ltr">')
    expect(html).toContain(`content="${ARTICLE_CSP.replaceAll("'", '&#39;')}"`)
    expect(ARTICLE_CSP).toBe(GUIDE_CSP)
    expect(ARTICLE_CSP).toContain("script-src 'none'")
    expect(html).not.toMatch(/<script\b|\sstyle=|\son[a-z]+=/i)
    expect(html).toContain('<link rel="stylesheet" href="../assets/app-x.css" />')
    expect(html).toContain('href="../favicon.ico"')
    // Every href and src that is not the canonical, an alternate or a source is relative.
    const local = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1] ?? '').filter((u) => !u.startsWith('https://'))
    expect(local.every((u) => !u.startsWith('/'))).toBe(true)
  })
  it('carries title, description, canonical and hreflang for search engines', () => {
    expect(html).toContain('<title>T hola · DNI Tapado.es</title>')
    expect(html).toContain('<meta name="description" content="D hola" />')
    expect(html).toContain('<link rel="canonical" href="https://dnitapado.es/articles/hola" />')
    expect(html).toContain('<link rel="alternate" hreflang="es" href="https://dnitapado.es/articles/hola" />')
    expect(html).toContain('<link rel="alternate" hreflang="en" href="https://dnitapado.es/en/articles/hello" />')
  })
  it('shows the body, the dates, the sources and a link to the translation', () => {
    expect(html).toContain('<h1>T hola</h1>')
    expect(html).toContain('<p>Cuerpo &amp; texto</p>')
    expect(html).toContain('Publicado el 27 de noviembre de 2026')
    expect(html).toContain('Actualizado el 28 de noviembre de 2026')
    expect(html).toContain('Real Decreto 255/2025')
    expect(html).toContain('target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('<a lang="en" hreflang="en" href="../en/articles/hello">T hello</a>')
    expect(html).toContain('href="./">Todos los artículos</a>')
    expect(html).toContain('<a class="button" href="../">Abrir DNI Tapado.es</a>')
  })
  it('a translation links back up two folders and to the app in its language', () => {
    const page = renderArticlePage(b, [a, b], ctx('en'))
    expect(page).toContain('<link rel="stylesheet" href="../../assets/app-x.css" />')
    expect(page).toContain('href="../../articles/hola"')
    expect(page).toContain('href="../../en">Open DNI Tapado.es</a>')
    expect(page).toContain('Published on November 27, 2026')
  })
  it('an article alone has no alternates and no translation line', () => {
    const page = renderArticlePage(a, [a], ctx('es'))
    expect(page).not.toContain('hreflang')
    expect(page).not.toContain('En otros idiomas')
  })
  it('Arabic is right to left', () => {
    expect(renderArticlePage(art('ar', 'x'), [], ctx('ar'))).toContain('<html lang="ar" dir="rtl">')
  })
  it('escapes front matter text', () => {
    const page = renderArticlePage(art('es', 'x', { title: '<b>"x"</b>' }), [], ctx('es'))
    expect(page).toContain('&lt;b&gt;&quot;x&quot;&lt;/b&gt;')
    expect(page).not.toContain('<b>')
  })
})

describe('list of articles', () => {
  const list = [art('es', 'vieja', { date: '2026-01-01' }), art('es', 'nueva', { date: '2026-11-01' }), art('es', 'guia', { type: 'guide', sources: ['rd255'] }), art('en', 'other')]
  const html = renderIndexPage(list, ctx('es'))
  it('lists only its own language, by type, newest first', () => {
    expect(html).not.toContain('T other')
    expect(html.indexOf('T nueva')).toBeLessThan(html.indexOf('T vieja'))
    expect(html.indexOf('Noticias')).toBeLessThan(html.indexOf('Guías'))
    expect(html).not.toContain('>Información<')
    expect(html).toContain('<a href="./nueva">T nueva</a>')
    expect(html).toContain('<link rel="canonical" href="https://dnitapado.es/articles/" />')
    expect(html).not.toMatch(/<script\b/)
  })
  it('byDate breaks ties by title', () => {
    expect([art('es', 'b'), art('es', 'a')].sort(byDate).map((x) => x.slug)).toEqual(['a', 'b'])
  })
  it('formatDay is the same in any time zone', () => {
    expect(formatDay('2026-01-01', 'es')).toBe('1 de enero de 2026')
  })
})

describe('loading content/articles', () => {
  const tmp = (files: Record<string, string>): string => {
    const dir = mkdtempSync(join(tmpdir(), 'articles-'))
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true })
      writeFileSync(join(dir, name), text)
    }
    return dir
  }
  it('reads every language folder, leaves out drafts and future dates, links translations', () => {
    const dir = tmp({
      'README.md': 'x',
      'es/hola.md': FM,
      'es/borrador.md': FM.replace('type: news', 'type: news\ndraft: true'),
      'es/futura.md': FM.replace('2026-11-27', '2026-12-01'),
      'en/hello.md': FM.replace('type: news', 'type: news\ntranslationOf: hola'),
      'ca-es-valencia/hola.md': FM,
      'es/foto.png': 'png',
    })
    const list = loadArticles(dir, '2026-11-30')
    expect(list.map((a) => `${a.lang}/${a.slug}`)).toEqual(['ca-ES-valencia/hola', 'en/hello', 'es/hola'])
    expect(list.find((a) => a.lang === 'en')?.group).toBe('hola')
    expect(list.find((a) => a.lang === 'ca-ES-valencia')?.group).toBe('ca-ES-valencia/hola')
    expect(articleLangs(list)).toEqual(['es', 'ca-ES-valencia', 'en'])
    expect(loadArticles(dir, '2026-12-01').map((a) => a.slug)).toContain('futura')
  })
  it('has no articles when the folder is missing', () => {
    expect(loadArticles(join(tmpdir(), 'no-such-folder-x'), '2026-01-01')).toEqual([])
  })
  it.each([
    ['a file at the top', { 'notes.txt': 'x' }, /only language folders/],
    ['an unknown language', { 'xx/a.md': FM }, /not a language folder/],
    ['an upper-case folder', { 'EN/a.md': FM }, /not a language folder/],
    ['a stray file', { 'es/a.txt': 'x' }, /Markdown files/],
    ['an SVG image', { 'es/a.svg': '<svg/>' }, /Markdown files/],
    ['a bad file name', { 'es/Hola Mundo.md': FM }, /file name is the address/],
    ['a translation of nothing', { 'en/a.md': FM.replace('type: news', 'type: news\ntranslationOf: nada') }, /does not exist/],
    ['two translations in one language', { 'es/a.md': FM, 'en/b.md': FM.replace('type: news', 'type: news\ntranslationOf: a'), 'en/c.md': FM.replace('type: news', 'type: news\ntranslationOf: a') }, /translate the same article/],
  ])('refuses %s', (_name, files, why) => {
    expect(() => loadArticles(tmp(files), '2026-12-31')).toThrow(why)
  })
  it('the sitemap lists each language list and each article, with alternates for translations', () => {
    const dir = tmp({ 'es/hola.md': FM, 'en/hello.md': FM.replace('type: news', 'type: news\ntranslationOf: hola'), 'es/sola.md': FM })
    const urls = articleSitemap(SITE, loadArticles(dir, '2026-12-31'))
    expect(urls.map((u) => u.loc)).toEqual([
      'https://dnitapado.es/articles/', 'https://dnitapado.es/en/articles/',
      'https://dnitapado.es/en/articles/hello', 'https://dnitapado.es/articles/hola', 'https://dnitapado.es/articles/sola',
    ])
    expect(urls[3]?.alternates).toEqual([{ hreflang: 'en', href: 'https://dnitapado.es/en/articles/hello' }, { hreflang: 'es', href: 'https://dnitapado.es/articles/hola' }])
    expect(urls[4]?.alternates).toEqual([])
    // An article's <lastmod> is its last update, else its date; a list has none.
    expect(urls[3]?.lastmod).toBe('2026-11-27')
    expect(urls[0]?.lastmod).toBeUndefined()
    const updated = articleSitemap(SITE, loadArticles(tmp({ 'es/hola.md': FM.replace('date: 2026-11-27', 'date: 2026-11-27\nupdated: 2026-11-28') }), '2026-12-31'))
    expect(updated[1]?.lastmod).toBe('2026-11-28')
  })
  it('leaves Valencian out of hreflang, as the start page does', () => {
    const v = { lang: 'ca-ES-valencia' as const, group: 'g' }
    const e = { lang: 'es' as const, group: 'g' }
    expect(alternatesOf(e, [e, v]).map((o) => o.lang)).toEqual(['es'])
  })
  it('names copied images by content', () => {
    expect(imageFileName('Mi Foto.PNG', new Uint8Array([1, 2]))).toMatch(/^assets\/articles\/mi-foto-[0-9a-f]{10}\.png$/)
    expect(imageFileName('Mi Foto.PNG', new Uint8Array([1, 2]))).not.toBe(imageFileName('Mi Foto.PNG', new Uint8Array([3])))
    expect(dayOf(Date.UTC(2026, 10, 27, 23, 59))).toBe('2026-11-27')
  })
})

describe('host rules for articles', () => {
  const rules = hostHeaderRules('<html></html>')
  it('sends every article as HTML, with the page CSP still in force', () => {
    for (const path of ['/articles/hola', '/en/articles/hello', '/articles/index.html', '/ca-es-valencia/articles/x']) {
      const h = headersFor(rules, path)
      expect(h['content-type'], path).toBe(ARTICLE_CONTENT_TYPE)
      expect(h['content-security-policy'], path).toContain("default-src 'none'")
    }
    expect(headersFor(rules, '/assets/app.css')['content-type']).toBeUndefined()
  })
  it('redirects a folder without its slash and shows its list at the folder address', () => {
    expect(redirectFor('/articles')).toBe('/articles/')
    expect(redirectFor('/en/articles')).toBe('/en/articles/')
    expect(rewriteFor('/articles/')).toBe('/articles/index.html')
    expect(rewriteFor('/en/articles/')).toBe('/en/articles/index.html')
    expect(redirectFor('/articles/')).toBeNull()
    expect(rewriteFor('/articles')).toBeNull()
  })
})

describe('service worker routes for articles', () => {
  const scope = 'https://x.test/'
  const known = { files: new Set([`${scope}index.html`]), onDemand: new Set([`${scope}articles/index.html`, `${scope}articles/hola`, `${scope}en/articles/hello`]) }
  const nav = (path: string): ReturnType<typeof route> => route('GET', `${scope}${path}`, 'navigate', scope, known)
  it('serves an article and a list on demand, checked against the manifest', () => {
    expect(nav('articles/hola')).toEqual({ kind: 'page', url: `${scope}articles/hola`, onDemand: true })
    expect(nav('articles/')).toEqual({ kind: 'page', url: `${scope}articles/index.html`, onDemand: true })
    expect(nav('en/articles/hello')).toEqual({ kind: 'page', url: `${scope}en/articles/hello`, onDemand: true })
    expect(nav('articles')).toEqual({ kind: 'redirect', url: `${scope}articles/` })
  })
  it('gives the app for an article that is not in this build, or with a query', () => {
    expect(nav('articles/nada')).toEqual({ kind: 'index' })
    expect(nav('fr/articles/')).toEqual({ kind: 'index' })
    expect(nav('articles/hola?x=1')).toEqual({ kind: 'index' })
  })
  it('loads article files only by page load, never as a subresource of another page', () => {
    expect(route('GET', `${scope}articles/hola`, 'cors', scope, known)).toEqual({ kind: 'on-demand', url: `${scope}articles/hola` })
    expect(route('POST', `${scope}articles/hola`, 'navigate', scope, known)).toEqual({ kind: 'deny' })
  })
  it('saves articles and their images when first used, not at install', () => {
    expect(isOnDemand('articles/hola')).toBe(true)
    expect(isOnDemand('en/articles/index.html')).toBe(true)
    expect(isOnDemand('assets/articles/x-0123456789.png')).toBe(true)
    expect(isOnDemand('assets/app-x.css')).toBe(false)
  })
  it('an article window runs no script, so the update does not wait for its answer', () => {
    const with404 = { ...known, files: new Set([...known.files, `${scope}en.html`, `${scope}404.html`, `${scope}en/articles/404.html`]) }
    expect(answersIdle(`${scope}articles/hola`, scope, with404)).toBe(false)
    // No English list: the not-found page, which runs no script either (ADR 0045).
    expect(answersIdle(`${scope}en/articles/`, scope, with404)).toBe(false)
    expect(answersIdle(`${scope}en`, scope, with404)).toBe(true)
  })
})
