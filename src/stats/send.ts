// SPDX-License-Identifier: AGPL-3.0-or-later
// The only request the site ever sends with data in it (ADR 0029): the opt-in usage stats, from the
// photo-free thanks page, when the person taps Send. Its CSP (THANKS_CSP in scripts/csp.ts) allows
// its own origin only, and the service worker lets this one POST through only from that page.
// No cookie, no referrer, no cache.

/**
 * The same value as STATS_ENDPOINT in src/offline/precache.ts (tests/unit/stats.test.ts checks it).
 * Not imported: this page's code must share no module with the service worker, which may import none.
 */
export const STATS_URL = './stats'

export async function sendStats (text: string): Promise<boolean> {
  try {
    const res = await fetch(STATS_URL, {
      method: 'POST',
      body: text,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    })
    return res.status === 204
  } catch {
    return false
  }
}
