// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure helpers shared by the service worker and the build: no DOM, no worker globals, tested in Node.

export interface PrecacheFile { readonly path: string; readonly integrity: string }
export interface PrecacheManifest {
  readonly version: string;
  /** Downloaded when the worker installs. */
  readonly files: readonly PrecacheFile[];
  /** Optional features (the corner model): cached the first time the page loads them, never before. */
  readonly lazy: readonly PrecacheFile[];
}

export const CACHE_PREFIX = 'dnilimpio-'
export const cacheName = (version: string): string => `${CACHE_PREFIX}${version}`

/** Path of the service worker next to index.html. Never precached: the browser checks it for updates. */
export const SW_FILE = 'sw.js'

/** Folder of optional files that are cached on first use instead of at install (see {@link isLazy}). */
export const LAZY_DIR = 'assets/ml/'

/** Files that belong in the offline cache: everything the build wrote except source maps and the worker. */
export function isPrecached (path: string): boolean {
  return path !== SW_FILE && !path.endsWith('.map') && !path.startsWith('.') && !isLazy(path)
}

/**
 * Files of optional features, about 2.5 MB: cached the first time a page uses them, so a visitor
 * who never needs them never downloads them. Without a network and before first use, the feature
 * is simply not available.
 */
export function isLazy (path: string): boolean {
  return path.startsWith(LAZY_DIR) && !path.endsWith('.map')
}

/** Parses and checks the manifest the build inlines into the worker. Throws on anything unexpected. */
export function parseManifest (json: string): PrecacheManifest {
  const m = JSON.parse(json) as { version?: unknown; files?: unknown; lazy?: unknown }
  if (typeof m.version !== 'string' || !/^[0-9a-f]{16,}$/.test(m.version)) throw new Error('Bad precache version')
  if (!Array.isArray(m.files) || m.files.length === 0) throw new Error('Empty precache manifest')
  if (!Array.isArray(m.lazy)) throw new Error('Bad lazy file list')
  const files = (m.files as unknown[]).map((f) => parseFile(f, isPrecached))
  const lazy = (m.lazy as unknown[]).map((f) => parseFile(f, isLazy))
  return { version: m.version, files, lazy }
}

function parseFile (f: unknown, allowed: (path: string) => boolean): PrecacheFile {
  const { path, integrity } = (f ?? {}) as { path?: unknown; integrity?: unknown }
  if (typeof path !== 'string' || !allowed(path) || path.startsWith('/') || path.includes('..')) throw new Error('Bad precache path')
  if (typeof integrity !== 'string' || !/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity)) throw new Error('Bad precache integrity')
  return { path, integrity }
}

/** True for requests the worker answers: GET, same origin, inside its scope. */
export function isAppRequest (method: string, url: string, scope: string): boolean {
  return method === 'GET' && url.startsWith(scope)
}
