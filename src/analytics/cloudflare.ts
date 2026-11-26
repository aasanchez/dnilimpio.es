// SPDX-License-Identifier: AGPL-3.0-or-later
// Anonymous visit counts with Cloudflare Web Analytics (ADR 0015): no cookies, no storage, no
// fingerprinting, nothing about the document. The beacon is Cloudflare's script: it reads only
// what the browser reports about the page load (address, referrer, timings, browser and country
// derived by Cloudflare from the request). This module never passes it anything: no photo, no field,
// no file name, no step of the workflow.
//
// It loads only on the public site, only online, and never when the browser asks not to be tracked
// (Global Privacy Control or Do Not Track). Any failure (offline, blocked by an extension, Cloudflare
// down) is ignored: the app never waits for it and never depends on it.

import { ANALYTICS_HOSTS, BEACON_SCRIPT, BEACON_TOKEN } from './endpoints.ts'

export interface AnalyticsContext {
  readonly hostname: string
  readonly onLine: boolean
  /** navigator.globalPrivacyControl (Sec-GPC): true means "do not sell or share". */
  readonly globalPrivacyControl?: boolean | undefined
  /** navigator.doNotTrack: '1' means "do not track". */
  readonly doNotTrack?: string | null | undefined
}

/** True when the beacon may load in this context. */
export function shouldLoadAnalytics (ctx: AnalyticsContext): boolean {
  if (!ANALYTICS_HOSTS.includes(ctx.hostname)) return false
  if (!ctx.onLine) return false
  if (ctx.globalPrivacyControl === true || ctx.doNotTrack === '1') return false
  return true
}

/** Adds Cloudflare's beacon to the page if shouldLoadAnalytics() allows it. Never throws. */
export function loadAnalytics (doc: Document = document, nav: Navigator = navigator): void {
  try {
    const n = nav as Navigator & { globalPrivacyControl?: boolean }
    const ctx = { hostname: doc.location.hostname, onLine: n.onLine, globalPrivacyControl: n.globalPrivacyControl, doNotTrack: n.doNotTrack }
    if (!shouldLoadAnalytics(ctx)) return
    const script = doc.createElement('script')
    script.type = 'module'
    script.dataset['cfBeacon'] = JSON.stringify({ token: BEACON_TOKEN })
    script.addEventListener('error', () => { script.remove() }, { once: true })
    // Under Trusted Types this string goes through the 'default' policy, which accepts this exact URL.
    script.src = BEACON_SCRIPT
    doc.head.append(script)
  } catch {
    // Analytics are optional: nothing the user does depends on them.
  }
}
