// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { ID1_ASPECT, detectCard, orderQuad, quadAspect, type RGBA } from '../../src/detect/edges.ts'
import type { Point, Quad } from '../../src/geometry/homography.ts'

/** Deterministic pseudo-random numbers, so the noise is the same on every run. */
function rng (seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

function inside (q: Quad, x: number, y: number): boolean {
  let pos = 0
  let neg = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]!
    const b = q[(i + 1) % 4]!
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
    if (c > 0) pos++
    else if (c < 0) neg++
  }
  return pos === 0 || neg === 0
}

/** A light card with some dark "print" on a darker, noisy background. */
function scene (w: number, h: number, q: Quad, opts: { bg?: number; card?: number; noise?: number; seed?: number } = {}): RGBA {
  const { bg = 60, card = 215, noise = 18, seed = 1 } = opts
  const r = rng(seed)
  const data = new Uint8ClampedArray(w * h * 4)
  const cx = (q[0].x + q[2].x) / 2
  const cy = (q[0].y + q[2].y) / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = inside(q, x + 0.5, y + 0.5) ? card : bg
      // "Text" stripes inside the card, so its interior is not flat.
      if (v === card && Math.abs(y - cy) % 40 < 6 && Math.abs(x - cx) < 0.3 * w) v = 90
      v += (r() - 0.5) * noise
      const o = (y * w + x) * 4
      data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255
    }
  }
  return { width: w, height: h, data }
}

const maxCornerError = (a: Quad, b: Quad): number => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y)))

/** A card of the given aspect, centred, rotated by `deg`, with a mild perspective squeeze on the right. */
function cardQuad (w: number, h: number, cardW: number, aspect: number, deg: number, squeeze = 0): Quad {
  const ch = cardW / aspect
  const a = (deg * Math.PI) / 180
  const pts: Point[] = [
    { x: -cardW / 2, y: -ch / 2 }, { x: cardW / 2, y: -ch / 2 * (1 - squeeze) },
    { x: cardW / 2, y: ch / 2 * (1 - squeeze) }, { x: -cardW / 2, y: ch / 2 },
  ].map((p) => ({ x: w / 2 + p.x * Math.cos(a) - p.y * Math.sin(a), y: h / 2 + p.x * Math.sin(a) + p.y * Math.cos(a) }))
  return orderQuad(pts)
}

describe('detectCard', () => {
  it('finds an upright card', () => {
    const q = cardQuad(800, 600, 600, ID1_ASPECT, 0)
    const d = detectCard(scene(800, 600, q))
    expect(d).not.toBeNull()
    expect(maxCornerError(d!.quad, q)).toBeLessThan(800 * 0.015)
    expect(d!.confidence).toBeGreaterThan(0.6)
  })

  it('finds a rotated card with perspective in a large photo', () => {
    const q = cardQuad(1600, 1200, 1100, ID1_ASPECT, 12, 0.08)
    const d = detectCard(scene(1600, 1200, q, { seed: 7 }))
    expect(d).not.toBeNull()
    expect(maxCornerError(d!.quad, q)).toBeLessThan(1600 * 0.015)
  })

  it('finds a card held in portrait orientation', () => {
    const q = cardQuad(600, 800, 600, ID1_ASPECT, 90)
    const d = detectCard(scene(600, 800, q, { seed: 3 }))
    expect(d).not.toBeNull()
    expect(maxCornerError(d!.quad, q)).toBeLessThan(800 * 0.015)
  })

  it('uses the aspect ratio it is given', () => {
    const aspect = 83 / 53 // EU registration certificate card
    const q = cardQuad(800, 600, 560, aspect, -6)
    const d = detectCard(scene(800, 600, q, { seed: 5 }), { aspect })
    expect(d).not.toBeNull()
    expect(quadAspect(d!.quad)).toBeCloseTo(aspect, 1)
  })

  it('returns null when there is no card', () => {
    expect(detectCard(scene(800, 600, cardQuad(800, 600, 0.001, ID1_ASPECT, 0), { seed: 9 }))).toBeNull()
    const flat: RGBA = { width: 300, height: 200, data: new Uint8ClampedArray(300 * 200 * 4).fill(128) }
    expect(detectCard(flat)).toBeNull()
  })

  it('does not change the input', () => {
    const img = scene(400, 300, cardQuad(400, 300, 300, ID1_ASPECT, 0))
    const copy = new Uint8ClampedArray(img.data)
    detectCard(img)
    expect(img.data).toEqual(copy)
  })
})

describe('orderQuad', () => {
  it('orders corners clockwise from the top-left', () => {
    const q = orderQuad([{ x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 0 }])
    expect(q).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])
  })
})
