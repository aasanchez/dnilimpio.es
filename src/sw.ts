// SPDX-License-Identifier: AGPL-3.0-or-later
// Service worker (spec phase 2): makes the app work offline after one visit.
// - Install: downloads every file of this build with fetch({ integrity }), so the browser checks each
//   one against the SHA-384 hash recorded at build time. One bad file and the install fails: the
//   cache only ever holds the exact bytes of one build.
// - Fetch: answers GET requests inside its scope from that cache; page loads get the cached index.html.
//   Anything not in the cache goes to the network as usual (there should be nothing).
// - Lazy files (the optional corner model, assets/ml/): not downloaded at install. The first time the
//   page loads one, the worker fetches it with its recorded hash and keeps it. A new build copies the
//   ones already kept (same file name means same bytes: names carry a content hash).
// - Activate: deletes the caches of older builds. A new build activates only once no tab runs the
//   old one, so no open page loses files it still needs.
// It never stores user data: images and PDFs live in memory and blob: URLs, which never reach it.
// The build (scripts/vite-plugins.ts) replaces the manifest placeholder below with the file list.

import { CACHE_PREFIX, cacheName, isAppRequest, parseManifest } from './offline/precache.ts'

const sw = self as unknown as ServiceWorkerGlobalScope

const manifest = parseManifest('__DNI_PRECACHE_MANIFEST__')
const CACHE = cacheName(manifest.version)
const INDEX = new URL('index.html', sw.location.href).href
const LAZY = new Map(manifest.lazy.map((f) => [new URL(f.path, sw.location.href).href, f.integrity]))

sw.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    try {
      for (const file of manifest.files) {
        const url = new URL(file.path, sw.location.href).href
        const res = await fetch(url, { integrity: file.integrity, cache: 'reload', credentials: 'omit' })
        if (!res.ok) throw new Error(`Precache failed: ${file.path} (${String(res.status)})`)
        await cache.put(url, res)
      }
      // Keep the optional files a previous build already cached, so an update does not make them
      // unavailable offline. Only exact names of this build are copied; nothing is downloaded.
      for (const url of LAZY.keys()) {
        const old = await caches.match(url)
        if (old?.ok) await cache.put(url, old)
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

sw.addEventListener('fetch', (event) => {
  const req = event.request
  if (!isAppRequest(req.method, req.url, sw.registration.scope)) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const key = req.mode === 'navigate' ? INDEX : req.url
    const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' })
    if (hit) return hit
    const integrity = LAZY.get(req.url)
    if (integrity === undefined) return await fetch(req)
    // First use of an optional file: download it checked against its hash, then keep it.
    const res = await fetch(req.url, { integrity, credentials: 'omit' })
    if (res.ok) await cache.put(req.url, res.clone())
    return res
  })())
})
