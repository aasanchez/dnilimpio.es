// SPDX-License-Identifier: AGPL-3.0-or-later
// Property-based tests for straightening: the homography and the perspective warp. The fields are
// hidden on the straightened card, so these maps decide which part of the photo a zone covers.
// Inputs come from the seeded generator in property.ts; a failure prints the seed that repeats it.
import { describe, expect, it } from 'vitest'
import { apply, homography, isConvex, type Point, type Quad } from '../../src/geometry/homography.ts'
import { warpToCard, type RGBA } from '../../src/geometry/warp.ts'
import { check, type Rng } from './property.ts'

// ---------- Generators ----------

/**
 * A convex quad in a photo, corners in the order top-left, top-right, bottom-right, bottom-left:
 * a rectangle seen at an angle. Each corner sits in its own quarter of an ellipse, so the quad is
 * convex and never folds over.
 */
function cardQuad (r: Rng, w = 1000, h = 800): Quad {
  const cx = r.float(0.3, 0.7) * w
  const cy = r.float(0.3, 0.7) * h
  const rx = r.float(0.15, 0.45) * w
  const ry = r.float(0.15, 0.45) * h
  const turn = r.float(-0.4, 0.4)
  // Quarter centres for TL, TR, BR, BL in image coordinates (y grows downwards).
  const centres = [-3 * Math.PI / 4, -Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4]
  const corners = centres.map((c) => {
    const a = c + turn + r.float(-0.6, 0.6)
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }
  })
  return corners as unknown as Quad
}

const scaleOf = (q: Quad): number => Math.max(...q.map((p) => Math.hypot(p.x, p.y)), 1)
const close = (a: Point, b: Point, tol: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= tol

/** Signed distance from `p` to the edge a→b; positive on the inner side of a quad wound like `sign`. */
function edgeDistance (a: Point, b: Point, p: Point, sign: number): number {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
  return (sign * cross) / Math.hypot(b.x - a.x, b.y - a.y)
}

function winding (q: Quad): number {
  const [a, b, c] = q
  return Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x))
}

/** Distance from `p` to the nearest edge of `q`; negative when `p` is outside. */
function depth (q: Quad, p: Point): number {
  const s = winding(q)
  return Math.min(...q.map((a, i) => edgeDistance(a, q[(i + 1) % 4]!, p, s)))
}

const rect = (w: number, h: number): Quad => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]

// ---------- Homography ----------

describe('homography, for any convex card quad', () => {
  it('maps each corner to its partner', () => {
    check('corners', (r) => ({ src: cardQuad(r), dst: cardQuad(r) }), ({ src, dst }) => {
      expect(isConvex(src) && isConvex(dst)).toBe(true)
      const m = homography(src, dst)
      expect(m).not.toBeNull()
      const tol = 1e-6 * scaleOf(dst)
      src.forEach((p, i) => { expect(close(apply(m!, p), dst[i]!, tol)).toBe(true) })
    })
  })

  it('is undone by the homography in the other direction', () => {
    check('round trip', (r) => {
      const src = cardQuad(r)
      // A point inside the source quad: a random blend of its corners.
      const wts = src.map(() => r.next() + 0.01)
      const sum = wts.reduce((a, b) => a + b, 0)
      const p = { x: src.reduce((a, q, i) => a + q.x * wts[i]!, 0) / sum, y: src.reduce((a, q, i) => a + q.y * wts[i]!, 0) / sum }
      return { src, dst: cardQuad(r), p }
    }, ({ src, dst, p }) => {
      const there = homography(src, dst)
      const back = homography(dst, src)
      expect(there && back).toBeTruthy()
      expect(close(apply(back!, apply(there!, p)), p, 1e-6 * scaleOf(src))).toBe(true)
    })
  })

  it('maps every point of the straightened card inside the card quad in the photo', () => {
    check('inside stays inside', (r) => ({ quad: cardQuad(r), u: r.next(), v: r.next() }), ({ quad, u, v }) => {
      const W = 1712
      const H = 1080
      const m = homography(rect(W, H), quad)!
      const p = apply(m, { x: u * W, y: v * H })
      expect(depth(quad, p)).toBeGreaterThanOrEqual(-1e-6 * scaleOf(quad))
    })
  })

  it('refuses a quad with three corners on one line', () => {
    check('collinear', (r) => {
      const q = [...cardQuad(r)] as Point[]
      // Put corner k on the line through its two neighbours.
      const k = r.int(0, 3)
      const a = q[(k + 3) % 4]!
      const b = q[(k + 1) % 4]!
      const t = r.float(0.2, 0.8)
      q[k] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      return q as unknown as Quad
    }, (q) => {
      expect(isConvex(q)).toBe(false)
      expect(homography(rect(1712, 1080), q)).toBeNull()
    })
  })
})

// ---------- Warp ----------

describe('warpToCard, for any convex card quad', () => {
  const A = [200, 40, 10, 255]
  const B = [10, 90, 220, 255]

  it('fills the straightened card only from pixels inside the card quad', () => {
    check('warp samples the card', (r) => {
      const sw = r.int(40, 120)
      const sh = r.int(40, 120)
      return { quad: cardQuad(r, sw, sh), sw, sh, ow: r.int(8, 40), oh: r.int(6, 30) }
    }, ({ quad, sw, sh, ow, oh }) => {
      // The card is colour A, the background colour B (by pixel centre).
      const data = new Uint8ClampedArray(sw * sh * 4)
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) data.set(depth(quad, { x: x + 0.5, y: y + 0.5 }) >= 0 ? A : B, (y * sw + x) * 4)
      }
      const src: RGBA = { width: sw, height: sh, data }
      const out = warpToCard(src, quad, { width: ow, height: oh, data: new Uint8ClampedArray(ow * oh * 4) })
      const m = homography(rect(ow, oh), quad)!
      for (let y = 0; y < oh; y++) {
        for (let x = 0; x < ow; x++) {
          // Bilinear sampling reads the 2 × 2 pixels around the sample point; if they are all card pixels the result is exactly A.
          const p = apply(m, { x: x + 0.5, y: y + 0.5 })
          if (depth(quad, p) < 1.5) continue
          const o = (y * ow + x) * 4
          expect([...out.data.subarray(o, o + 4)], `output ${String(x)},${String(y)}`).toEqual(A)
        }
      }
    }, { runs: 100 })
  })
})
