// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { defaultHidden, fieldsOf, hasField, masksFor, mrzLeaks } from '../../src/engine/fields.ts'
import { DOCUMENTS } from '../../src/zones/documents.ts'
import { EU_REGISTRATION } from '../../src/zones/eu-registration.ts'
import { TIE } from '../../src/zones/tie.ts'
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
    expect(mrzLeaks(DNI_4_0, new Set<ZoneId>(['dateOfBirth']))).toBe(true)
    expect(mrzLeaks(DNI_4_0, new Set<ZoneId>(['dateOfBirth', 'mrz']))).toBe(false)
    expect(mrzLeaks(DNI_4_0, new Set<ZoneId>(['signature']))).toBe(false)
    expect(mrzLeaks(TIE, new Set<ZoneId>(['expiryDate']))).toBe(true)
  })
  it('never warns about an MRZ the document does not have', () => {
    expect(hasField(EU_REGISTRATION, 'mrz')).toBe(false)
    expect(mrzLeaks(EU_REGISTRATION, new Set<ZoneId>(['dateOfBirth', 'supportNumber']))).toBe(false)
  })
  it.each(DOCUMENTS.map((d) => [d.model, d] as const))('%s hides data by default and keeps every field togglable', (_, d) => {
    const hidden = defaultHidden(d)
    expect(hidden.size).toBeGreaterThan(0)
    // Every default-hidden field leaves a black box on at least one side.
    for (const id of hidden) expect([...masksFor(d, 'front', new Set([id])), ...masksFor(d, 'back', new Set([id]))].length).toBeGreaterThan(0)
  })
})
