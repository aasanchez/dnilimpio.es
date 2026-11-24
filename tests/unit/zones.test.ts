// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { DNI_4_0, type ZoneId } from '../../src/zones/dni.ts'
import { activeRects, fillRects, toPixels } from '../../src/redact/zones.ts'

describe('DNI 4.0 zone data', () => {
  it('keeps every rectangle inside the card', () => {
    for (const z of DNI_4_0.zones) {
      for (const r of z.rects) {
        expect(r.w).toBeGreaterThan(0)
        expect(r.h).toBeGreaterThan(0)
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
        expect(r.x + r.w).toBeLessThanOrEqual(1)
        expect(r.y + r.h).toBeLessThanOrEqual(1)
      }
    }
  })
  it('hides the spec defaults: CAN mandatory; signature, dates, support number, MRZ hidden', () => {
    const d = (id: ZoneId) => DNI_4_0.zones.filter((z) => z.id === id).map((z) => z.default)
    expect(d('can')).toEqual(['mandatory'])
    for (const id of ['signature', 'issueDate', 'expiryDate', 'mrz'] as const) expect(d(id)).toEqual(['hidden'])
    expect(d('supportNumber')).toEqual(['hidden', 'hidden'])
    for (const id of ['address', 'placeOfBirth', 'parents', 'dateOfBirth'] as const) expect(d(id)).toEqual(['visible'])
  })
  it('cites its source', () => {
    expect(DNI_4_0.source.url).toMatch(/^https:\/\/www\.dnielectronico\.es\//)
  })
})

describe('activeRects', () => {
  it('includes optional zones only when turned on', () => {
    const off = activeRects(DNI_4_0, 'back', new Set())
    const on = activeRects(DNI_4_0, 'back', new Set<ZoneId>(['address']))
    expect(on.length).toBe(off.length + 1)
  })
})

describe('toPixels', () => {
  it('rounds outwards and clamps to the image', () => {
    expect(toPixels({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 1712, 1080)).toEqual({ x: 171, y: 108, w: 343, h: 216 })
    expect(toPixels({ x: 0.9, y: 0.9, w: 0.2, h: 0.2 }, 100, 100)).toEqual({ x: 90, y: 90, w: 10, h: 10 })
  })
})

describe('fillRects', () => {
  it('makes every pixel inside a zone opaque black and leaves the rest untouched', () => {
    const w = 10
    const h = 6
    const data = new Uint8ClampedArray(w * h * 4).fill(200)
    fillRects(data, w, h, [{ x: 2, y: 1, w: 3, h: 2 }])
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = [...data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)]
        const inside = x >= 2 && x < 5 && y >= 1 && y < 3
        expect(px).toEqual(inside ? [0, 0, 0, 255] : [200, 200, 200, 200])
      }
    }
  })
})
