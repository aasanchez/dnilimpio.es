// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure helpers shared by the service worker and the build: no DOM, no worker globals, tested in Node.

export interface PrecacheFile { readonly path: string; readonly integrity: string }
/**
 * Cloudflare's analytics beacon and the address it reports to (ADR 0015). The build writes them into
 * the manifest from src/analytics/endpoints.ts, so the worker shares no code chunk with the page.
 */
export interface AnalyticsUrls { readonly script: string; readonly endpoint: string }
export interface PrecacheManifest {
  readonly version: string
  /** Saved at install: the app itself. */
  readonly files: readonly PrecacheFile[]
  /** Saved on first use only (large optional parts: OCR, corner model), still checked against their hash. */
  readonly onDemand: readonly PrecacheFile[]
  /**
   * Source maps of the files above (ADR 0016): fetched from the network for DevTools when asked,
   * checked against their hash, never cached. Absent: the worker refuses every .map request.
   */
  readonly sourceMaps?: readonly PrecacheFile[]
  /** Absent: the worker lets nothing through to another origin. */
  readonly analytics?: AnalyticsUrls
}

export const CACHE_PREFIX = 'dnilimpio-'
export const cacheName = (version: string): string => `${CACHE_PREFIX}${version}`

/** Path of the service worker next to index.html. Never precached: the browser checks it for updates. */
export const SW_FILE = 'sw.js'

/** Folder of the OCR engine and language data (large, downloaded on first use). */
export const ON_DEMAND_DIR = 'ocr/'
/** Folder of the corner model and its runtime (about 2.6 MB, downloaded on first use; ADR 0007). */
export const MODEL_DIR = 'assets/ml/'

/** Files that belong in the offline cache: everything the build wrote except source maps and the worker. */
export function isPrecached (path: string): boolean {
  return path !== SW_FILE && !path.endsWith('.map') && !path.startsWith('.')
}

/** A published source map (ADR 0016): `<file>.map`, next to the file it describes. */
export const isSourceMap = (path: string): boolean => path.endsWith('.map') && !path.startsWith('.') && path !== `${SW_FILE}.map`

/** Cached on first use instead of at install. */
export const isOnDemand = (path: string): boolean => path.startsWith(ON_DEMAND_DIR) || path.startsWith(MODEL_DIR)

/** Parses and checks the manifest the build inlines into the worker. Throws on anything unexpected. */
export function parseManifest (json: string): PrecacheManifest {
  const m = JSON.parse(json) as { version?: unknown; files?: unknown; onDemand?: unknown; sourceMaps?: unknown; analytics?: unknown }
  if (typeof m.version !== 'string' || !/^[0-9a-f]{16,}$/.test(m.version)) throw new Error('Bad precache version')
  if (!Array.isArray(m.files) || m.files.length === 0) throw new Error('Empty precache manifest')
  const files = checkFiles(m.files as unknown[])
  const onDemand = checkFiles(Array.isArray(m.onDemand) ? m.onDemand as unknown[] : [])
  if (files.some((f) => isOnDemand(f.path)) || onDemand.some((f) => !isOnDemand(f.path))) throw new Error('Bad precache path')
  const out: PrecacheManifest = { version: m.version, files, onDemand }
  if (m.sourceMaps !== undefined) {
    if (!Array.isArray(m.sourceMaps)) throw new Error('Bad source map list')
    // Only the map of a file of this build: `<path>.map` for a listed path.
    const described = new Set([...files, ...onDemand].map((f) => `${f.path}.map`))
    const sourceMaps = checkFiles(m.sourceMaps as unknown[], isSourceMap)
    if (sourceMaps.some((f) => !described.has(f.path))) throw new Error('Bad source map path')
    Object.assign(out, { sourceMaps })
  }
  if (m.analytics !== undefined) Object.assign(out, { analytics: checkAnalytics(m.analytics) })
  return out
}

/** Two plain https addresses: no query string, no fragment, no credentials. */
function checkAnalytics (a: unknown): AnalyticsUrls {
  const { script, endpoint } = (a ?? {}) as { script?: unknown; endpoint?: unknown }
  const plain = (u: unknown): u is string => {
    if (typeof u !== 'string') return false
    try {
      const url = new URL(u)
      return url.protocol === 'https:' && url.href === u && url.search === '' && url.hash === '' && url.username === '' && url.password === ''
    } catch {
      return false
    }
  }
  if (!plain(script) || !plain(endpoint)) throw new Error('Bad analytics URL')
  return { script, endpoint }
}

function checkFiles (list: unknown[], allowed: (path: string) => boolean = isPrecached): PrecacheFile[] {
  return list.map((f): PrecacheFile => {
    const { path, integrity } = (f ?? {}) as { path?: unknown; integrity?: unknown }
    if (typeof path !== 'string' || !allowed(path) || path.startsWith('/') || path.includes('..')) throw new Error('Bad precache path')
    if (typeof integrity !== 'string' || !/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity)) throw new Error('Bad precache integrity')
    return { path, integrity }
  })
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
  return [
    "default-src 'none'",
    // importScripts() of the engine; the engine compiles its WebAssembly (no eval()).
    `script-src ${ocr} 'wasm-unsafe-eval'`,
    // The language data, read with fetch().
    `connect-src ${ocr}`,
  ].join('; ')
}

/** What the service worker does with one request (see route()). */
export type Route =
  /** A page load inside the scope: answer with the cached index.html. */
  | { readonly kind: 'index' }
  /** A file of this build, saved at install. */
  | { readonly kind: 'file'; readonly url: string }
  /** A file of this build that is saved on first use (OCR, corner model). */
  | { readonly kind: 'on-demand'; readonly url: string }
  /**
   * The source map of a file of this build (ADR 0016), for the browser's developer tools: fetched
   * from the network with its hash, never cached. A query string or any other .map is refused.
   */
  | { readonly kind: 'source-map'; readonly url: string }
  /**
   * Cloudflare's analytics beacon and its page-view report (ADR 0015): left to the browser, which
   * sends it to the network as usual (and fails quietly offline). Nothing else is.
   */
  | { readonly kind: 'analytics' }
  /** Anything else: refused, it never reaches the network. */
  | { readonly kind: 'deny' }

export interface KnownFiles {
  /** Absolute URLs of the files saved at install. */
  readonly files: ReadonlySet<string>
  /** Absolute URLs of the files saved on first use. */
  readonly onDemand: ReadonlySet<string>
  /** Absolute URLs of the published source maps (ADR 0016). */
  readonly sourceMaps?: ReadonlySet<string> | undefined
  /** The analytics beacon and its report address, left to the network (ADR 0015). */
  readonly analytics?: AnalyticsUrls | undefined
}

/**
 * Deny by default: the worker answers only the files of this build, listed in its manifest, and page
 * loads inside its scope. Every other request from the page or its workers (another origin, another
 * path, a query string, a method other than GET) is refused without touching the network, so no code
 * can send data out by encoding it in a request, even a same-origin one.
 */
export function route (method: string, url: string, mode: string, scope: string, known: KnownFiles): Route {
  if (known.analytics && isAnalytics(method, url, known.analytics)) return { kind: 'analytics' }
  if (method !== 'GET' || !url.startsWith(scope)) return { kind: 'deny' }
  const key = url.split('#')[0] ?? url
  // A page load may carry a query string or a path of its own: it always gets index.html.
  if (mode === 'navigate') return { kind: 'index' }
  if (known.files.has(key)) return { kind: 'file', url: key }
  if (known.onDemand.has(key)) return { kind: 'on-demand', url: key }
  if (known.sourceMaps?.has(key) === true) return { kind: 'source-map', url: key }
  return { kind: 'deny' }
}

/**
 * The only requests outside the app's own files that the service worker lets through: GET of the
 * beacon script at its exact address, and the beacon's report (POST, or GET for old browsers) to its
 * exact path. A query string is refused on the script, allowed on the report.
 */
export function isAnalytics (method: string, url: string, analytics: AnalyticsUrls): boolean {
  if (method === 'GET' && url === analytics.script) return true
  if (method !== 'POST' && method !== 'GET') return false
  return url.split(/[?#]/)[0] === analytics.endpoint
}
