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
  // No Trusted Types policy may be created: the app never turns strings into HTML (Svelte uses fragments: 'tree').
  "trusted-types 'none'",
]

export const CSP = CSP_DIRECTIVES.join('; ')
