// SPDX-License-Identifier: AGPL-3.0-or-later
// The audit prompt states the claims and where the evidence is. These tests keep it honest: every
// path it names exists, and its list of stats fields is the list the thanks page sends.
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AUDIT_PROMPT, LIVE_SITE } from '../../src/security/audit-prompt.ts'
import { encodeStats, type UsageStats } from '../../src/stats/schema.ts'

const sample: UsageStats = { doc: 'tie', ai: 'right', back: true, fields: ['can'], boxes: 0, mark: false, grey: false, lang: 'es', app: 'dev', src: 'file', ocr: false, device: 'phone', os: 'android', browser: 'chrome', bv: 131, pwa: false }

describe('audit prompt', () => {
  it('names only files that exist', () => {
    const paths = AUDIT_PROMPT.match(/\b(?:src|scripts|worker|tests|docs)\/[\w./-]+\.\w+/g) ?? []
    expect(paths.length).toBeGreaterThan(5)
    for (const p of paths) expect(existsSync(p), p).toBe(true)
  })

  it('lists exactly the stats fields the thanks page sends, in order', () => {
    const keys = encodeStats(sample).split('&').map((pair) => pair.split('=')[0]).join(', ')
    expect(AUDIT_PROMPT).toContain(`Fields (src/stats/schema.ts): ${keys}.`)
  })

  it('points at the live site and asks for findings, not a verdict', () => {
    expect(LIVE_SITE).toBe('https://dnitapado.es/')
    expect(AUDIT_PROMPT).toContain(LIVE_SITE)
    expect(AUDIT_PROMPT).toContain('Try to disprove each one.')
    expect(AUDIT_PROMPT).toContain('Do not give an overall pass or fail.')
    expect(AUDIT_PROMPT.length).toBeLessThan(3000)
  })
})
