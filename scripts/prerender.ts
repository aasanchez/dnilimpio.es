// SPDX-License-Identifier: AGPL-3.0-or-later
// Prerendered start screen (ADR 0041). At build time the app's own App.svelte is rendered once, in
// Spanish, to plain HTML, and that HTML goes inside <main id="app"> in dist/index.html. Search
// engines and link previews that run no JavaScript then read the real start screen, and the browser
// paints the heading before any script runs. src/main.ts clears it and mounts the live app.
//
// The output is checked: no inline script, no style attribute, no inline event handler. The page's
// CSP (scripts/csp.ts) and Trusted Types rules hold unchanged.

import { createServer } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

/** What prerendered markup must never hold. Each one would break the CSP or the promise of rule 3. */
const FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/<script\b/i, 'a script element'],
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
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<dialog\b[\s\S]*?<\/dialog>/g, '')
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
 * The browser objects the start screen reads while it renders, set to a fixed Spanish browser that
 * is not installed, not on iOS and has no stored notice date. The clock reads `now`, the build time,
 * and the time zone is UTC, so the footer's "deployed" time is the same in every rebuild, on any
 * machine (the reproducible build). Only for the duration of render().
 */
function withPrerenderGlobals<T> (now: number, fn: () => T): T {
  const g = globalThis as Record<string, unknown>
  const saved = new Map<string, PropertyDescriptor | undefined>()
  const stub = (key: string, value: unknown): void => {
    saved.set(key, Object.getOwnPropertyDescriptor(g, key))
    Object.defineProperty(g, key, { value, configurable: true, writable: true })
  }
  stub('navigator', { language: 'es', languages: ['es'], userAgent: '', maxTouchPoints: 0 })
  stub('window', { matchMedia: () => ({ matches: false }) })
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
 * Renders the start screen of App.svelte in Spanish, as the page shows it to a first-time visitor.
 * `define` must be the build's own constants (__REPO_URL__ and the version), so the footer matches.
 */
export async function renderHome (root: string, define: Record<string, unknown>): Promise<string> {
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
    const App = (await server.ssrLoadModule('/src/App.svelte') as typeof import('../src/App.svelte')).default
    // render() computes the markup when `body` is read, so it is read while the globals are set.
    const now = Number(define['__BUILD_TIME__'])
    if (!Number.isFinite(now)) throw new Error('prerender needs __BUILD_TIME__ in define')
    const body = withPrerenderGlobals(now, () => render(App, {}).body)
    return checkPrerendered(trimMarkup(body).trim())
  } finally {
    await server.close()
  }
}
