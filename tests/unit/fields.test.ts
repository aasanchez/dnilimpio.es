// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { defaultHidden, fieldsOf, hasField, masksFor, mrzLeaks, placeZones, sideRects, zoneKey } from '../../src/engine/fields.ts'
import { DOCUMENTS } from '../../src/zones/documents.ts'
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
    const noMrz = { ...DNI_4_0, zones: DNI_4_0.zones.filter((z) => z.id !== 'mrz') }
    expect(hasField(noMrz, 'mrz')).toBe(false)
    expect(mrzLeaks(noMrz, new Set<ZoneId>(['dateOfBirth', 'supportNumber']))).toBe(false)
  })
  it.each(DOCUMENTS.map((d) => [d.model, d] as const))('%s hides data by default and keeps every field togglable', (_, d) => {
    const hidden = defaultHidden(d)
    expect(hidden.size).toBeGreaterThan(0)
    // Every default-hidden field leaves a black box on at least one side.
    for (const id of hidden) expect([...masksFor(d, 'front', new Set([id])), ...masksFor(d, 'back', new Set([id]))].length).toBeGreaterThan(0)
  })
  it('applies moved or resized field boxes, and leaves the template untouched', () => {
    expect(placeZones(TIE, {})).toBe(TIE)
    const zi = TIE.zones.findIndex((z) => z.id === 'permitType')
    const moved = { x: 0.4, y: 0.53, w: 0.35, h: 0.07 }
    const placed = placeZones(TIE, { [zoneKey(zi, 0)]: moved })
    const masks = masksFor(placed, 'front', new Set<ZoneId>(['permitType']))
    expect(masks).toEqual([moved, TIE.zones[zi]?.rects[1]])
    expect(TIE.zones[zi]?.rects[0]).not.toEqual(moved)
  })
  it('lists every field box of one side with a stable key', () => {
    const front = sideRects(TIE, 'front')
    expect(front.map((r) => r.id)).toContain('permitType')
    expect(front.filter((r) => r.id === 'permitType')).toHaveLength(2)
    expect(new Set(front.map((r) => r.key)).size).toBe(front.length)
    expect(sideRects(TIE, 'back').every((r) => TIE.zones.some((z) => z.side === 'back' && z.id === r.id))).toBe(true)
  })
})
