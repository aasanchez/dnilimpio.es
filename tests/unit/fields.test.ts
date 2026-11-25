// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { defaultHidden, fieldsOf, masksFor, mrzLeaks } from '../../src/engine/fields.ts'
import { DNI_4_0, type ZoneId } from '../../src/zones/dni.ts'

describe('fields', () => {
  it('lists each field once, with every side it is printed on', () => {
    const f = fieldsOf(DNI_4_0)
    expect(new Set(f.map((x) => x.id)).size).toBe(f.length)
    expect(f.find((x) => x.id === 'supportNumber')?.sides).toEqual(['front', 'back'])
  })
  it('hides the recommended fields by default, CAN included', () => {
    expect([...defaultHidden(DNI_4_0)].sort()).toEqual(['can', 'expiryDate', 'issueDate', 'mrz', 'signature', 'supportNumber'])
  })
  it('masks a hidden field on every side and position', () => {
    const hidden = new Set<ZoneId>(['supportNumber'])
    expect(masksFor(DNI_4_0, 'front', hidden)).toHaveLength(2)
    expect(masksFor(DNI_4_0, 'back', hidden)).toHaveLength(1)
    expect(masksFor(DNI_4_0, 'back', new Set())).toEqual([])
  })
  it('warns when the MRZ stays visible but data it repeats is hidden', () => {
    expect(mrzLeaks(new Set<ZoneId>(['dateOfBirth']))).toBe(true)
    expect(mrzLeaks(new Set<ZoneId>(['dateOfBirth', 'mrz']))).toBe(false)
    expect(mrzLeaks(new Set<ZoneId>(['signature']))).toBe(false)
  })
})
