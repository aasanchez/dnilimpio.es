// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { apply, homography, isConvex, solve, type Quad } from '../../src/geometry/homography.ts'
import { CARD_MM, CARD_PX, warpToCard } from '../../src/geometry/warp.ts'

const unit: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]

describe('solve', () => {
  it('solves a small system', () => {
    expect(solve([[2, 1], [1, 3]], [3, 5])?.map((v) => +v.toFixed(10))).toEqual([0.8, 1.4])
  })
  it('returns null for a singular matrix', () => {
    expect(solve([[1, 2], [2, 4]], [1, 2])).toBeNull()
  })
})

describe('homography', () => {
  it('maps the four source corners onto the destination corners', () => {
    const dst: Quad = [{ x: 103, y: 87 }, { x: 912, y: 140 }, { x: 870, y: 640 }, { x: 60, y: 590 }]
    const m = homography(unit, dst)
    expect(m).not.toBeNull()
    for (let i = 0; i < 4; i++) {
      const p = apply(m!, unit[i]!)
      expect(p.x).toBeCloseTo(dst[i]!.x, 6)
      expect(p.y).toBeCloseTo(dst[i]!.y, 6)
    }
  })
  it('is the identity for identical quads and an affine scale for rectangles', () => {
    const id = homography(unit, unit)!;
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => { expect(id[i]).toBeCloseTo(v, 12) })
    const s = homography(unit, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }])!
    expect(apply(s, { x: 0.5, y: 0.5 })).toEqual({ x: 2, y: 1 })
  })
  it('round-trips through its inverse', () => {
    const dst: Quad = [{ x: 10, y: 20 }, { x: 300, y: 5 }, { x: 320, y: 210 }, { x: 0, y: 190 }]
    const fwd = homography(unit, dst)!; const inv = homography(dst, unit)!
    const p = apply(inv, apply(fwd, { x: 0.3, y: 0.7 }))
    expect(p.x).toBeCloseTo(0.3, 9)
    expect(p.y).toBeCloseTo(0.7, 9)
  })
  it('rejects collinear points', () => {
    expect(homography(unit, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 1 }])).toBeNull()
  })
})

describe('isConvex', () => {
  it('accepts both windings and rejects self-intersecting quads', () => {
    expect(isConvex(unit)).toBe(true)
    expect(isConvex([...unit].reverse() as unknown as Quad)).toBe(true)
    expect(isConvex([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBe(false)
  })
})

describe('warpToCard', () => {
  it('uses the ID-1 aspect ratio within 0.1 %', () => {
    expect(Math.abs(CARD_PX.w / CARD_PX.h - CARD_MM.w / CARD_MM.h) / (CARD_MM.w / CARD_MM.h)).toBeLessThan(0.001)
  })
  it('recovers a rectangle drawn on a larger image', () => {
    const sw = 64; const sh = 48; const data = new Uint8ClampedArray(sw * sh * 4)
    // Left half of the "card" (x 8..40, y 8..28) red, right half blue, outside grey.
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const inCard = x >= 8 && x < 40 && y >= 8 && y < 28
        const px = !inCard ? [128, 128, 128, 255] : x < 24 ? [255, 0, 0, 255] : [0, 0, 255, 255]
        data.set(px, (y * sw + x) * 4)
      }
    }
    const out = warpToCard({ width: sw, height: sh, data },
      [{ x: 8, y: 8 }, { x: 40, y: 8 }, { x: 40, y: 28 }, { x: 8, y: 28 }],
      { width: 16, height: 10, data: new Uint8ClampedArray(16 * 10 * 4) })
    expect([...out.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]) // top-left
    const last = (16 * 10 - 1) * 4
    expect([...out.data.subarray(last, last + 4)]).toEqual([0, 0, 255, 255]) // bottom-right
  })
  it('throws on a non-convex quad', () => {
    expect(() => warpToCard({ width: 2, height: 2, data: new Uint8ClampedArray(16) },
      [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toThrow()
  })
})
