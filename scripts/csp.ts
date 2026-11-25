// SPDX-License-Identifier: AGPL-3.0-or-later
// Single source of truth for the Content-Security-Policy (spec §5.1).
// The build injects it as a <meta> tag; the e2e test asserts the built page carries exactly this value.

export const CSP_DIRECTIVES: readonly string[] = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
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
 * The policy with extra script hashes. The build adds one: the hash of the inline import map that
 * carries the integrity of chunks loaded on demand (see scripts/vite-plugins.ts).
 */
export function cspWithScriptHashes (hashes: readonly string[]): string {
  if (hashes.length === 0) return CSP
  return CSP_DIRECTIVES.map((d) => (d.startsWith('script-src ') ? `${d} ${hashes.map((h) => `'${h}'`).join(' ')}` : d)).join('; ')
}
