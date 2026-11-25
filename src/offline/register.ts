// SPDX-License-Identifier: AGPL-3.0-or-later
// Registers the service worker (src/sw.ts, built as sw.js next to index.html).
// The CSP enforces Trusted Types, so register() only accepts a TrustedScriptURL. The single policy the
// CSP allows ('dnilimpio-sw') is created here, once, and only ever returns the worker's own URL:
// once it exists, no other code can create a policy with that name.

interface TrustedTypesLike {
  createPolicy: (name: string, rules: { createScriptURL: (input: string) => string }) => { createScriptURL: (input: string) => unknown }
}

export const SW_POLICY = 'dnilimpio-sw'

export async function registerServiceWorker (): Promise<void> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  const url = new URL('sw.js', document.baseURI).href
  const tt = (window as unknown as { trustedTypes?: TrustedTypesLike }).trustedTypes
  const scriptURL = tt
    ? tt.createPolicy(SW_POLICY, {
      createScriptURL: (input) => {
        if (input !== url) throw new TypeError('Only the app service worker may be registered')
        return input
      },
    }).createScriptURL(url)
    : url
  await navigator.serviceWorker.register(scriptURL as string, { scope: './', updateViaCache: 'none' })
}
