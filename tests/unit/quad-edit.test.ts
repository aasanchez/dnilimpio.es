// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { isConvex, type Quad } from '../../src/geometry/homography.ts'
import { defaultQuad, fitPixels, moveCorner, nearestCorner, rotateQuad, scaleQuad } from '../../src/geometry/quad-edit.ts'
import { CARD_PX } from '../../src/geometry/warp.ts'

const q: Quad = [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 70 }, { x: 10, y: 70 }]

describe('defaultQuad', () => {
  it.each([[1600, 1200], [1200, 1600], [4000, 3000], [500, 3000]])('is a centred, convex, card-shaped rectangle inside %i × %i', (w, h) => {
    const d = defaultQuad(w, h)
    expect(isConvex(d)).toBe(true)
    for (const p of d) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(w)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(h)
    }
    const dw = d[1].x - d[0].x
    const dh = d[3].y - d[0].y
    expect(dw / dh).toBeCloseTo(CARD_PX.w / CARD_PX.h, 6)
    expect((d[0].x + d[2].x) / 2).toBeCloseTo(w / 2, 6)
    expect((d[0].y + d[2].y) / 2).toBeCloseTo(h / 2, 6)
    expect(Math.max(dw / w, dh / h)).toBeCloseTo(0.7, 6)
  })
  it('takes another aspect ratio when given one', () => {
    const d = defaultQuad(1600, 1200, 1.5)
    expect((d[1].x - d[0].x) / (d[3].y - d[0].y)).toBeCloseTo(1.5, 6)
  })
})

describe('nearestCorner', () => {
  it('picks the closest corner within range', () => {
    expect(nearestCorner(q, { x: 12, y: 13 }, 10)).toBe(0)
    expect(nearestCorner(q, { x: 105, y: 66 }, 10)).toBe(2)
  })
  it('returns null when every corner is out of range', () => {
    expect(nearestCorner(q, { x: 60, y: 40 }, 10)).toBeNull()
  })
})

describe('moveCorner', () => {
  it('moves only the given corner and returns a new quad', () => {
    const m = moveCorner(q, 1, { x: 120, y: 5 }, 200, 100)
    expect(m[1]).toEqual({ x: 120, y: 5 })
    expect([m[0], m[2], m[3]]).toEqual([q[0], q[2], q[3]])
    expect(q[1]).toEqual({ x: 110, y: 10 })
  })
  it('clamps to the image', () => {
    expect(moveCorner(q, 2, { x: 999, y: -5 }, 200, 100)[2]).toEqual({ x: 200, y: 0 })
  })
})

describe('rotateQuad', () => {
  it('makes the left edge the new top edge and cycles after four turns', () => {
    const r = rotateQuad(q)
    expect([r[0], r[1]]).toEqual([q[3], q[0]])
    expect(rotateQuad(rotateQuad(rotateQuad(r)))).toEqual(q)
    expect(isConvex(r)).toBe(true)
  })
})

describe('scaleQuad / fitPixels', () => {
  it('scales each axis', () => {
    expect(scaleQuad(q, 0.5, 2)[2]).toEqual({ x: 55, y: 140 })
  })
  it('keeps small images and shrinks large ones under the limit', () => {
    expect(fitPixels(4000, 3000)).toBe(1)
    const s = fitPixels(8000, 6000)
    expect(Math.round(8000 * s) * Math.round(6000 * s)).toBeLessThanOrEqual(16_000_000 + 8000)
    expect(s).toBeCloseTo(Math.sqrt(16_000_000 / 48_000_000), 9)
  })
})
