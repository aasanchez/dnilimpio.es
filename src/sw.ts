// SPDX-License-Identifier: AGPL-3.0-or-later
// Service worker (spec phase 2): makes the app work offline after one visit.
// - Install: downloads every file of this build with fetch({ integrity }), so the browser checks each
//   one against the SHA-384 hash recorded at build time. One bad file and the install fails: the
//   cache only ever holds the exact bytes of one build. Optional parts already saved by the previous
//   build (OCR) are carried over when their bytes still match the new hash.
// - Fetch: answers GET requests inside its scope from that cache; page loads get the cached index.html.
//   On-demand files (ocr/) are downloaded with their integrity on first use (or when the page asks
//   with a 'prepare' message) and then kept.
//   Anything else not in the cache goes to the network as usual (there should be nothing).
// - Activate: deletes the caches of older builds. A new build activates only once no tab runs the
//   old one, so no open page loses files it still needs.
// It never stores user data: images and PDFs live in memory and blob: URLs, which never reach it.
// The build (scripts/vite-plugins.ts) replaces the manifest placeholder below with the file list.

import { CACHE_PREFIX, cacheName, isAppRequest, parseManifest } from './offline/precache.ts'

const sw = self as unknown as ServiceWorkerGlobalScope

const manifest = parseManifest('__DNI_PRECACHE_MANIFEST__')
const CACHE = cacheName(manifest.version)
const INDEX = new URL('index.html', sw.location.href).href
const urlOf = (path: string): string => new URL(path, sw.location.href).href
const ON_DEMAND = new Map(manifest.onDemand.map((f) => [urlOf(f.path), f.integrity]))

/** SHA-384 of a response body, as an SRI string. */
async function sri (res: Response): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-384', await res.arrayBuffer()))
  let bin = ''
  for (const b of digest) bin += String.fromCharCode(b)
  return `sha384-${btoa(bin)}`
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
      for (const [url, integrity] of ON_DEMAND) {
        const old = await caches.match(url)
        if (old && await sri(old.clone()) === integrity) await cache.put(url, old)
      }
    } catch (e) {
      // Never leave a partial cache behind: the install fails and the app keeps working online.
      // This cache is never the active worker's: the version also covers sw.js itself, so a new
      // worker always has a new cache name (see writePrecacheManifest in scripts/vite-plugins.ts).
      await caches.delete(CACHE)
      throw e
    }
    // No skipWaiting(): an update waits until every tab of the previous build is closed, so those
    // tabs keep their own worker and cache (including the PDF chunk they may still need to load).
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

/** Downloads (if needed) and caches one on-demand file, checked against its hash. */
async function ensureOnDemand (url: string): Promise<Response> {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(url)
  if (hit) return hit
  const integrity = ON_DEMAND.get(url)
  if (integrity === undefined) throw new Error(`Not an on-demand file: ${url}`)
  // The browser checks the bytes against the build's hash before we keep them.
  const res = await fetch(url, { integrity, cache: 'reload', credentials: 'omit' })
  if (!res.ok) throw new Error(`Download failed: ${url} (${String(res.status)})`)
  await cache.put(url, res.clone())
  return res
}

// The page asks for optional files before using them ({ type: 'prepare', paths }), so a missing
// network or a file that fails its integrity check is reported at once, as one clear error.
sw.addEventListener('message', (event) => {
  const msg = event.data as { type?: unknown; paths?: unknown } | null
  const port = event.ports[0]
  if (!port || msg?.type !== 'prepare' || !Array.isArray(msg.paths)) return
  const urls = (msg.paths as unknown[]).filter((p): p is string => typeof p === 'string').map(urlOf)
  event.waitUntil((async () => {
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
  if (!isAppRequest(req.method, req.url, sw.registration.scope)) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const key = req.mode === 'navigate' ? INDEX : req.url.split('#')[0] ?? req.url
    const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' })
    if (hit) return hit
    if (!ON_DEMAND.has(key)) return await fetch(req)
    return await ensureOnDemand(key)
  })())
})
