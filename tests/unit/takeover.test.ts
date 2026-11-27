// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { mayTakeOver } from '../../src/offline/takeover.ts'

describe('mayTakeOver', () => {
  it('takes over when the asking page is the only window', () => {
    expect(mayTakeOver([], false)).toBe(true)
  })

  it('takes over when every other window is idle', () => {
    expect(mayTakeOver(['idle', 'idle'], false)).toBe(true)
  })

  it('waits for a busy window: it may still need the old build\'s files', () => {
    expect(mayTakeOver(['idle', 'busy'], false)).toBe(false)
  })

  it('waits for a window that did not answer (frozen in the background)', () => {
    expect(mayTakeOver(['silent'], false)).toBe(false)
  })

  it('takes over at once when the person pressed "Update now"', () => {
    expect(mayTakeOver(['busy', 'silent'], true)).toBe(true)
  })
})
