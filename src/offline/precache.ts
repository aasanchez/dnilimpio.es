// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure helpers shared by the service worker and the build: no DOM, no worker globals, tested in Node.

import { INDEX_FILE, articleRoute, isArticleFile, isArticlePage } from '../articles/paths.ts'
import { NOT_FOUND_FILE } from '../notfound/file.ts'

export interface PrecacheFile { readonly path: string; readonly integrity: string }
export interface PrecacheManifest {
  readonly version: string
  /** Saved at install: the app itself. */
  readonly files: readonly PrecacheFile[]
  /** Saved on first use only (large optional parts: OCR, corner model), still checked against their hash. */
  readonly onDemand: readonly PrecacheFile[]
}

export const CACHE_PREFIX = 'dnilimpio-'
export const cacheName = (version: string): string => `${CACHE_PREFIX}${version}`

/** Path of the service worker next to index.html. Never precached: the browser checks it for updates. */
export const SW_FILE = 'sw.js'

/**
 * The thanks page (ADR 0029): the photo-free page the app opens from "Send anonymous data". It is the
 * only page that may send anything: the opt-in usage stats, to STATS_ENDPOINT.
 */
export const THANKS_PAGE = 'thanks.html'
/**
 * The card guide pages (ADR 0040): one static page per document, written at build time from the
 * guide data (src/guide/page.ts). They hold no photo and run no script. The service worker serves
 * them as pages; every other page load gets index.html.
 */
export const GUIDE_PAGES = ['guia-dni-4.html', 'guia-dni-3.html', 'guia-tie.html'] as const
export type GuidePage = (typeof GUIDE_PAGES)[number]

/**
 * The address of every language but Spanish (ADR 0038): its tag in lowercase. Each has a start page
 * of its own, `<segment>.html`, with the start screen and head in that language (ADR 0044). The list
 * is written out here because sw.js may share no module with the app; a unit test checks that it
 * equals LANGS in src/i18n/langs.ts.
 */
export const LANGUAGE_SEGMENTS = ['ca', 'ca-es-valencia', 'gl', 'eu', 'en', 'fr', 'nl', 'sv', 'fi', 'uk', 'ro', 'ar'] as const

/** File name of a language's start page, next to index.html: `en.html` for the address `en`. */
export const languagePage = (segment: string): string => `${segment}.html`

/** A page of its own next to index.html: a page load of exactly its path gets it, not the app. */
export interface StaticPage {
  readonly path: string
  /**
   * Saved on its first visit instead of at install, still checked against its hash. For pages that
   * are many or large; none is yet.
   */
  readonly onDemand?: boolean
}

/**
 * Whether a window can answer the service worker's "idle?" question (src/sw.ts): whether its address
 * shows the app (index.html or a language page) or the thanks page, which run the app's code. A guide
 * page, an article and a not-found page run no script, so they never answer; they hold no photo and
 * load nothing later, so they count as idle and never hold an update back.
 */
export function answersIdle (url: string, scope: string, known: KnownFiles): boolean {
  const to = route('GET', url, 'navigate', scope, known)
  if (to.kind === 'index') return true
  if (to.kind !== 'page') return false
  const file = to.url.slice(scope.length)
  return file === THANKS_PAGE || (LANGUAGE_SEGMENTS as readonly string[]).some((s) => languagePage(s) === file)
}

/** Every static page of the site. Every other page load inside the scope gets index.html. */
export const STATIC_PAGES: readonly StaticPage[] = [
  { path: THANKS_PAGE },
  ...GUIDE_PAGES.map((path) => ({ path })),
]

/** Where the thanks page sends the opt-in stats (worker/index.ts), relative to the app's folder. */
export const STATS_ENDPOINT = 'stats'

/** Folder of the OCR engine and language data (large, downloaded on first use). */
export const ON_DEMAND_DIR = 'ocr/'
/** Folder of the corner model and its runtime (about 2.6 MB, downloaded on first use; ADR 0007). */
export const MODEL_DIR = 'assets/ml/'

/**
 * Files that belong in the offline cache: everything the build wrote except the worker and dotfiles.
 * That includes robots.txt, sitemap.xml and the link preview image (src/seo/site.ts): a page the
 * worker controls reaches them only through route(), like every other file of the build.
 * The build publishes no source maps (ADR 0022) and refuses to finish if one exists; a `.map` is
 * never listed, so the worker refuses it like any unknown path.
 */
export function isPrecached (path: string): boolean {
  return path !== SW_FILE && !path.endsWith('.map') && !path.startsWith('.')
}

/**
 * Content-Type of each kind of file the build writes, by extension. The service worker answers a
 * cache hit with this type, never with the type stored beside the cached bytes: page code can
 * rewrite Cache Storage, and the SHA-384 check covers the bytes only, not the headers (audit F-06).
 * The build fails on a file whose extension is not listed here (checkFiles()).
 */
export const CONTENT_TYPES: Readonly<Record<string, string>> = {
  avif: 'image/avif',
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  onnx: 'application/octet-stream',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  wasm: 'application/wasm',
  webmanifest: 'application/manifest+json',
  webp: 'image/webp',
  woff2: 'font/woff2',
  xml: 'application/xml; charset=utf-8',
}

/**
 * The fixed Content-Type of a build file (CONTENT_TYPES), from its path relative to the site's
 * folder, or undefined for an unknown extension. An article has no extension and is HTML, as the host
 * sends it (ADR 0039).
 */
export function contentTypeOf (path: string): string | undefined {
  if (isArticlePage(path) && !path.endsWith(INDEX_FILE)) return CONTENT_TYPES['html']
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return undefined
  const ext = name.slice(dot + 1).toLowerCase()
  return Object.hasOwn(CONTENT_TYPES, ext) ? CONTENT_TYPES[ext] : undefined
}

/** Cached on first use instead of at install. */
export const isOnDemand = (path: string): boolean =>
  path.startsWith(ON_DEMAND_DIR) || path.startsWith(MODEL_DIR) || STATIC_PAGES.some((p) => p.onDemand === true && p.path === path) ||
  // The articles and their images (ADR 0039): saved when first read, so the install stays the same
  // size however many articles there are.
  isArticleFile(path)

/** Parses and checks the manifest the build inlines into the worker. Throws on anything unexpected. */
export function parseManifest (json: string): PrecacheManifest {
  const m = JSON.parse(json) as { version?: unknown; files?: unknown; onDemand?: unknown }
  if (typeof m.version !== 'string' || !/^[0-9a-f]{16,}$/.test(m.version)) throw new Error('Bad precache version')
  if (!Array.isArray(m.files) || m.files.length === 0) throw new Error('Empty precache manifest')
  const files = checkFiles(m.files as unknown[])
  const onDemand = checkFiles(Array.isArray(m.onDemand) ? m.onDemand as unknown[] : [])
  if (files.some((f) => isOnDemand(f.path)) || onDemand.some((f) => !isOnDemand(f.path))) throw new Error('Bad precache path')
  return { version: m.version, files, onDemand }
}

function checkFiles (list: unknown[]): PrecacheFile[] {
  return list.map((f): PrecacheFile => {
    const { path, integrity } = (f ?? {}) as { path?: unknown; integrity?: unknown }
    if (typeof path !== 'string' || !isPrecached(path) || path.startsWith('/') || path.includes('..')) throw new Error('Bad precache path')
    if (typeof integrity !== 'string' || !/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity)) throw new Error('Bad precache integrity')
    if (contentTypeOf(path) === undefined) throw new Error(`No Content-Type for ${path}`)
    return { path, integrity }
  })
}

/**
 * SHA-384 of some bytes, as an SRI string (`sha384-…`), the form the manifest records. Web Crypto, so
 * the service worker and the unit tests in Node use the same code.
 */
export async function sriOf (bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-384', bytes))
  let bin = ''
  for (const b of digest) bin += String.fromCharCode(b)
  return `sha384-${btoa(bin)}`
}

/**
 * Browser features the app may use. Every other powerful feature is off, also for any frame.
 * camera: live capture (src/capture/live.ts). clipboard-write: copy the audit prompt.
 * web-share: share the PDF on phones (Review.svelte).
 */
export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'browsing-topics=()',
  'camera=(self)',
  'clipboard-read=()',
  'clipboard-write=(self)',
  'display-capture=()',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'serial=()',
  'usb=()',
  'web-share=(self)',
].join(', ')

/**
 * Security headers of every response, apart from the CSP and HSTS. One list for the two places that
 * send them: the host (scripts/headers.ts, ADR 0027) and the service worker (PAGE_HEADERS).
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': PERMISSIONS_POLICY,
  // No other window keeps a handle on the app's window, and no other site may embed its files.
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // For browsers without frame-ancestors.
  'X-Frame-Options': 'DENY',
}

/**
 * Headers of every page load the service worker answers. The worker answers from its cache and keeps
 * none of the cached entry's headers (ADR 0026), so it sets the security headers itself: a returning
 * visitor gets the same ones as a first visit from the host, and gets them on a host that sends none.
 * The full CSP is the page's own <meta> policy; frame-ancestors is added here because a <meta> CSP
 * ignores it. A frame on another site gets its own, partitioned worker registration, so it never
 * sees these headers; there the host's headers (ADR 0027) or the page's own check
 * (src/security/lockdown.ts) refuse it.
 */
export const PAGE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  ...SECURITY_HEADERS,
}

/**
 * The response's own headers plus PAGE_HEADERS. The CSP is added as one more policy, never in place
 * of one the response carries: a browser enforces every policy it gets, so when the worker passes on
 * a fresh download from the host, the host's full CSP (ADR 0027) stays in force.
 */
export function addPageHeaders (from: Headers): Headers {
  const headers = new Headers(from)
  for (const [k, v] of Object.entries(PAGE_HEADERS)) {
    if (k === 'Content-Security-Policy') headers.append(k, v)
    else headers.set(k, v)
  }
  return headers
}

/** Scripts the app starts as Web Workers (see workerCsp()). */
export const WORKER_SCRIPTS: readonly string[] = [`${ON_DEMAND_DIR}worker.min.js`]

/**
 * Content-Security-Policy for the OCR worker. A worker does not inherit the page's CSP: it gets the
 * policy of its own script's response, and GitHub Pages sends none. The service worker adds this one
 * when it serves the worker script, so the OCR engine (third-party code that sees the image) may load
 * only its own files from ocr/ and can send nothing anywhere else.
 */
export function workerCsp (scope: string): string {
  const ocr = `${scope}${ON_DEMAND_DIR}`
  // The service worker's own script, by its exact address (ADR 0037): Firefox checks a response the
  // service worker builds (every checked cache hit, src/sw.ts) as if it came from sw.js. Without it,
  // Firefox blocks the engine's files and OCR fails. sw.js loads and sends nothing itself.
  const sw = `${scope}${SW_FILE}`
  return [
    "default-src 'none'",
    // importScripts() of the engine; the engine compiles its WebAssembly (no eval()).
    `script-src ${ocr} ${sw} 'wasm-unsafe-eval'`,
    // The models and the language data, read with fetch().
    `connect-src ${ocr} ${sw}`,
  ].join('; ')
}

/** What the service worker does with one request (see route()). */
export type Route =
  /** A page load inside the scope: answer with the cached index.html. */
  | { readonly kind: 'index' }
  /**
   * A page load of a language folder with a slash (`en/`), or of `es`: sent to the language's own
   * address (`en`, or the site address for Spanish, ADR 0038), as the host does.
   */
  | { readonly kind: 'redirect'; readonly url: string }
  /**
   * A page load of a static page (STATIC_PAGES) of this build, or of a language's address, which
   * gets that language's start page (ADR 0044): answer with that page.
   */
  | { readonly kind: 'page'; readonly url: string; readonly onDemand: boolean }
  /**
   * A page load of an address the build does not have: answer with that not-found page (ADR 0045),
   * with status 404.
   */
  | { readonly kind: 'not-found'; readonly url: string }
  /** The thanks page sends the opt-in stats: passed on to the network, unchanged (ADR 0029). */
  | { readonly kind: 'stats' }
  /** A file of this build, saved at install. */
  | { readonly kind: 'file'; readonly url: string }
  /** A file of this build that is saved on first use (OCR, corner model). */
  | { readonly kind: 'on-demand'; readonly url: string }
  /** Anything else: refused, it never reaches the network. */
  | { readonly kind: 'deny' }

export interface KnownFiles {
  /** Absolute URLs of the files saved at install. */
  readonly files: ReadonlySet<string>
  /** Absolute URLs of the files saved on first use. */
  readonly onDemand: ReadonlySet<string>
}

/**
 * Where a page load of `url` must go instead (ADR 0038), or null. The address of a language has no
 * trailing slash, because the page's relative URLs must point at the app's own folder: `<scope>en/`
 * goes to `<scope>en`. Spanish is the site address: `<scope>es` and `<scope>es/` go to `<scope>`. Only
 * one path segment counts, and the query and fragment are kept.
 */
export function languageRedirect (url: string, scope: string): string | null {
  const u = new URL(url)
  const scopePath = new URL(scope).pathname
  if (!u.pathname.startsWith(scopePath)) return null
  const rest = u.pathname.slice(scopePath.length)
  const m = /^([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)(\/?)$/.exec(rest)
  if (m === null) return null
  const segment = m[1] ?? ''
  const slash = m[2] ?? ''
  const tail = `${u.search}${u.hash}`
  if (segment.toLowerCase() === 'es') return `${scope}${tail}`
  return slash === '/' ? `${scope}${segment}${tail}` : null
}

/**
 * What the host has at `rest` (a path inside the scope, no query), for a page load: an article or a
 * list of articles (ADR 0039), a static page (STATIC_PAGES) or another file of this build. Null when
 * the build has nothing there.
 */
function hostPage (rest: string, scope: string, known: KnownFiles): Route | null {
  // `articles` goes to `articles/`, which is the file `articles/index.html`.
  const article = articleRoute(rest)
  if (article !== null) {
    if ('redirect' in article) return { kind: 'redirect', url: `${scope}${article.redirect}` }
    const file = `${scope}${article.file}`
    return known.onDemand.has(file) ? { kind: 'page', url: file, onDemand: true } : null
  }
  const url = `${scope}${rest}`
  const isPage = STATIC_PAGES.some((p) => p.path === rest)
  if (known.files.has(url)) return isPage ? { kind: 'page', url, onDemand: false } : { kind: 'file', url }
  if (known.onDemand.has(url)) return isPage ? { kind: 'page', url, onDemand: true } : { kind: 'on-demand', url }
  return null
}

/**
 * The not-found page for `rest` (ADR 0045): the `404.html` of the nearest folder above it that has
 * one, as the host picks it. A build with none (an older one) gets the app, as before.
 */
function notFound (rest: string, scope: string, known: KnownFiles): Route {
  let folder = rest.slice(0, rest.lastIndexOf('/') + 1)
  for (;;) {
    const url = `${scope}${folder}${NOT_FOUND_FILE}`
    if (known.files.has(url)) return { kind: 'not-found', url }
    if (folder === '') return { kind: 'index' }
    folder = folder.slice(0, folder.slice(0, -1).lastIndexOf('/') + 1)
  }
}

/**
 * Deny by default: the worker answers only the files of this build, listed in its manifest, and page
 * loads inside its scope. Every other request from the page or its workers (another origin, another
 * path, a query string, a method other than GET) is refused without touching the network, so no code
 * can send data out by encoding it in a request, even a same-origin one.
 * The one exception (ADR 0029): a POST to STATS_ENDPOINT whose sender is the thanks page itself
 * (`client`, the URL of the window that made the request). The app's own page never gets it: its
 * CSP already refuses every connection, and this check refuses it a second time.
 */
export function route (method: string, url: string, mode: string, scope: string, known: KnownFiles, client = ''): Route {
  const thanks = `${scope}${THANKS_PAGE}`
  if (method === 'POST' && mode !== 'navigate' && url === `${scope}${STATS_ENDPOINT}` && client.split('#')[0] === thanks) return { kind: 'stats' }
  if (method !== 'GET' || !url.startsWith(scope)) return { kind: 'deny' }
  const key = url.split('#')[0] ?? url
  // A page load is answered as the host answers it (ADR 0045): the app, a language's page, a static
  // page or another file of this build, and the nearest not-found page for anything else.
  if (mode === 'navigate') {
    const to = languageRedirect(key, scope)
    if (to !== null) return { kind: 'redirect', url: to }
    const q = key.indexOf('?')
    const rest = (q === -1 ? key : key.slice(0, q)).slice(scope.length)
    // A language's address, as the host answers it: its own start page (ADR 0044). The query does
    // not count, as on the host. Its file name shows the same page.
    const segment = rest.endsWith('.html') ? rest.slice(0, -'.html'.length) : rest
    if ((LANGUAGE_SEGMENTS as readonly string[]).includes(segment) && known.files.has(`${scope}${languagePage(segment)}`)) {
      return { kind: 'page', url: `${scope}${languagePage(segment)}`, onDemand: false }
    }
    // The app's own address, with any query.
    if (rest === '' || rest === 'index.html') return { kind: 'index' }
    const found = hostPage(rest, scope, known)
    if (found !== null) {
      // A query string can carry data: it gets the app, never another page or file.
      return q === -1 ? found : { kind: 'index' }
    }
    return notFound(rest, scope, known)
  }
  if (known.files.has(key)) return { kind: 'file', url: key }
  if (known.onDemand.has(key)) return { kind: 'on-demand', url: key }
  return { kind: 'deny' }
}
