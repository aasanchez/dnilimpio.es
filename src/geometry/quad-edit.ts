// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure helpers for the corner editor (spec §4.2): start position, hit-testing, clamping, rotation.
// Coordinates are source-image pixels. Corner order is always top-left, top-right, bottom-right,
// bottom-left of the card as it should appear after straightening.

import type { Point, Quad } from './homography.ts'
import { CARD_PX } from './warp.ts'

/**
 * Starting quad: a document-shaped rectangle centred in the image, covering 70 % of its limiting side.
 * `aspect` is the document's width / height (ID-1 card by default).
 */
export function defaultQuad (width: number, height: number, aspect = CARD_PX.w / CARD_PX.h): Quad {
  let w = width * 0.7
  let h = w / aspect
  if (h > height * 0.7) {
    h = height * 0.7
    w = h * aspect
  }
  const x0 = (width - w) / 2
  const y0 = (height - h) / 2
  return [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }]
}

/** Index of the corner closest to `p`, or null if none is within `maxDist`. */
export function nearestCorner (q: Quad, p: Point, maxDist: number): number | null {
  let best: number | null = null
  let bestD = maxDist
  for (let i = 0; i < 4; i++) {
    const d = Math.hypot(q[i]!.x - p.x, q[i]!.y - p.y)
    if (d <= bestD) {
      best = i
      bestD = d
    }
  }
  return best
}

/** Returns a copy of `q` with corner `i` moved to `p`, clamped to the image bounds. */
export function moveCorner (q: Quad, i: number, p: Point, width: number, height: number): Quad {
  const c = { x: Math.min(Math.max(p.x, 0), width), y: Math.min(Math.max(p.y, 0), height) }
  return [i === 0 ? c : q[0], i === 1 ? c : q[1], i === 2 ? c : q[2], i === 3 ? c : q[3]]
}

/**
 * Relabels the corners so the straightened card turns 90° clockwise: the old left edge becomes the
 * top edge. Use when the photo was taken sideways. Four calls return the original quad.
 */
export function rotateQuad (q: Quad): Quad {
  return [q[3], q[0], q[1], q[2]]
}

/** Maps a quad between two image sizes (e.g. full-resolution source and a downscaled copy). */
export function scaleQuad (q: Quad, sx: number, sy: number): Quad {
  return [
    { x: q[0].x * sx, y: q[0].y * sy },
    { x: q[1].x * sx, y: q[1].y * sy },
    { x: q[2].x * sx, y: q[2].y * sy },
    { x: q[3].x * sx, y: q[3].y * sy },
  ]
}

/**
 * Scale factor (≤ 1) that keeps width × height under `maxPixels`. iOS Safari refuses canvases above
 * about 16.7 million pixels, and 48 MP phone photos exceed that.
 */
export function fitPixels (width: number, height: number, maxPixels = 16_000_000): number {
  const area = width * height
  return area <= maxPixels ? 1 : Math.sqrt(maxPixels / area)
}
