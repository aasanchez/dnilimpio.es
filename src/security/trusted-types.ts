// SPDX-License-Identifier: AGPL-3.0-or-later
// The only Trusted Types policy the CSP allows ('trusted-types default'). The CSP enforces Trusted
// Types for scripts, so every script URL handed to the browser as a string (service worker
// registration, the OCR worker, Cloudflare's analytics beacon) passes
// through this policy. It accepts exactly those three URLs and nothing else; it defines no createHTML or createScript, so HTML
// and script strings stay blocked. Created once at start-up: after that, no code can create another.

interface TrustedTypesLike {
  createPolicy: (name: string, rules: { createScriptURL: (input: string) => string }) => unknown
}

import { BEACON_SCRIPT } from '../analytics/endpoints.ts'

/** Script URLs the app may load from strings, relative to the page (the beacon is absolute; ADR 0015). */
export const ALLOWED_SCRIPT_URLS = ['sw.js', 'ocr/worker.min.js', BEACON_SCRIPT] as const

export function installTrustedTypesPolicy (): void {
  const tt = (window as unknown as { trustedTypes?: TrustedTypesLike }).trustedTypes
  if (!tt) return
  const allowed = new Set(ALLOWED_SCRIPT_URLS.map((u) => new URL(u, document.baseURI).href))
  tt.createPolicy('default', {
    createScriptURL: (input) => {
      const url = new URL(input, document.baseURI).href
      if (!allowed.has(url)) throw new TypeError(`Script URL not allowed: ${url}`)
      return url
    },
  })
}
