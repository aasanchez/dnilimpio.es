// SPDX-License-Identifier: AGPL-3.0-or-later
// Prerendered start screen (ADR 0041, 0044). At build time the app's own App.svelte is rendered to
// plain HTML once per language, and that HTML goes inside <main id="app">: in dist/index.html for
// Spanish, in dist/<tag>.html for every other language. Search engines and link previews that run no
// JavaScript then read the real start screen in the address's language, and the browser paints the
// heading before any script runs. src/main.ts clears it and mounts the live app.
//
// The output is checked: no inline script, no style attribute, no inline event handler. The page's
// CSP (scripts/csp.ts) and Trusted Types rules hold unchanged.

import { createServer } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import type { Lang } from '../src/i18n/langs.ts'

/** What prerendered markup must never hold. Each one would break the CSP or the promise of rule 3. */
const FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/<script\b/i, 'a script element'],
  [/<!--|<dialog\b/i, 'a comment or a dialog left after trimming'],
  [/\sstyle\s*=/i, 'a style attribute'],
  [/<style\b/i, 'a style element'],
  [/\son[a-z]+\s*=/i, 'an inline event handler'],
  [/<(iframe|object|embed|img|link)\b/i, 'an element that loads a file'],
  [/\b(src|srcset)\s*=/i, 'a src attribute'],
]

/**
 * Removes what the page does not need before the app starts:
 * - Svelte's hydration markers and every other comment. The app mounts fresh instead of hydrating
 *   (src/main.ts), so the markers serve no purpose.
 * - Closed dialogs (the audit prompt, twice). Nobody can open them before the app starts, and their
 *   long English text would only make the page larger and dilute the Spanish text for search.
 */
export function trimMarkup (html: string): string {
  return cutAll(cutAll(html, '<!--', '-->'), '<dialog', '</dialog>')
}

/**
 * Removes every piece from `open` to the next `close`, both included, scanning the result again
 * from where the cut was made, so a piece that two cuts join together is removed too. An `open`
 * with no `close` after it is left, and checkPrerendered() then fails the build.
 */
function cutAll (html: string, open: string, close: string): string {
  let out = html
  let from = 0
  for (;;) {
    const start = out.indexOf(open, Math.max(0, from - open.length))
    if (start === -1) return out
    const end = out.indexOf(close, start + open.length)
    if (end === -1) return out
    out = out.slice(0, start) + out.slice(end + close.length)
    from = start
  }
}

/** Throws when the markup holds anything the strict CSP would refuse or that loads a file. */
export function checkPrerendered (html: string): string {
  for (const [re, what] of FORBIDDEN) {
    if (re.test(html)) throw new Error(`prerendered start screen contains ${what}: ${re.source}`)
  }
  if (!/<h1\b/.test(html)) throw new Error('prerendered start screen has no <h1>')
  return html
}

/**
 * Puts the markup inside the empty <main id="app"> of the page. Its root element gets `inert`: the
 * buttons do nothing until the app starts, so they take no focus or tap. src/main.ts then replaces
 * the whole markup with the live app.
 */
export function insertIntoApp (page: string, markup: string): string {
  const empty = /(<main id="app"[^>]*>)(<\/main>)/
  if (!empty.test(page)) throw new Error('index.html must contain an empty <main id="app"></main>')
  if (!markup.startsWith('<div ')) throw new Error('prerendered start screen must start with a <div>')
  const inert = markup.replace(/^<div /, '<div inert data-prerendered ')
  return page.replace(empty, (_, open: string, close: string) => `${open}${inert}${close}`)
}

/**
 * Replaces the start screen inside <main id="app"> of a built page (index.html, already prerendered)
 * with `markup`, for another language's page (ADR 0044).
 */
export function replaceApp (page: string, markup: string): string {
  const full = /(<main id="app"[^>]*>)[\s\S]*?(<\/main>)/
  if (!full.test(page)) throw new Error('page must contain <main id="app">…</main>')
  return insertIntoApp(page.replace(full, '$1$2'), markup)
}

/**
 * The browser objects the start screen reads while it renders, set to a fixed browser in `lang` that
 * is not installed, not on iOS and has no stored notice date, at the address of that language. The
 * clock reads `now`, the build time, and the time zone is UTC, so the footer's "deployed" time is the
 * same in every rebuild, on any machine (the reproducible build). Only for the duration of render().
 */
function withPrerenderGlobals<T> (now: number, lang: Lang, fn: () => T): T {
  const g = globalThis as Record<string, unknown>
  const saved = new Map<string, PropertyDescriptor | undefined>()
  const stub = (key: string, value: unknown): void => {
    saved.set(key, Object.getOwnPropertyDescriptor(g, key))
    Object.defineProperty(g, key, { value, configurable: true, writable: true })
  }
  stub('navigator', { language: lang, languages: [lang], userAgent: '', maxTouchPoints: 0 })
  stub('window', { matchMedia: () => ({ matches: false }) })
  // The language's own address (ADR 0038): the page reads its language from the path.
  const path = `/${lang === 'es' ? '' : lang.toLowerCase()}`
  stub('location', { href: `https://prerender.invalid${path}`, pathname: path, search: '', hash: '' })
  stub('localStorage', undefined)
  const realNow = Date.now
  const realTz = process.env['TZ']
  Date.now = () => now
  // Node reads TZ again whenever it changes; Intl.DateTimeFormat then formats in UTC.
  process.env['TZ'] = 'UTC'
  try {
    return fn()
  } finally {
    Date.now = realNow
    if (realTz === undefined) Reflect.deleteProperty(process.env, 'TZ')
    else process.env['TZ'] = realTz
    for (const [key, d] of saved) {
      if (d) Object.defineProperty(g, key, d)
      else Reflect.deleteProperty(g, key)
    }
  }
}

/**
 * Renders the start screen of App.svelte in each of `langs`, as the page shows it to a first-time
 * visitor at that language's address. `define` must be the build's own constants (__REPO_URL__ and
 * the version), so the footer matches. One Vite server renders every language.
 */
export async function renderHomes (root: string, define: Record<string, unknown>, langs: readonly Lang[]): Promise<Map<Lang, string>> {
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    appType: 'custom',
    define,
    plugins: [svelte()],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const { render } = await server.ssrLoadModule('svelte/server') as typeof import('svelte/server')
    const i18n = await server.ssrLoadModule('/src/i18n/index.ts') as typeof import('../src/i18n/index.ts')
    const App = (await server.ssrLoadModule('/src/App.svelte') as typeof import('../src/App.svelte')).default
    const now = Number(define['__BUILD_TIME__'])
    if (!Number.isFinite(now)) throw new Error('prerender needs __BUILD_TIME__ in define')
    const out = new Map<Lang, string>()
    for (const lang of langs) {
      // As src/main.ts does before it mounts the app: the address's dictionary first.
      await i18n.loadLang(lang, 60_000)
      if (!i18n.isLoaded(lang)) throw new Error(`prerender: cannot load the ${lang} dictionary`)
      // render() computes the markup when `body` is read, so it is read while the globals are set.
      const body = withPrerenderGlobals(now, lang, () => render(App, {}).body)
      out.set(lang, checkPrerendered(trimMarkup(body).trim()))
    }
    return out
  } finally {
    await server.close()
  }
}

/** The Spanish start screen only (ADR 0041). */
export async function renderHome (root: string, define: Record<string, unknown>): Promise<string> {
  const html = (await renderHomes(root, define, ['es'])).get('es')
  if (html === undefined) throw new Error('prerender: no Spanish start screen')
  return html
}
