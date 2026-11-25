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

/** Folder of the OCR engine and language data (large, downloaded on first use). */
export const ON_DEMAND_DIR = 'ocr/'
/** Folder of the corner model and its runtime (about 2.6 MB, downloaded on first use; ADR 0007). */
export const MODEL_DIR = 'assets/ml/'

/** Files that belong in the offline cache: everything the build wrote except source maps and the worker. */
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

/** True for requests the worker answers: GET, same origin, inside its scope. */
export function isAppRequest (method: string, url: string, scope: string): boolean {
  return method === 'GET' && url.startsWith(scope)
}
