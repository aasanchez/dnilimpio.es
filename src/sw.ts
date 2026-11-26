// SPDX-License-Identifier: AGPL-3.0-or-later
// Service worker (spec phase 2): makes the app work offline after one visit.
// - Install: downloads every file of this build with fetch({ integrity }), so the browser checks each
//   one against the SHA-384 hash recorded at build time. One bad file and the install fails: the
//   cache only ever holds the exact bytes of one build. Optional parts already saved by the previous
//   build (OCR) are carried over when their bytes still match the new hash.
// - Fetch: deny by default. It answers only the files listed in its manifest, from the cache, and page
//   loads inside its scope, with the cached index.html. On-demand files (ocr/, assets/ml/) are
//   downloaded with their integrity on first use (or when the page asks with a 'prepare' message) and
//   then kept. Every cache hit is hashed again before it is answered: page code shares the origin and
//   can rewrite Cache Storage, so a hit counts only if its bytes still match the manifest. A mismatch
//   is deleted and the same fixed URL is downloaded again with its integrity (or refused offline).
//   Every other request from the page or its workers (OCR) is refused and never reaches the
//   network: another origin, another path, a query string, a method other than GET (route()). There is
//   no exception (ADR 0023).
// - Activate: deletes the caches of older builds. A new build activates once no tab runs the old
//   one, or earlier when the app's only tab is idle and asks for it ('activate' message), so no open
//   page loses files it still needs.
// It never stores user data: images and PDFs live in memory and blob: URLs, which never reach it.
// The build (scripts/vite-plugins.ts) replaces the manifest placeholder below with the file list.

import { CACHE_PREFIX, WORKER_SCRIPTS, cacheName, parseManifest, route, sriOf, workerCsp } from './offline/precache.ts'

const sw = self as unknown as ServiceWorkerGlobalScope

const manifest = parseManifest('__DNI_PRECACHE_MANIFEST__')
const CACHE = cacheName(manifest.version)
const INDEX = new URL('index.html', sw.location.href).href
const urlOf = (path: string): string => new URL(path, sw.location.href).href
/** A file of this build: its absolute URL, taken from the manifest, and its hash. */
interface BuildFile { readonly url: string; readonly integrity: string }
// Keyed by URL. Requests are looked up here, and only the entry's own URL (from the manifest, never
// the request) is cached or downloaded.
const ON_DEMAND = new Map(manifest.onDemand.map((f): [string, BuildFile] => [urlOf(f.path), { url: urlOf(f.path), integrity: f.integrity }]))
const FILES = new Map(manifest.files.map((f): [string, BuildFile] => [urlOf(f.path), { url: urlOf(f.path), integrity: f.integrity }]))
const KNOWN = { files: new Set(FILES.keys()), onDemand: new Set(ON_DEMAND.keys()) }
const WORKERS = new Set(WORKER_SCRIPTS.map(urlOf))

/**
 * The worker scripts get their own CSP header (workerCsp()): a Web Worker takes its policy from its
 * script's response, not from the page. The OCR engine never runs without this worker (ocr.ts), so
 * the policy always applies. The cached copy stays unchanged; only the response given out carries it.
 */
/**
 * Headers GitHub Pages cannot send, added to every page load the worker answers. frame-ancestors only
 * works as a header (a <meta> CSP ignores it): no same-site page may show the app in a frame. A frame
 * on another site gets its own, partitioned worker registration, so it never sees these headers; there
 * the page's own check refuses to start the app (src/security/lockdown.ts), as on a first visit.
 */
const PAGE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

function withPageHeaders (res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(PAGE_HEADERS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

function withWorkerCsp (url: string, res: Response): Response {
  if (!WORKERS.has(url)) return res
  const headers = new Headers(res.headers)
  headers.set('Content-Security-Policy', workerCsp(sw.registration.scope))
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

/**
 * A cache entry, only if its bytes still match the build's hash. Any same-origin script can rewrite
 * Cache Storage (caches.open(...).put(...)), so a hit is checked every time it is answered, not once:
 * a check kept in memory would not see a rewrite made after it. A mismatch is deleted at once. The
 * answer is a new response made from the checked bytes, so what runs is exactly what was hashed. It
 * keeps only the entry's Content-Type: no other header of a rewritten entry reaches the page.
 */
async function verifiedHit (cache: Cache, url: string, integrity: string): Promise<Response | undefined> {
  const hit = await cache.match(url)
  if (!hit) return undefined
  const body = hit.ok ? await hit.arrayBuffer() : undefined
  if (!body || await sriOf(body) !== integrity) {
    await cache.delete(url)
    return undefined
  }
  const headers = new Headers()
  const type = hit.headers.get('Content-Type')
  if (type !== null) headers.set('Content-Type', type)
  return new Response(body, { status: 200, headers })
}

/** Downloads one file of this build from its fixed URL, checked by the browser against its hash, and caches it. */
async function download (cache: Cache, url: string, integrity: string): Promise<Response> {
  const res = await fetch(url, { integrity, cache: 'reload', credentials: 'omit' })
  if (!res.ok) throw new Error(`Download failed: ${url} (${String(res.status)})`)
  await cache.put(url, res.clone())
  return res
}

sw.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    try {
      for (const file of manifest.files) {
        const url = urlOf(file.path)
        const res = await fetch(url, { integrity: file.integrity, cache: 'reload', credentials: 'omit' })
        if (!res.ok) throw new Error(`Precache failed: ${file.path} (${String(res.status)})`)
        await cache.put(url, res)
      }
      // Keep optional files the user already downloaded, if this build ships the same bytes.
      for (const { url, integrity } of ON_DEMAND.values()) {
        const old = await caches.match(url)
        if (old?.ok && await sriOf(await old.clone().arrayBuffer()) === integrity) await cache.put(url, old)
      }
    } catch (e) {
      // Never leave a partial cache behind: the install fails and the app keeps working online.
      // This cache is never the active worker's: the version also covers sw.js itself, so a new
      // worker always has a new cache name (see writePrecacheManifest in scripts/vite-plugins.ts).
      await caches.delete(CACHE)
      throw e
    }
    // No skipWaiting() here: an update waits until every tab of the previous build is closed, so those
    // tabs keep their own worker and cache (including the PDF chunk they may still need to load).
    // The one exception is the 'activate' message below, from the app's only, idle tab.
  })())
})

sw.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key)
    }
    await sw.clients.claim()
  })())
})

/** One on-demand file: from the cache if its bytes still match, else downloaded again with its integrity. */
async function ensureOnDemand (url: string): Promise<Response> {
  const file = ON_DEMAND.get(url)
  if (file === undefined) throw new Error('Not an on-demand file')
  const cache = await caches.open(CACHE)
  return await verifiedHit(cache, file.url, file.integrity) ?? await download(cache, file.url, file.integrity)
}

// The page asks for optional files before using them ({ type: 'prepare', paths }), so a missing
// network or a file that fails its integrity check is reported at once, as one clear error.
// { type: 'status', paths } answers whether all of them are already in this build's cache.
sw.addEventListener('message', (event) => {
  const msg = event.data as { type?: unknown; paths?: unknown } | null
  // { type: 'activate' }: an idle page asks this new build to take over (src/offline/update.ts).
  // Only when that page is the app's only tab, so no other tab loses the files of its build.
  if (msg?.type === 'activate') {
    event.waitUntil((async () => {
      const tabs = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (tabs.length <= 1) await sw.skipWaiting()
    })())
    return
  }
  const port = event.ports[0]
  if (!port || (msg?.type !== 'prepare' && msg?.type !== 'status') || !Array.isArray(msg.paths)) return
  const urls = (msg.paths as unknown[]).filter((p): p is string => typeof p === 'string').map(urlOf)
  event.waitUntil((async () => {
    if (msg.type === 'status') {
      // Only this build's cache counts, and only entries whose bytes still match this worker's hashes
      // (a rewritten entry is deleted): "ready" must mean OCR really works offline. One file at a
      // time, so only one large file is held in memory.
      const cache = await caches.open(CACHE)
      let cached = true
      for (const url of urls) {
        const file = ON_DEMAND.get(url)
        if (file === undefined || await verifiedHit(cache, file.url, file.integrity) === undefined) { cached = false; break }
      }
      port.postMessage({ ok: true, cached })
      return
    }
    try {
      for (const url of urls) await ensureOnDemand(url)
      port.postMessage({ ok: true })
    } catch (e) {
      port.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })())
})

sw.addEventListener('fetch', (event) => {
  const req = event.request
  const to = route(req.method, req.url, req.mode, sw.registration.scope, KNOWN)
  event.respondWith((async () => {
    switch (to.kind) {
      case 'deny':
        // A network error, as if the request had been blocked: nothing is sent.
        return Response.error()
      case 'on-demand':
        return withWorkerCsp(to.url, await ensureOnDemand(to.url))
      case 'index':
      case 'file': {
        const url = to.kind === 'index' ? INDEX : to.url
        const file = FILES.get(url)
        if (file === undefined) return Response.error()
        // A missing or rewritten entry (install saved every file): the same fixed URL again, checked
        // against its hash. Offline, that fails, and the request gets a network error.
        const cache = await caches.open(CACHE)
        const res = await verifiedHit(cache, file.url, file.integrity) ?? await download(cache, file.url, file.integrity)
        return to.kind === 'index' ? withPageHeaders(res) : res
      }
    }
  })())
})
