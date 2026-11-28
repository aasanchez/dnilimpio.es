// SPDX-License-Identifier: AGPL-3.0-or-later
// Language pages (ADR 0044): the start page of each language, written by the build from index.html,
// served by the host and the service worker at the language's address.
import { describe, expect, it } from 'vitest'
import { languagePageHtml, languagePages, noScriptTag, pageText } from '../../scripts/language-pages.ts'
import { renderHomes } from '../../scripts/prerender.ts'
import { redirectFor, rewriteFor } from '../../scripts/headers.ts'
import { LANGS, type Lang } from '../../src/i18n/langs.ts'
import { LANGUAGE_SEGMENTS, languagePage, route } from '../../src/offline/precache.ts'
import { staticHead } from '../../src/seo/site.ts'
import en from '../../src/i18n/locales/en.json'
import esDict from '../../src/i18n/locales/es.json'

const SITE = 'https://dnitapado.es/'
const es = pageText('es')

/** A built index.html as the build writes it: Spanish head, noscript and start screen. */
const index = [
  '<!doctype html>',
  '<html lang="es">',
  '<head><meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="script-src &#39;self&#39;" />',
  staticHead(SITE, es, 'es'),
  '<script type="module" src="./assets/index-x.js" integrity="sha384-abc"></script></head>',
  '<body><main id="app" aria-live="polite"><div inert data-prerendered class="app"><h1>Hola</h1></div></main>',
  noScriptTag(es.noScript),
  '</body></html>',
].join('\n')

describe('language page', () => {
  const page = languagePageHtml(index, SITE, 'en', '<div class="app"><h1>Hello</h1></div>')

  it('has the language, direction, head and start screen of its language', () => {
    expect(page).toContain('<html lang="en" dir="ltr">')
    expect(page).toContain(`<title>${en.seoTitle} · DNI Tapado.es</title>`)
    expect(page).toContain('<link rel="canonical" href="https://dnitapado.es/en" />')
    expect(page).toContain('<meta property="og:locale" content="en_GB" />')
    expect(page).toContain(`<noscript>${en.noScript}</noscript>`)
    expect(page).toContain('<main id="app" aria-live="polite"><div inert data-prerendered class="app"><h1>Hello</h1></div></main>')
    expect(page).not.toContain('Hola')
    expect(page).not.toContain(es.seoTitle)
  })
  it('keeps every script, integrity hash and the CSP of index.html', () => {
    expect(page).toContain('<script type="module" src="./assets/index-x.js" integrity="sha384-abc"></script>')
    expect(page).toContain('<meta http-equiv="Content-Security-Policy" content="script-src &#39;self&#39;" />')
  })
  it('writes Arabic right to left', () => {
    expect(languagePageHtml(index, SITE, 'ar', '<div class="app"><h1>x</h1></div>')).toContain('<html lang="ar" dir="rtl">')
  })
  it('fails the build when index.html is not what it expects', () => {
    expect(() => languagePageHtml(index.replace('<html lang="es">', '<html>'), SITE, 'en', '<div><h1>x</h1></div>')).toThrow('<html lang="es">')
    expect(() => languagePageHtml(index.replace(staticHead(SITE, es, 'es'), ''), SITE, 'en', '<div><h1>x</h1></div>')).toThrow('Spanish head')
    expect(() => languagePageHtml(index.replace('<noscript>', '<p>'), SITE, 'en', '<div><h1>x</h1></div>')).toThrow('noscript')
    expect(() => languagePages(index, SITE, new Map())).toThrow('no prerendered start screen')
  })
  it('writes one page per language but Spanish, named after its address', () => {
    const markups = new Map<Lang, string>(LANGS.map((l) => [l, `<div class="app"><h1>${l}</h1></div>`]))
    const pages = languagePages(index, SITE, markups)
    expect([...pages.keys()].sort()).toEqual(LANGUAGE_SEGMENTS.map(languagePage).sort())
    expect(pages.get('ca-es-valencia.html')).toContain('<html lang="ca-ES-valencia" dir="ltr">')
    expect(pages.get('ca-es-valencia.html')).toContain('<link rel="canonical" href="https://dnitapado.es/ca-es-valencia" />')
  })
})

describe('language addresses', () => {
  it('LANGUAGE_SEGMENTS lists every language but Spanish, in lowercase', () => {
    expect([...LANGUAGE_SEGMENTS].sort()).toEqual(LANGS.filter((l) => l !== 'es').map((l) => l.toLowerCase()).sort())
  })
  it('the host shows each language page at its address, and still redirects the slash', () => {
    for (const seg of LANGUAGE_SEGMENTS) {
      expect(rewriteFor(`/${seg}`)).toBe(`/${seg}.html`)
      expect(redirectFor(`/${seg}/`)).toBe(`/${seg}`)
    }
    // The site address shows index.html (ADR 0045).
    expect(rewriteFor('/')).toBe('/index.html')
    expect(rewriteFor('/es')).toBeNull()
  })
  it('the service worker answers a language address with its page, as the host does', () => {
    const scope = 'https://x.test/sub/'
    const files = new Set(LANGUAGE_SEGMENTS.map((s) => `${scope}${languagePage(s)}`))
    const known = { files, onDemand: new Set<string>() }
    for (const seg of LANGUAGE_SEGMENTS) {
      const url = `${scope}${languagePage(seg)}`
      expect(route('GET', `${scope}${seg}`, 'navigate', scope, known)).toEqual({ kind: 'page', url, onDemand: false })
      expect(route('GET', `${scope}${seg}?x=1#y`, 'navigate', scope, known)).toEqual({ kind: 'page', url, onDemand: false })
    }
    // Spanish, another case, an unknown tag, a deeper path, or a build without the page: index.html.
    for (const path of ['', 'EN', 'de', 'en/x']) expect(route('GET', `${scope}${path}`, 'navigate', scope, known).kind).toBe('index')
    expect(route('GET', `${scope}en`, 'navigate', scope, { files: new Set(), onDemand: new Set() }).kind).toBe('index')
    // Its file name shows the same page, as on the host.
    expect(route('GET', `${scope}en.html`, 'navigate', scope, known)).toEqual({ kind: 'page', url: `${scope}en.html`, onDemand: false })
    // Only page loads: a fetch of the address is not a file of the build.
    expect(route('GET', `${scope}en`, 'cors', scope, known).kind).toBe('deny')
  })
})

describe('prerendered start screens', () => {
  it('renders each language in its own words', async () => {
    const all = await renderHomes(process.cwd(), { __REPO_URL__: '"https://github.com/aasanchez/dnitapado.es"', __SITE_URL__: '"https://dnitapado.es/"', __BUILD_SHA__: '""', __BUILD_VERSION__: '""', __BUILD_TIME__: '0', __ARTICLE_LANGS__: '["es"]' }, ['es', 'en', 'ar'])
    expect(all.get('es')).toContain(esDict.homeTitle)
    expect(all.get('en')).toContain(en.homeTitle)
    expect(all.get('en')).toMatch(/<option value="en"[^>]*selected/)
    expect(all.get('ar')).toMatch(/<option value="ar"[^>]*selected/)
    expect(all.get('en')).not.toContain(esDict.homeTitle)
  }, 60_000)
})
