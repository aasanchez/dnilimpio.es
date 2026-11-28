// SPDX-License-Identifier: AGPL-3.0-or-later
// The audit prompt is one neutral question. These tests keep it that way: it points at the
// repository and the live site, asks one question and a closing question, and states no claim.
import { describe, expect, it } from 'vitest'
import { AUDIT_PROMPT, LIVE_SITE, REPOSITORY } from '../../src/security/audit-prompt.ts'

describe('audit prompt', () => {
  it('points at the repository and the live site', () => {
    expect(REPOSITORY).toBe('https://github.com/aasanchez/dnitapado.es')
    expect(LIVE_SITE).toBe('https://dnitapado.es/')
    expect(AUDIT_PROMPT).toContain(REPOSITORY)
    expect(AUDIT_PROMPT).toContain(LIVE_SITE)
  })

  it('asks one question about the document and one final question for the conclusion', () => {
    expect(AUDIT_PROMPT.match(/\?/g)).toHaveLength(2)
    expect(AUDIT_PROMPT).toContain('Is my document (the photos I load and any data read from them) ever handled by a third party, or by any system or server outside my device')
  })

  it('limits the question to the document, and keeps the stats in scope if they carry document data', () => {
    expect(AUDIT_PROMPT).toContain('Answer only about the document.')
    expect(AUDIT_PROMPT).toContain('The opt-in anonymous usage statistics are out of scope, unless they carry data from the document.')
  })

  it('ends with the final question, answered in plain words as the conclusion', () => {
    expect(AUDIT_PROMPT.trimEnd()).toMatch(/To conclude, answer in plain, non-technical words: is this site reasonably safe for keeping my personal identity data private\?$/)
  })

  it('stays short and states no claim for the agent to accept', () => {
    expect(AUDIT_PROMPT.length).toBeLessThan(800)
    expect(AUDIT_PROMPT).not.toMatch(/Claims:|is not sent|are not sent|Do not report|no analytics/)
  })
})
