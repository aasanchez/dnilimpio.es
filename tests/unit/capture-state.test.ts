// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { canContinue, sidesOf } from '../../src/ui/capture-state.ts'

describe('optional back photo', () => {
  it('lists the sides with a photo, front first', () => {
    expect(sidesOf({ front: 1, back: 2 })).toEqual(['front', 'back'])
    expect(sidesOf({ front: 1, back: null })).toEqual(['front'])
    expect(sidesOf({ front: null, back: null })).toEqual([])
  })
  it('lets the photo step go on with the front alone, never without the front', () => {
    expect(canContinue({ front: 1 })).toBe(true)
    expect(canContinue({ front: null })).toBe(false)
  })
})
