// SPDX-License-Identifier: AGPL-3.0-or-later
// Cloudflare Web Analytics (ADR 0015): the only third-party addresses the app may reach.
// Pure constants, shared by the page, the service worker and the build's CSP (scripts/csp.ts).

/** The beacon script, loaded from Cloudflare. Allowed by exact path in script-src and Trusted Types. */
export const BEACON_SCRIPT = 'https://static.cloudflareinsights.com/beacon.min.js'

/** Where the beacon reports page views. The only other origin in connect-src, next to 'self' (ADR 0016). */
export const BEACON_ORIGIN = 'https://cloudflareinsights.com'
export const BEACON_ENDPOINT = `${BEACON_ORIGIN}/cdn-cgi/rum`

/**
 * Site token of the Cloudflare Web Analytics site. Not a secret: Cloudflare puts it in every page
 * that uses the beacon, and it only lets the beacon add page views to that site.
 */
export const BEACON_TOKEN = 'bf9884a30ab64669978eccd29b30a674'

/**
 * Host names where the beacon runs: the public site only (dnitapado.es is the planned domain;
 * dnilimpio.es stays listed in case it is kept as a redirect). A local build, `vite preview`, the tests
 * and forks on other hosts never load it.
 */
export const ANALYTICS_HOSTS: readonly string[] = ['aasanchez.github.io', 'dnitapado.es', 'www.dnitapado.es', 'dnilimpio.es', 'www.dnilimpio.es']
