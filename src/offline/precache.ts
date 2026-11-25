// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure helpers shared by the service worker and the build: no DOM, no worker globals, tested in Node.

export interface PrecacheFile { readonly path: string; readonly integrity: string }
export interface PrecacheManifest { readonly version: string; readonly files: readonly PrecacheFile[] }

export const CACHE_PREFIX = 'dnilimpio-'
export const cacheName = (version: string): string => `${CACHE_PREFIX}${version}`

/** Path of the service worker next to index.html. Never precached: the browser checks it for updates. */
export const SW_FILE = 'sw.js'

/** Files that belong in the offline cache: everything the build wrote except source maps and the worker. */
export function isPrecached (path: string): boolean {
  return path !== SW_FILE && !path.endsWith('.map') && !path.startsWith('.')
}

/** Parses and checks the manifest the build inlines into the worker. Throws on anything unexpected. */
export function parseManifest (json: string): PrecacheManifest {
  const m = JSON.parse(json) as { version?: unknown; files?: unknown }
  if (typeof m.version !== 'string' || !/^[0-9a-f]{16,}$/.test(m.version)) throw new Error('Bad precache version')
  if (!Array.isArray(m.files) || m.files.length === 0) throw new Error('Empty precache manifest')
  const files = (m.files as unknown[]).map((f): PrecacheFile => {
    const { path, integrity } = (f ?? {}) as { path?: unknown; integrity?: unknown }
    if (typeof path !== 'string' || !isPrecached(path) || path.startsWith('/') || path.includes('..')) throw new Error('Bad precache path')
    if (typeof integrity !== 'string' || !/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity)) throw new Error('Bad precache integrity')
    return { path, integrity }
  })
  return { version: m.version, files }
}

/** True for requests the worker answers: GET, same origin, inside its scope. */
export function isAppRequest (method: string, url: string, scope: string): boolean {
  return method === 'GET' && url.startsWith(scope)
}
