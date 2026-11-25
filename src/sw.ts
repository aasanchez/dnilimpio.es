// SPDX-License-Identifier: AGPL-3.0-or-later
// Service worker (spec phase 2): makes the app work offline after one visit.
// - Install: downloads every file of this build with fetch({ integrity }), so the browser checks each
//   one against the SHA-384 hash recorded at build time. One bad file and the install fails: the
//   cache only ever holds the exact bytes of one build.
// - Fetch: answers GET requests inside its scope from that cache; page loads get the cached index.html.
//   Anything not in the cache goes to the network as usual (there should be nothing).
// - Activate: deletes the caches of older builds.
// It never stores user data: images and PDFs live in memory and blob: URLs, which never reach it.
// The build (scripts/vite-plugins.ts) replaces the manifest placeholder below with the file list.

import { CACHE_PREFIX, cacheName, isAppRequest, parseManifest } from './offline/precache.ts'

const sw = self as unknown as ServiceWorkerGlobalScope

const manifest = parseManifest('__DNI_PRECACHE_MANIFEST__')
const CACHE = cacheName(manifest.version)
const INDEX = new URL('index.html', sw.location.href).href

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
    } catch (e) {
      // Never leave a partial cache behind: the install fails and the app keeps working online.
      await caches.delete(CACHE)
      throw e
    }
    await sw.skipWaiting()
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
    return (await cache.match(key, { ignoreSearch: req.mode === 'navigate' })) ?? await fetch(req)
  })())
})
