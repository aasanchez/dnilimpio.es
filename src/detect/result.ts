// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure checks on a corner detector's answer: no DOM, tested in Node.
// A detector only suggests corners; the user always confirms them in the corner editor. An answer
// that fails any check here is dropped, and the editor keeps its manual starting position.

import { isConvex, type Quad } from '../geometry/homography.ts'

export interface Detection {
  /** Card corners in image pixels: top-left, top-right, bottom-right, bottom-left. */
  readonly quad: Quad;
  /** Confidence from 0 to 1 that a card is in the photo. */
  readonly score: number;
  readonly source: 'model' | 'edges';
}

/** Below this confidence the model's corners are not used. */
export const MIN_SCORE = 0.5
/** The card must cover at least this share of the photo. */
export const MIN_AREA = 0.04
/** Corners may sit this far outside the photo (share of its size) before the answer is dropped. */
const MARGIN = 0.05

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x))

function area (q: Quad): number {
  let a = 0
  for (let i = 0; i < 4; i++) {
    const p = q[i]!
    const n = q[(i + 1) % 4]!
    a += p.x * n.y - n.x * p.y
  }
  return Math.abs(a) / 2
}

/**
 * Turns the model's raw output into a Detection, or null if it should not be used.
 * `coords` holds 8 numbers from 0 to 1 (x, y for top-left, top-right, bottom-right, bottom-left);
 * `scoreLogit` is the "a document is present" logit.
 */
export function modelDetection (coords: ArrayLike<number>, scoreLogit: number, width: number, height: number): Detection | null {
  if (coords.length !== 8 || !(width > 0) || !(height > 0)) return null
  const score = sigmoid(scoreLogit)
  if (!(score >= MIN_SCORE)) return null
  const pts = []
  for (let i = 0; i < 4; i++) {
    const u = coords[2 * i]!
    const v = coords[2 * i + 1]!
    if (!Number.isFinite(u) || !Number.isFinite(v)) return null
    if (u < -MARGIN || u > 1 + MARGIN || v < -MARGIN || v > 1 + MARGIN) return null
    const clamp = (n: number): number => Math.min(1, Math.max(0, n))
    pts.push({ x: clamp(u) * width, y: clamp(v) * height })
  }
  const quad = pts as unknown as Quad
  if (!isConvex(quad) || area(quad) < MIN_AREA * width * height) return null
  return { quad, score, source: 'model' }
}
