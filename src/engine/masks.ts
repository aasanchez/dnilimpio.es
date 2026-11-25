// SPDX-License-Identifier: AGPL-3.0-or-later
// Manual black boxes (spec §13). Rectangles are in normalised card coordinates (0–1, origin top-left),
// the same space as the template zones, so zoom, display size and RTL layout never shift them.
// Pure functions: the editor turns pointer and keyboard input into these calls.

import type { Rect } from '../zones/dni.ts'

export interface Point { readonly x: number; readonly y: number }

/** Smallest box, as a fraction of the card: about 9 × 9 px on a 1712 × 1080 card. */
export const MIN_SIZE = 0.005

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** Rectangle spanned by two points, in any order, clamped to the card. */
export function fromPoints (a: Point, b: Point): Rect {
  const x0 = clamp01(Math.min(a.x, b.x))
  const y0 = clamp01(Math.min(a.y, b.y))
  const x1 = clamp01(Math.max(a.x, b.x))
  const y1 = clamp01(Math.max(a.y, b.y))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function isUsable (r: Rect): boolean {
  return r.w >= MIN_SIZE && r.h >= MIN_SIZE
}

/** Moves a box by (dx, dy), keeping it whole inside the card. */
export function move (r: Rect, dx: number, dy: number): Rect {
  return { x: Math.min(1 - r.w, Math.max(0, r.x + dx)), y: Math.min(1 - r.h, Math.max(0, r.y + dy)), w: r.w, h: r.h }
}

/** Corner handles: nw, ne, se, sw. */
export type Handle = 'nw' | 'ne' | 'se' | 'sw'
export const HANDLES: readonly Handle[] = ['nw', 'ne', 'se', 'sw']

export function handlePoint (r: Rect, h: Handle): Point {
  return { x: h === 'nw' || h === 'sw' ? r.x : r.x + r.w, y: h === 'nw' || h === 'ne' ? r.y : r.y + r.h }
}

/** Drags one corner to `p`; the opposite corner stays fixed. Never smaller than MIN_SIZE. */
export function resize (r: Rect, h: Handle, p: Point): Rect {
  const opposite = handlePoint(r, h === 'nw' ? 'se' : h === 'ne' ? 'sw' : h === 'se' ? 'nw' : 'ne')
  const next = fromPoints(opposite, p)
  if (isUsable(next)) return next
  return r
}

/** Grows or shrinks the box from its bottom-right corner (keyboard resizing). */
export function grow (r: Rect, dw: number, dh: number): Rect {
  const w = Math.min(1 - r.x, Math.max(MIN_SIZE, r.w + dw))
  const h = Math.min(1 - r.y, Math.max(MIN_SIZE, r.h + dh))
  return { x: r.x, y: r.y, w, h }
}

export type Hit = { readonly index: number; readonly handle: Handle | null } | null

/**
 * What is under `p`: a corner handle of the selected box first (within `tol` in x and `tolY` in y,
 * so the hit area stays square on a non-square card), then the topmost box containing `p`.
 */
export function hitTest (boxes: readonly Rect[], selected: number | null, p: Point, tol: number, tolY = tol): Hit {
  if (selected !== null) {
    const r = boxes[selected]
    if (r) {
      for (const h of HANDLES) {
        const c = handlePoint(r, h)
        if (Math.abs(c.x - p.x) <= tol && Math.abs(c.y - p.y) <= tolY) return { index: selected, handle: h }
      }
    }
  }
  for (let i = boxes.length - 1; i >= 0; i--) {
    const r = boxes[i]
    if (r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return { index: i, handle: null }
  }
  return null
}

/** A new box centred on the card, for keyboard users (then moved with the arrow keys). */
export function centredBox (): Rect {
  return { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }
}
