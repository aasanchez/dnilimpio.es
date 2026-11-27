// SPDX-License-Identifier: AGPL-3.0-or-later
// Language pages (ADR 0044): one start page per language, so the HTML the host sends at `/en` is
// already English. The build writes `dist/<tag>.html` for every language but Spanish, from the final
// dist/index.html: the same scripts, import map, integrity hashes and CSP, with the language's own
// `lang` and `dir`, title, description, Open Graph locale, canonical address, noscript text and
// prerendered start screen. The host shows `<tag>.html` at `/<tag>` (scripts/headers.ts), and so
// does the service worker (route() in src/offline/precache.ts).
import { readFileSync } from 'node:fs'
import { replaceApp } from './prerender.ts'
import { LANGS, dir, type Lang } from '../src/i18n/langs.ts'
import { LANGUAGE_SEGMENTS, languagePage } from '../src/offline/precache.ts'
import { staticHead, type HeadText } from '../src/seo/site.ts'

export interface PageText extends HeadText { readonly noScript: string }

/** The text a language page needs, read from src/i18n/locales/<lang>.json. */
export function pageText (lang: Lang): PageText {
  const d = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8')) as Record<string, unknown>
  const get = (key: keyof PageText): string => {
    const v = d[key]
    if (typeof v !== 'string' || v.trim() === '') throw new Error(`src/i18n/locales/${lang}.json: no text for "${key}"`)
    return v
  }
  return { seoTitle: get('seoTitle'), seoDescription: get('seoDescription'), noScript: get('noScript') }
}

const escapeText = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** The <noscript> text of a page, escaped. The build writes it into index.html, and into each language page. */
export const noScriptTag = (text: string): string => `<noscript>${escapeText(text)}</noscript>`

/** Replaces exactly one occurrence of `from` in `html`; throws when it is missing or repeated. */
function replaceOnce (html: string, from: string, to: string, what: string): string {
  const at = html.indexOf(from)
  if (at === -1 || html.indexOf(from, at + 1) !== -1) throw new Error(`language page: expected one ${what} in index.html`)
  return html.slice(0, at) + to + html.slice(at + from.length)
}

/**
 * The start page in `lang`, made from the final Spanish index.html. Only the text changes: every
 * script, stylesheet, integrity hash and the CSP stay exactly as they are in index.html.
 */
export function languagePageHtml (index: string, site: string, lang: Lang, markup: string, es: PageText = pageText('es'), text: PageText = pageText(lang)): string {
  let html = replaceOnce(index, '<html lang="es">', `<html lang="${lang}" dir="${dir(lang)}">`, '<html lang="es">')
  html = replaceOnce(html, staticHead(site, es, 'es'), staticHead(site, text, lang), 'Spanish head')
  html = replaceOnce(html, noScriptTag(es.noScript), noScriptTag(text.noScript), 'Spanish <noscript>')
  return replaceApp(html, markup)
}

/** Every language page of the build, by file name: `en.html`, `ca-es-valencia.html` and so on. */
export function languagePages (index: string, site: string, markups: ReadonlyMap<Lang, string>): Map<string, string> {
  const out = new Map<string, string>()
  const es = pageText('es')
  for (const lang of LANGS) {
    if (lang === 'es') continue
    const segment = lang.toLowerCase()
    if (!(LANGUAGE_SEGMENTS as readonly string[]).includes(segment)) throw new Error(`LANGUAGE_SEGMENTS lacks ${segment}`)
    const markup = markups.get(lang)
    if (markup === undefined) throw new Error(`language page: no prerendered start screen for ${lang}`)
    out.set(languagePage(segment), languagePageHtml(index, site, lang, markup, es))
  }
  return out
}
