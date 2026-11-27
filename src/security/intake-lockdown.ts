// SPDX-License-Identifier: AGPL-3.0-or-later
// Intake lockdown (ADR 0025): a second, stricter Content-Security-Policy, added before the photo step
// opens, so it is in force while photos are in the page.
//
// The page's first policy (scripts/csp.ts) must let the start screen load what it needs. Before the
// first photo can be chosen, the app loads the rest of what the page itself needs (every font face),
// then adds a second <meta> policy. Browsers enforce every policy of a page, so a request must pass
// both, and a policy cannot be taken away once added: the page stays locked until it is reloaded,
// and a reload drops the photos anyway (App.svelte, pagehide).
//
// While locked, the page can load only:
// - scripts and workers of this build, each by its exact address (no other path, no other site);
// - images from blob: and data: (the photos, the canvases, the CSS icons), never from a server;
// - no font, no stylesheet, no manifest: they are all loaded before;
// - no connection at all (fetch, XHR, sendBeacon, WebSocket) and no frame.
//
// Limits, stated plainly:
// - CSP compares addresses without their query string. A script import of a build file with a query
//   string (`import('./assets/x.js?data')`) passes this policy. The service worker refuses it
//   (route() in src/offline/precache.ts): that is why the photo step says when the worker does not
//   control the page (src/offline/verify.ts). Workers are also checked by Trusted Types, which
//   compares the whole address.
// - Code already running in the page keeps its privileges: it can navigate the tab away, which no
//   CSP stops. Leaving the page drops the photos.

/** Directives of the intake policy that do not depend on the build's file names. */
const FIXED: readonly string[] = [
  "default-src 'none'",
  'img-src blob: data:',
  "font-src 'none'",
  "style-src 'none'",
  "manifest-src 'none'",
  "connect-src 'none'",
  // No frame. The first policy forbids frames too since ADR 0027 (default-src 'none'); said again here.
  "frame-src 'none'",
]

/** Marks the <meta> element of the intake policy, so it is added once. */
export const LOCKDOWN_ATTR = 'data-intake-lockdown'

/**
 * A CSP source for one file of the build: an absolute http(s) address with a plain path, no query,
 * no fragment, no credentials. Returns null for anything else (it is then left out of the policy,
 * which only makes the policy stricter).
 */
export function exactSource (href: string, base: string): string | null {
  let url: URL
  try {
    url = new URL(href, base)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') return null
  // Characters that may appear in a CSP path without breaking the policy's syntax.
  if (!/^[A-Za-z0-9._~/-]+$/.test(url.pathname)) return null
  return url.href
}

/** The policy for the photo step: `scripts` and `workers` are the build's own files (exact sources). */
export function intakePolicy ({ scripts, workers }: { scripts: readonly string[]; workers: readonly string[] }): string {
  const list = (xs: readonly string[]): string => (xs.length === 0 ? "'none'" : [...new Set(xs)].join(' '))
  return [
    ...FIXED,
    // 'wasm-unsafe-eval': the corner model compiles WebAssembly (ADR 0007). It allows no eval().
    `script-src ${list(scripts)} 'wasm-unsafe-eval'`,
    `worker-src ${list(workers)}`,
  ].join('; ')
}

/**
 * Every script of this build, as exact sources: the entry and preloaded modules in the page, and the
 * modules loaded on demand, which the build lists in the import map with their integrity
 * (scripts/vite-plugins.ts).
 */
export function buildScripts (base: string, srcs: readonly string[], importMap: string | null): string[] {
  const hrefs = [...srcs]
  if (importMap !== null) {
    try {
      const map = JSON.parse(importMap) as { integrity?: Record<string, unknown> }
      hrefs.push(...Object.keys(map.integrity ?? {}))
    } catch {
      // A broken import map loads nothing either; the policy just lists fewer files.
    }
  }
  // Only files inside the app's own folder: never another site's script that may already be in
  // the page when Start is pressed (the old analytics beacon, before ADR 0023, or an extension's).
  const scope = new URL('./', base).href
  return hrefs.map((h) => exactSource(h, base)).filter((s): s is string => s !== null && s.startsWith(scope))
}

/** The service worker's script (src/sw.ts). */
export const SERVICE_WORKER_FILE = 'sw.js'

/** Scripts the page starts as workers: the service worker and the OCR worker (src/ocr/ocr.ts). */
export const WORKER_FILES: readonly string[] = [SERVICE_WORKER_FILE, 'ocr/worker.min.js']

/** The intake policy for this page, read from its own document. */
export function policyFor (doc: Document): string {
  const base = doc.baseURI
  const srcs = [
    ...Array.from(doc.querySelectorAll<HTMLScriptElement>('script[src]'), (s) => s.getAttribute('src') ?? ''),
    ...Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]'), (l) => l.getAttribute('href') ?? ''),
  ]
  const map = doc.querySelector('script[type="importmap"]')?.textContent ?? null
  const exact = (files: readonly string[]): string[] => files.map((f) => exactSource(f, base)).filter((s): s is string => s !== null)
  // sw.js in script-src too (ADR 0037): Firefox checks a script the service worker answers with a
  // response it built (every checked cache hit, src/sw.ts) against script-src as if it came from
  // sw.js. Without it, Firefox blocks every module loaded after the photo step. sw.js is this build's
  // own file; no other path is added.
  return intakePolicy({ scripts: [...buildScripts(base, srcs, map), ...exact([SERVICE_WORKER_FILE])], workers: exact(WORKER_FILES) })
}

/** True once the intake policy is in the page. */
export function isLocked (doc: Document = document): boolean {
  return doc.head.querySelector(`meta[${LOCKDOWN_ATTR}]`) !== null
}

/** Adds the intake policy to the page, once. Never removed: only a reload drops it. */
export function lockIntake (doc: Document = document): void {
  if (isLocked(doc)) return
  const meta = doc.createElement('meta')
  meta.httpEquiv = 'Content-Security-Policy'
  meta.content = policyFor(doc)
  meta.setAttribute(LOCKDOWN_ATTR, '')
  doc.head.append(meta)
}

/**
 * Loads every font face of the stylesheet, so none is needed later (the intake policy allows no
 * font). Waits at most `timeoutMs`: a face that has not loaded by then is drawn with a system font.
 */
export async function loadAllFonts (doc: Document = document, timeoutMs = 3000): Promise<void> {
  const fonts = (doc as { fonts?: FontFaceSet | undefined }).fonts
  if (fonts === undefined) return
  const all = Promise.allSettled(Array.from(fonts as unknown as Iterable<FontFace>, async (f) => await f.load()))
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
}

let preparing: Promise<void> | undefined

/**
 * Prepares the page for photos: loads what it still needs, then adds the intake policy. Never
 * throws and never blocks for long: the photo step opens even if a font fails to load.
 */
export async function prepareIntake (doc: Document = document): Promise<void> {
  preparing ??= (async () => {
    try {
      await loadAllFonts(doc)
    } catch {
      // A missing font only changes how text looks.
    }
    lockIntake(doc)
  })()
  await preparing
}
