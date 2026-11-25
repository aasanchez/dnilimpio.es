// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { anchorOf, inkIn, isUpsideDown, turnRect, type Grey } from '../../src/detect/upright.ts'
import { DOCUMENTS } from '../../src/zones/documents.ts'
import type { Rect } from '../../src/zones/types.ts'

const W = 200
const H = 126

/** A light card with dark blocks, optionally turned 180°. */
function card (blocks: Rect[], turned = false): Grey {
  const v = new Float32Array(W * H).fill(230)
  for (const b0 of blocks) {
    const b = turned ? turnRect(b0) : b0
    for (let y = Math.floor(b.y * H); y < Math.ceil((b.y + b.h) * H); y++) {
      for (let x = Math.floor(b.x * W); x < Math.ceil((b.x + b.w) * W); x++) v[y * W + x] = 40
    }
  }
  return { w: W, h: H, v }
}

const photo: Rect = { x: 0.04, y: 0.2, w: 0.28, h: 0.6 }
const lines: Rect[] = [{ x: 0.36, y: 0.2, w: 0.5, h: 0.06 }, { x: 0.36, y: 0.32, w: 0.4, h: 0.06 }]
const mrz: Rect = { x: 0.04, y: 0.68, w: 0.92, h: 0.26 }

describe('upright check', () => {
  it('turns a rect about the centre', () => {
    const r = turnRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })
    expect(r.x).toBeCloseTo(0.6)
    expect(r.y).toBeCloseTo(0.4)
    expect([r.w, r.h]).toEqual([0.3, 0.4])
  })

  it('measures more ink on dark blocks than on blank card', () => {
    const g = card([photo])
    expect(inkIn(g, { x: 0.1, y: 0.35, w: 0.1, h: 0.3 })).toBeGreaterThan(inkIn(g, { x: 0.6, y: 0.5, w: 0.1, h: 0.1 }) + 100)
  })

  for (const doc of DOCUMENTS) {
    it(`${doc.model}: keeps an upright front and back, turns upside-down ones`, () => {
      const front = anchorOf(doc, 'front')
      const back = anchorOf(doc, 'back')
      if (!front || !back) throw new Error('missing anchor')
      expect(isUpsideDown(card([photo, ...lines]), front)).toBe(false)
      expect(isUpsideDown(card([photo, ...lines], true), front)).toBe(true)
      expect(isUpsideDown(card([mrz]), back)).toBe(false)
      expect(isUpsideDown(card([mrz], true), back)).toBe(true)
    })
  }

  it('keeps a card with no clear layout as found', () => {
    expect(isUpsideDown(card([]), photo)).toBe(false)
    expect(isUpsideDown(card([{ x: 0, y: 0, w: 1, h: 1 }]), photo)).toBe(false)
  })

  it('anchors sit inside the card', () => {
    for (const doc of DOCUMENTS) {
      for (const side of ['front', 'back'] as const) {
        const r = anchorOf(doc, side)
        expect(r).toBeDefined()
        if (!r) continue
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
        expect(r.x + r.w).toBeLessThanOrEqual(1)
        expect(r.y + r.h).toBeLessThanOrEqual(1)
      }
    }
  })
})
