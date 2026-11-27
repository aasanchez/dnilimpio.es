// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure helpers shared by the service worker and the build: no DOM, no worker globals, tested in Node.

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
 * The thanks page (ADR 0029): the photo-free page the app opens after "Clear everything". It is the
 * only page that may send anything: the opt-in usage stats, to STATS_ENDPOINT.
 */
export const THANKS_PAGE = 'thanks.html'
/** Where the thanks page sends the opt-in stats (worker/index.ts), relative to the app's folder. */
export const STATS_ENDPOINT = 'stats'

/** Folder of the OCR engine and language data (large, downloaded on first use). */
export const ON_DEMAND_DIR = 'ocr/'
/** Folder of the corner model and its runtime (about 2.6 MB, downloaded on first use; ADR 0007). */
export const MODEL_DIR = 'assets/ml/'

/**
 * Files that belong in the offline cache: everything the build wrote except the worker and dotfiles.
 * The build publishes no source maps (ADR 0022) and refuses to finish if one exists; a `.map` is
 * never listed, so the worker refuses it like any unknown path.
 */
export function isPrecached (path: string): boolean {
  return path !== SW_FILE && !path.endsWith('.map') && !path.startsWith('.')
}

/** Cached on first use instead of at install. */
export const isOnDemand = (path: string): boolean => path.startsWith(ON_DEMAND_DIR) || path.startsWith(MODEL_DIR)

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
  /** A page load of the thanks page: answer with the cached thanks.html. */
  | { readonly kind: 'thanks'; readonly url: string }
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
  // A page load may carry a query string or a path of its own: it gets index.html, unless it is
  // exactly the thanks page.
  if (mode === 'navigate') return key === thanks && known.files.has(thanks) ? { kind: 'thanks', url: thanks } : { kind: 'index' }
  if (known.files.has(key)) return { kind: 'file', url: key }
  if (known.onDemand.has(key)) return { kind: 'on-demand', url: key }
  return { kind: 'deny' }
}
