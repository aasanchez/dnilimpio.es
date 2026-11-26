// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { shouldLoadAnalytics } from '../../src/analytics/cloudflare.ts'
import { ANALYTICS_HOSTS, BEACON_ENDPOINT, BEACON_ORIGIN, BEACON_SCRIPT, BEACON_TOKEN } from '../../src/analytics/endpoints.ts'
import { CSP_DIRECTIVES } from '../../scripts/csp.ts'
import { ALLOWED_SCRIPT_URLS } from '../../src/security/trusted-types.ts'

const live = { hostname: 'aasanchez.github.io', onLine: true }

describe('shouldLoadAnalytics', () => {
  it('loads on the public site only', () => {
    for (const hostname of ANALYTICS_HOSTS) expect(shouldLoadAnalytics({ ...live, hostname })).toBe(true)
    for (const hostname of ['localhost', '127.0.0.1', 'someone.github.io', 'dnilimpio.es.evil.example', '']) {
      expect(shouldLoadAnalytics({ ...live, hostname })).toBe(false)
    }
  })
  it('never loads offline', () => {
    expect(shouldLoadAnalytics({ ...live, onLine: false })).toBe(false)
  })
  it('respects Global Privacy Control and Do Not Track', () => {
    expect(shouldLoadAnalytics({ ...live, globalPrivacyControl: true })).toBe(false)
    expect(shouldLoadAnalytics({ ...live, doNotTrack: '1' })).toBe(false)
    expect(shouldLoadAnalytics({ ...live, globalPrivacyControl: false, doNotTrack: '0' })).toBe(true)
    expect(shouldLoadAnalytics({ ...live, doNotTrack: null })).toBe(true)
  })
})

describe('Cloudflare addresses', () => {
  it('are the only third-party entries in the CSP, by exact script path and one connect origin', () => {
    expect(CSP_DIRECTIVES).toContain(`script-src 'self' 'wasm-unsafe-eval' ${BEACON_SCRIPT}`)
    expect(CSP_DIRECTIVES).toContain(`connect-src ${BEACON_ORIGIN}`)
    const thirdParty = CSP_DIRECTIVES.flatMap((d) => d.split(' ')).filter((t) => t.startsWith('https:') || t.startsWith('http:'))
    expect(thirdParty.sort()).toEqual([BEACON_ORIGIN, BEACON_SCRIPT].sort())
  })
  it('the beacon is the only absolute script URL Trusted Types accept', () => {
    expect(ALLOWED_SCRIPT_URLS.filter((u) => u.includes('://'))).toEqual([BEACON_SCRIPT])
  })
  it('report to the connect origin', () => {
    expect(new URL(BEACON_ENDPOINT).origin).toBe(BEACON_ORIGIN)
    expect(BEACON_TOKEN).toMatch(/^[0-9a-f]{32}$/)
  })
})
