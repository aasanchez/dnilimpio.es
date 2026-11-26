// SPDX-License-Identifier: AGPL-3.0-or-later
// Visit counts in an isolated frame (ADR 0024). Cloudflare Web Analytics never runs in the page that
// holds the photos (ADR 0023). Instead, the start screen embeds a blank page from another site
// (aasanchez/dnitapado-stats on GitHub Pages) that loads the beacon. The frame is sandboxed with
// `allow-scripts` only, so it has an opaque origin, no popups, no forms and no top-level navigation;
// the browser's same-origin policy keeps it out of this page's DOM, canvas and files. The app passes
// it nothing: no query string, no referrer, no message. Pure constants and rules, tested in Node.

/** The counter page. Allowed by this exact path in the CSP's frame-src (scripts/csp.ts). */
export const STATS_URL = 'https://aasanchez.github.io/dnitapado-stats/'

/** The frame's sandbox: scripts only. Never add allow-same-origin, allow-popups or allow-top-navigation. */
export const STATS_SANDBOX = 'allow-scripts'

/**
 * Host names where the frame is shown: the public site only. A local build, `vite preview`, the
 * tests and forks on other hosts never show it.
 */
export const STATS_HOSTS: readonly string[] = ['dnitapado.es', 'www.dnitapado.es']

export interface StatsContext {
  readonly hostname: string
  readonly onLine: boolean
  /** navigator.globalPrivacyControl (Sec-GPC): true means "do not sell or share". */
  readonly globalPrivacyControl?: boolean | undefined
  /** navigator.doNotTrack: '1' means "do not track". */
  readonly doNotTrack?: string | null | undefined
}

/** True when the counter frame may be shown in this context. */
export function shouldShowStats (ctx: StatsContext): boolean {
  if (!STATS_HOSTS.includes(ctx.hostname)) return false
  if (!ctx.onLine) return false
  if (ctx.globalPrivacyControl === true || ctx.doNotTrack === '1') return false
  return true
}

/** shouldShowStats() for this browser. Never throws. */
export function statsAllowedHere (loc: Location = location, nav: Navigator = navigator): boolean {
  try {
    const n = nav as Navigator & { globalPrivacyControl?: boolean }
    return shouldShowStats({ hostname: loc.hostname, onLine: n.onLine, globalPrivacyControl: n.globalPrivacyControl, doNotTrack: n.doNotTrack })
  } catch {
    return false
  }
}
