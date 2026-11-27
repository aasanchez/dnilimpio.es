// SPDX-License-Identifier: AGPL-3.0-or-later
// Single source of truth for the Content-Security-Policy (spec §5.1).
// The build injects it as a <meta> tag; the e2e test asserts the built page carries exactly this value.

export const CSP_DIRECTIVES: readonly string[] = [
  "default-src 'none'",
  // 'wasm-unsafe-eval' lets the page compile WebAssembly (the corner model's runtime, ADR 0007).
  // It does not allow eval() or new Function(), and the WebAssembly bytes come from a script checked
  // by its integrity hash.
  // Only this site's own scripts: no third-party script may run in the page that holds the photos
  // (ADR 0023).
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  // No frame-src: the page may open no frame at all (default-src 'none'). The visit counter frame of
  // ADR 0024 is gone (ADR 0027).
  // The page can send nothing, to anyone (ADR 0023). No 'self' either (ADR 0022): code in the page
  // cannot send a request to the site's own origin, even before the service worker controls the page. The OCR worker reads its files under its own CSP
  // (workerCsp() in src/offline/precache.ts), not this one.
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
  // One Trusted Types policy only, 'default' (src/security/trusted-types.ts): it accepts the service
  // worker and OCR worker URLs and nothing else. The app never turns strings into HTML (Svelte uses
  // fragments: 'tree'), so no other policy may exist.
  'trusted-types default',
]

export const CSP = CSP_DIRECTIVES.join('; ')

/**
 * Policy of the thanks page (thanks.html, ADR 0029): the page the app opens from "Send anonymous data".
 * It never holds a photo: it is a new document, and it loads none of the app's image, AI or PDF code.
 * It may connect to its own origin, where it sends the opt-in usage stats (one POST, src/stats/send.ts).
 * 'self' and not a path: the same build is served at more than one address (dnitapado.es, www, a
 * local preview). The service worker lets through only that one POST from this page (route()).
 */
export const THANKS_CSP_DIRECTIVES: readonly string[] = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "manifest-src 'self'",
  "connect-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
]

export const THANKS_CSP = THANKS_CSP_DIRECTIVES.join('; ')

/**
 * Policy of the card guide pages (ADR 0040): static text written at build time. They run no script at
 * all, hold no photo and connect to nothing. They load only this site's stylesheet, its fonts and
 * the icons.
 */
export const GUIDE_CSP_DIRECTIVES: readonly string[] = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
]

export const GUIDE_CSP = GUIDE_CSP_DIRECTIVES.join('; ')

/**
 * The policy with extra script hashes. The build adds one: the hash of the inline import map that
 * carries the integrity of chunks loaded on demand (see scripts/vite-plugins.ts).
 */
export function cspWithScriptHashes (hashes: readonly string[]): string {
  if (hashes.length === 0) return CSP
  return CSP_DIRECTIVES.map((d) => (d.startsWith('script-src ') ? `${d} ${hashes.map((h) => `'${h}'`).join(' ')}` : d)).join('; ')
}
