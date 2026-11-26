// SPDX-License-Identifier: AGPL-3.0-or-later
// Single source of truth for the Content-Security-Policy (spec §5.1).
// The build injects it as a <meta> tag; the e2e test asserts the built page carries exactly this value.

import { BEACON_ORIGIN, BEACON_SCRIPT } from '../src/analytics/endpoints.ts'

export const CSP_DIRECTIVES: readonly string[] = [
  "default-src 'none'",
  // 'wasm-unsafe-eval' lets the page compile WebAssembly (the corner model's runtime, ADR 0007).
  // It does not allow eval() or new Function(), and the WebAssembly bytes come from a script checked
  // by its integrity hash.
  // The one third-party script: Cloudflare's analytics beacon, by its exact path (ADR 0015).
  `script-src 'self' 'wasm-unsafe-eval' ${BEACON_SCRIPT}`,
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  // The page can send nothing except the beacon's anonymous page-view report to Cloudflare (ADR 0015).
  // No 'self' (ADR 0022): code in the page cannot send a request to the site's own origin either, even
  // before the service worker controls the page. The OCR worker reads its files under its own CSP
  // (workerCsp() in src/offline/precache.ts), not this one.
  `connect-src ${BEACON_ORIGIN}`,
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
  // One Trusted Types policy only, 'default' (src/security/trusted-types.ts): it accepts the service
  // worker, OCR worker and analytics beacon URLs and nothing else. The app never turns strings into HTML (Svelte uses
  // fragments: 'tree'), so no other policy may exist.
  'trusted-types default',
]

export const CSP = CSP_DIRECTIVES.join('; ')

/**
 * The policy with extra script hashes. The build adds one: the hash of the inline import map that
 * carries the integrity of chunks loaded on demand (see scripts/vite-plugins.ts).
 */
export function cspWithScriptHashes (hashes: readonly string[]): string {
  if (hashes.length === 0) return CSP
  return CSP_DIRECTIVES.map((d) => (d.startsWith('script-src ') ? `${d} ${hashes.map((h) => `'${h}'`).join(' ')}` : d)).join('; ')
}
