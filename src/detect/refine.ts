// SPDX-License-Identifier: AGPL-3.0-or-later
// Snaps a detector's corners onto the card's real edges. Pure: grey pixels and a quad in, a quad out.
//
// The model and the edge detector can both place a side a little off the card, for example on a
// textured background (a fabric's weave, a wood grain) or because the model regresses towards the
// region it was shown. The card's border is the one straight line, running the full length of each
// side, with a steady brightness step across it. So, for each side, this tries every nearby line
// (each end moved up to SEARCH of the card's size, in or out) and scores the mean step across it.
// Texture averages out along a line; a print feature inside the card covers only part of the side,
// so it scores lower than the border. Among lines with a clear step (at least OUTER_SHARE of the
// best), the outermost wins: a band printed along the border lies inside it, and on a light table
// it can be much stronger than the border itself. The corners are where the four kept lines
// cross. When no line has a clear step, or the answer looks wrong, the quad is kept as found.

import { isConvex, type Point, type Quad } from '../geometry/homography.ts'

export interface Grey { readonly w: number; readonly h: number; readonly v: ArrayLike<number> }

/** How far each end of a side may move, as a share of the card's size across that side. */
export const SEARCH = 0.12
/** Minimum mean brightness step across a line (grey levels) for it to count as an edge. */
export const MIN_STEP = 12
/**
 * Lines at least this share of the strongest one compete on position: the outermost wins. Low on
 * purpose: on a light table the card's border can be much weaker than a band printed inside it.
 */
export const OUTER_SHARE = 0.3
/** Points sampled along each candidate line (its middle 80 %, away from the rounded corners). */
const SAMPLES = 64
/** Brightness is compared at 1 to GAP pixels on each side of the line. */
const GAP = 4

interface Line { readonly a: Point; readonly b: Point }

/** Brightness at (x, y), bilinear, clamped to the image. */
function at (g: Grey, x: number, y: number): number {
  const cx = Math.min(g.w - 1, Math.max(0, x))
  const cy = Math.min(g.h - 1, Math.max(0, y))
  const x0 = Math.min(g.w - 2, Math.floor(cx))
  const y0 = Math.min(g.h - 2, Math.floor(cy))
  const fx = cx - x0
  const fy = cy - y0
  const i = y0 * g.w + x0
  const top = g.v[i]! * (1 - fx) + g.v[i + 1]! * fx
  const bottom = g.v[i + g.w]! * (1 - fx) + g.v[i + g.w + 1]! * fx
  return top * (1 - fy) + bottom * fy
}

/**
 * Mean brightness step across the segment a–b along the unit normal n (absolute value). Each sample
 * averages the differences at 1 to GAP pixels on either side, so a sharp edge answers most strongly
 * exactly on it and less and less on either side: the best line is a peak, not a plateau.
 */
export function stepAcross (g: Grey, a: Point, b: Point, n: Point): number {
  let sum = 0
  for (let i = 0; i < SAMPLES; i++) {
    const t = 0.1 + (0.8 * i) / (SAMPLES - 1)
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    for (let k = 1; k <= GAP; k++) sum += at(g, x + n.x * k, y + n.y * k) - at(g, x - n.x * k, y - n.y * k)
  }
  return Math.abs(sum / (SAMPLES * GAP))
}

const dist = (p: Point, q: Point): number => Math.hypot(p.x - q.x, p.y - q.y)

function cross (l: Line, m: Line): Point | null {
  const [x1, y1, x2, y2] = [l.a.x, l.a.y, l.b.x, l.b.y]
  const [x3, y3, x4, y4] = [m.a.x, m.a.y, m.b.x, m.b.y]
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(d) < 1e-9) return null
  const p = x1 * y2 - y1 * x2
  const q = x3 * y4 - y3 * x4
  return { x: (p * (x3 - x4) - (x1 - x2) * q) / d, y: (p * (y3 - y4) - (y1 - y2) * q) / d }
}

const shift = (p: Point, n: Point, d: number): Point => ({ x: p.x + n.x * d, y: p.y + n.y * d })

/** The best line near side a–b, or the side itself when nothing nearby has a clear step. */
function snapSide (g: Grey, a: Point, b: Point, across: number): Line {
  const len = dist(a, b)
  if (len < 8) return { a, b }
  const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len }
  const reach = Math.max(2, SEARCH * across)
  const step = Math.max(1, reach / 20)
  const found: Array<{ da: number; db: number; score: number; out: number }> = []
  let top = stepAcross(g, a, b, n)
  for (let da = -reach; da <= reach; da += step) {
    for (let db = -reach; db <= reach; db += step) {
      const score = stepAcross(g, shift(a, n, da), shift(b, n, db), n)
      found.push({ da, db, score, out: da + db })
      top = Math.max(top, score)
    }
  }
  if (top < MIN_STEP) return { a, b }
  // Among the clearly strong lines, the outermost. `n` points out of the card for corners in
  // clockwise order (top-left, top-right, bottom-right, bottom-left, y down).
  let best = found[0]!
  for (const f of found) {
    if (f.score < OUTER_SHARE * top) continue
    if (best.score < OUTER_SHARE * top || f.out > best.out) best = f
  }
  // That line may sit on the shoulder of its edge: climb to the edge's peak with finer steps.
  // The window moves with the best line until nothing near it is better.
  let { da, db, score } = best
  const fine = step / 4
  for (let round = 0; round < 12; round++) {
    const [da0, db0] = [da, db]
    for (let ea = da0 - 2 * step; ea <= da0 + 2 * step; ea += fine) {
      for (let eb = db0 - 2 * step; eb <= db0 + 2 * step; eb += fine) {
        const s2 = stepAcross(g, shift(a, n, ea), shift(b, n, eb), n)
        if (s2 > score) { score = s2; da = ea; db = eb }
      }
    }
    if (da === da0 && db === db0) break
  }
  return { a: shift(a, n, da), b: shift(b, n, db) }
}

/** The quad with each side moved onto the nearest strong straight edge; `q` itself when unsure. */
export function refineQuad (g: Grey, q: Quad): Quad {
  const across = [
    (dist(q[0], q[3]) + dist(q[1], q[2])) / 2, // top and bottom sides: the card's height
    (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, // left and right sides: its width
  ] as const
  const lines = [0, 1, 2, 3].map((i) => snapSide(g, q[i]!, q[(i + 1) % 4]!, across[i % 2]!))
  if (lines.every((l, i) => l.a === q[i])) return q
  const pts: Point[] = []
  for (let i = 0; i < 4; i++) {
    const p = cross(lines[(i + 3) % 4]!, lines[i]!)
    if (!p) return q
    // A corner far from where it started means the lines crossed somewhere odd: keep the original.
    if (dist(p, q[i]!) > 2 * SEARCH * Math.max(across[0], across[1])) return q
    pts.push(p)
  }
  const out = pts as unknown as Quad
  return isConvex(out) ? out : q
}
