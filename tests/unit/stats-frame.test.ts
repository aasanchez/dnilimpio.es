// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { STATS_HOSTS, STATS_SANDBOX, STATS_URL, shouldShowStats } from '../../src/analytics/stats-frame.ts'
import { CSP_DIRECTIVES } from '../../scripts/csp.ts'

describe('counter frame (ADR 0024)', () => {
  const ok = { hostname: 'dnitapado.es', onLine: true }
  it('is shown only on the public site, online, without GPC or DNT', () => {
    for (const hostname of STATS_HOSTS) expect(shouldShowStats({ ...ok, hostname })).toBe(true)
    for (const hostname of ['localhost', '127.0.0.1', 'aasanchez.github.io', 'dnitapado.es.evil.example', 'fork.github.io']) expect(shouldShowStats({ ...ok, hostname })).toBe(false)
    expect(shouldShowStats({ ...ok, onLine: false })).toBe(false)
    expect(shouldShowStats({ ...ok, globalPrivacyControl: true })).toBe(false)
    expect(shouldShowStats({ ...ok, doNotTrack: '1' })).toBe(false)
    expect(shouldShowStats({ ...ok, globalPrivacyControl: false, doNotTrack: '0' })).toBe(true)
  })
  it('lives on another site, with scripts only in its sandbox', () => {
    const url = new URL(STATS_URL)
    expect(url.protocol).toBe('https:')
    expect(url.search + url.hash).toBe('')
    expect(STATS_HOSTS).not.toContain(url.hostname)
    expect(url.hostname.endsWith('dnitapado.es')).toBe(false)
    expect(STATS_SANDBOX).toBe('allow-scripts')
  })
  it('is the only frame and adds no script or connection to the CSP', () => {
    expect(CSP_DIRECTIVES).toContain(`frame-src ${STATS_URL}`)
    expect(CSP_DIRECTIVES).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(CSP_DIRECTIVES).toContain("connect-src 'none'")
  })
})
