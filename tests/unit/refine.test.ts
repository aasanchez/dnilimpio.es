// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import type { Point, Quad } from '../../src/geometry/homography.ts'
import { refineQuad, type Grey } from '../../src/detect/refine.ts'

const W = 1000
const H = 1300

/** A light ID-1 card with rounded corners, a printed band along its top and a dark photo, on dark woven fabric. */
function photo (card: Quad, seed = 7): Grey {
  let s = seed
  const rnd = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  const v = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) v[y * W + x] = 35 + (y % 3 === 0 ? 25 : 0) + (x % 4 === 0 ? -15 : 0) + rnd() * 30
  }
  // Card frame: origin at its top-left corner, axes along its top and left sides.
  const [o, r, , l] = card
  const ux = { x: (r.x - o.x), y: (r.y - o.y) }
  const uy = { x: (l.x - o.x), y: (l.y - o.y) }
  const det = ux.x * uy.y - ux.y * uy.x
  const rad = 0.037 // corner radius, share of the width (3.18 mm of 85.6 mm)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - o.x
      const dy = y - o.y
      const u = (dx * uy.y - dy * uy.x) / det
      const t = (ux.x * dy - ux.y * dx) / det
      if (u < 0 || u > 1 || t < 0 || t > 1) continue
      const cu = Math.min(u, 1 - u)
      const ct = Math.min(t, 1 - t) * 0.63
      if (cu < rad && ct < rad && Math.hypot(rad - cu, rad - ct) > rad) continue
      let val = 215
      if (t > 0.04 && t < 0.1) val = 120 // printed band along the top, full width
      if (u > 0.04 && u < 0.32 && t > 0.2 && t < 0.8) val = 60 // photo
      v[y * W + x] = val + rnd() * 10
    }
  }
  return { w: W, h: H, v }
}

const TRUE: Quad = [{ x: 60, y: 320 }, { x: 940, y: 340 }, { x: 930, y: 895 }, { x: 50, y: 875 }]
const off = (q: Quad, f: (p: Point, i: number) => Point): Quad => q.map(f) as unknown as Quad
const worst = (a: Quad, b: Quad): number => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y)))

describe('refineQuad', () => {
  const g = photo(TRUE)

  it('pulls top and bottom edges that sit 7 % outside the card back onto it', () => {
    const h = 555
    const loose = off(TRUE, (p, i) => ({ x: p.x, y: p.y + (i < 2 ? -0.07 * h : 0.07 * h) }))
    expect(worst(loose, TRUE)).toBeGreaterThan(35)
    expect(worst(refineQuad(g, loose), TRUE)).toBeLessThan(5)
  })

  it('pushes sides that sit inside the card out to its border, past the printed band', () => {
    const tight = off(TRUE, (p, i) => ({ x: p.x + (i === 0 || i === 3 ? 30 : -30), y: p.y + (i < 2 ? 45 : -25) }))
    expect(worst(refineQuad(g, tight), TRUE)).toBeLessThan(5)
  })

  it('keeps corners that are already right', () => {
    expect(worst(refineQuad(g, TRUE), TRUE)).toBeLessThan(4)
  })

  it('keeps the quad as found when there is no edge to snap to', () => {
    const flat: Grey = { w: W, h: H, v: new Float32Array(W * H).fill(128) }
    const q = off(TRUE, (p) => ({ x: p.x + 20, y: p.y - 30 }))
    expect(refineQuad(flat, q)).toBe(q)
  })
})
