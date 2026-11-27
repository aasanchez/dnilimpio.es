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
//   network: another origin, another path, a query string, a method other than GET (route()). The one
//   exception is the opt-in usage stats, sent only by the photo-free thanks page (ADR 0029).
// - Activate: deletes the caches of older builds. A new build activates once no tab runs the old
//   one, or earlier when an idle page asks for it ('activate' message) and every other window of the
//   app answers that it is idle too, or when the person presses "Update now" (src/offline/takeover.ts).
// It never stores user data: images and PDFs live in memory and blob: URLs, which never reach it.
// The build (scripts/vite-plugins.ts) replaces the manifest placeholder below with the file list.

import { ANSWER_TIMEOUT_MS, mayTakeOver, type WindowAnswer } from './offline/takeover.ts'
import { CACHE_PREFIX, WORKER_SCRIPTS, addPageHeaders, answersIdle, cacheName, parseManifest, route, sriOf, workerCsp } from './offline/precache.ts'

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

/** index.html with PAGE_HEADERS added to the host's headers (addPageHeaders()). */
function withPageHeaders (res: Response): Response {
  // A network error stays one: it has no headers to add, and status 0 cannot be copied.
  if (res.type === 'error') return res
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: addPageHeaders(res.headers) })
}

/**
 * The worker scripts get their own CSP header (workerCsp()): a Web Worker takes its policy from its
 * script's response, not from the page. The OCR engine never runs without this worker (ocr.ts), so
 * the policy always applies. The cached copy stays unchanged; only the response given out carries it.
 */
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
    // The exception is the 'activate' message below: every window idle, or the person asked.
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

/**
 * Asks one window of the app whether it is idle (src/offline/update.ts answers). A window frozen in
 * the background runs no code and never answers: after ANSWER_TIMEOUT_MS it counts as 'silent'.
 */
async function askWindow (client: Client): Promise<WindowAnswer> {
  return await new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => { resolve('silent') }, ANSWER_TIMEOUT_MS)
    channel.port1.onmessage = (e: MessageEvent<unknown>) => {
      clearTimeout(timer)
      resolve((e.data as { idle?: unknown } | null)?.idle === true ? 'idle' : 'busy')
    }
    client.postMessage({ type: 'idle?' }, [channel.port2])
  })
}

// The page asks for optional files before using them ({ type: 'prepare', paths }), so a missing
// network or a file that fails its integrity check is reported at once, as one clear error.
// { type: 'status', paths } answers whether all of them are already in this build's cache.
sw.addEventListener('message', (event) => {
  const msg = event.data as { type?: unknown; paths?: unknown; force?: unknown } | null
  // { type: 'activate' }: an idle page asks this new build to take over (src/offline/update.ts).
  // It does only if every other window of the app answers that it is idle, so no window loses the
  // files of its build while it works. { type: 'activate', force: true }: the person pressed
  // "Update now"; it takes over at once (src/offline/takeover.ts). The answer says which happened.
  if (msg?.type === 'activate') {
    const reply = event.ports[0]
    const from = event.source instanceof Client ? event.source : undefined
    event.waitUntil((async () => {
      let answers: WindowAnswer[] = []
      if (msg.force !== true) {
        const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true })
        // A guide page runs no script, so it cannot answer; it holds nothing an update could break.
        answers = await Promise.all(windows.filter((c) => c.id !== from?.id && answersIdle(c.url, sw.registration.scope)).map(askWindow))
        // The asking page too, last: it may have left the start screen while the others answered.
        if (from !== undefined) answers.push(await askWindow(from))
      }
      const activated = mayTakeOver(answers, msg.force === true)
      if (activated) await sw.skipWaiting()
      reply?.postMessage({ activated })
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

/**
 * A file saved at install. A missing or rewritten entry gets the same fixed URL again, checked against
 * its hash. Offline, that fails, and the request gets a network error.
 */
async function fromCache (url: string): Promise<Response> {
  const file = FILES.get(url)
  if (file === undefined) return Response.error()
  const cache = await caches.open(CACHE)
  return await verifiedHit(cache, file.url, file.integrity) ?? await download(cache, file.url, file.integrity)
}

sw.addEventListener('fetch', (event) => {
  const req = event.request
  event.respondWith((async () => {
    // Who sent it matters only for a POST: the one allowed is the thanks page's stats (route()).
    const client = req.method === 'POST' && event.clientId !== '' ? await sw.clients.get(event.clientId) : undefined
    const to = route(req.method, req.url, req.mode, sw.registration.scope, KNOWN, client?.url ?? '')
    switch (to.kind) {
      case 'deny':
        // A network error, as if the request had been blocked: nothing is sent.
        return Response.error()
      case 'redirect':
        return Response.redirect(to.url, 301)
      case 'stats':
        // The opt-in stats of the thanks page (ADR 0029), as the page sent them, without cookies.
        return await fetch(req, { credentials: 'omit' })
      case 'on-demand':
        return withWorkerCsp(to.url, await ensureOnDemand(to.url))
      case 'page':
        // A static page: saved at install, or on its first visit (StaticPage.onDemand).
        return withPageHeaders(to.onDemand ? await ensureOnDemand(to.url) : await fromCache(to.url))
      case 'index':
        return withPageHeaders(await fromCache(INDEX))
      case 'file':
        return await fromCache(to.url)
    }
  })())
})
