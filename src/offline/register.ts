// SPDX-License-Identifier: AGPL-3.0-or-later
// Registers the service worker (src/sw.ts, built as sw.js next to index.html). The URL string passes
// through the Trusted Types default policy (src/security/trusted-types.ts), which only accepts it and
// the OCR worker.

export async function registerServiceWorker (): Promise<void> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  await navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, { scope: './', updateViaCache: 'none' })
}
