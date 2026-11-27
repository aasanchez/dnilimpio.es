// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { DNI_4_0, type ZoneId } from '../../src/zones/dni.ts'
import { activeRects, fillRects, toPixels } from '../../src/redact/zones.ts'
import { CHOICES, DEFAULT_DNI, DEFAULT_DOC, FALLBACK_CHOICE, DNI_VERSIONS, DOCUMENTS, choiceOf, documentOf, isDni, pixelSize } from '../../src/zones/documents.ts'
import type { ModelZones, Rect, Side } from '../../src/zones/types.ts'
import en from '../../src/i18n/locales/en.json'

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

const defaultsOf = (d: ModelZones, id: ZoneId): string[] => d.zones.filter((z) => z.id === id).map((z) => z.default)
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe.each(DOCUMENTS.map((d) => [d.model, d] as const))('%s zone data', (_, d) => {
  it('keeps every rectangle inside the document', () => {
    for (const z of d.zones) {
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
  it('cites an official source and has a size', () => {
    expect(d.source.url).toMatch(/^https:\/\/www\.(dnielectronico\.es|consilium\.europa\.eu)\//)
    expect(d.source.page).toMatch(/^https:\/\//)
    expect(d.size.w).toBeGreaterThan(d.size.h)
  })
  it('defines each field on a side at most once and describes every zone', () => {
    for (const side of ['front', 'back'] as const satisfies readonly Side[]) {
      const ids = d.zones.filter((z) => z.side === side).map((z) => z.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
    for (const z of d.zones) expect(z.note.length).toBeGreaterThan(5)
  })
  it('hides signature, dates, numbers, CAN and MRZ by default where the document has them', () => {
    for (const id of ['signature', 'issueDate', 'expiryDate', 'supportNumber', 'mrz'] as const) {
      for (const def of defaultsOf(d, id)) expect(def).toBe('hidden')
    }
    for (const def of defaultsOf(d, 'can')) expect(def).toBe('mandatory')
    for (const id of ['address', 'placeOfBirth', 'parents', 'dateOfBirth', 'permitType'] as const) {
      for (const def of defaultsOf(d, id)) expect(def).toBe('visible')
    }
  })
  it('keeps the CAN zone clear of the other default-hidden zones', () => {
    // Overlaps would be harmless for privacy, but a tap on the card must toggle the field the user sees.
    const can = d.zones.filter((z) => z.id === 'can').flatMap((z) => z.rects)
    const rest = d.zones.filter((z) => z.id !== 'can' && z.side === 'front').flatMap((z) => z.rects)
    for (const c of can) for (const r of rest) expect(overlap(c, r)).toBe(false)
  })
  it('has a name, and its picker option a name and a hint, in the dictionary', () => {
    expect(en).toHaveProperty(`doc_${d.model}`)
    expect(en).toHaveProperty(`doc_${choiceOf(d.model)}`)
    expect(en).toHaveProperty(`docHint_${choiceOf(d.model)}`)
  })
})

describe('documents', () => {
  it('lists DNI 4.0, DNI 3.0 and TIE, DNI 4.0 first and by default', () => {
    expect(DOCUMENTS.map((d) => d.model)).toEqual(['dni-4.0', 'dni-3.0', 'tie'])
    expect(DEFAULT_DOC).toBe('dni-4.0')
    expect(documentOf('tie').model).toBe('tie')
  })
  it('straightens every card (ID-1) to 1712 × 1080', () => {
    expect(pixelSize(documentOf('dni-4.0').size)).toEqual({ w: 1712, h: 1080 })
    expect(pixelSize(documentOf('dni-3.0').size)).toEqual({ w: 1712, h: 1080 })
    expect(pixelSize(documentOf('tie').size)).toEqual({ w: 1712, h: 1080 })
  })
  it('gives every card a CAN and an MRZ', () => {
    const ids = (m: Parameters<typeof documentOf>[0]): string[] => documentOf(m).zones.map((z) => z.id)
    for (const m of ['dni-4.0', 'dni-3.0', 'tie'] as const) expect(ids(m)).toEqual(expect.arrayContaining(['can', 'mrz']))
  })
  it('offers one DNI choice for both DNI layouts, 4.0 when the version is unknown', () => {
    expect(CHOICES).toEqual(['dni', 'tie'])
    expect(DNI_VERSIONS).toEqual(['dni-4.0', 'dni-3.0'])
    expect(DEFAULT_DNI).toBe('dni-4.0')
    expect(DOCUMENTS.map((d) => choiceOf(d.model))).toEqual(['dni', 'dni', 'tie'])
    expect(DOCUMENTS.filter((d) => isDni(d.model)).map((d) => d.model)).toEqual([...DNI_VERSIONS])
  })
  it('falls back to the TIE when detection cannot answer, one of the picker options', () => {
    expect(FALLBACK_CHOICE).toBe('tie')
    expect(CHOICES).toContain(FALLBACK_CHOICE)
  })
  it('gives both DNI layouts the same card size and fields, so the version can change in the editor', () => {
    const [v4, v3] = DNI_VERSIONS.map(documentOf)
    expect(v3?.size).toEqual(v4?.size)
    const ids = (d: typeof v4): string[] => [...new Set(d?.zones.map((z) => z.id))].sort()
    expect(ids(v3)).toEqual(ids(v4))
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
