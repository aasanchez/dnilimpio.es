// SPDX-License-Identifier: AGPL-3.0-or-later
// Is the straightened card upright, or upside down? Pure: grey pixels and one box in, an answer out.
//
// A corner detector finds the card's outline, not which way up it is: a card photographed upside
// down comes out upside down. Each side has one large, dark, dense block at a known place: the
// holder's photo on the front (left), the machine-readable zone on the back (bottom). The method
// compares the "ink" (darkness plus fine detail) inside that box with the ink in the same box turned
// 180°. The turn wins only by a clear margin; otherwise the card stays as found (most photos are
// taken upright). A sideways card is turned to landscape before this (quad-edit.ts, landscape).

import type { ModelZones, Rect, Side } from '../zones/types.ts'

export interface Grey { readonly w: number; readonly h: number; readonly v: ArrayLike<number> }

/** How much more ink the turned box must hold before the card is turned (grey levels, 0–255). */
export const TURN_MARGIN = 12

/** The side's large dark block: the photo on the front, the machine-readable zone on the back. */
export function anchorOf (doc: ModelZones, side: Side): Rect | undefined {
  return side === 'front' ? doc.portrait : doc.zones.find((z) => z.id === 'mrz' && z.side === 'back')?.rects[0]
}

/** The box turned 180° about the card's centre. */
export function turnRect (r: Rect): Rect {
  return { x: 1 - r.x - r.w, y: 1 - r.y - r.h, w: r.w, h: r.h }
}

/** Mean ink inside `r`: darkness (255 − grey) plus fine detail (differences with the right and lower neighbours). */
export function inkIn (g: Grey, r: Rect): number {
  const { w, h, v } = g
  const x0 = Math.max(0, Math.floor(r.x * w)); const x1 = Math.min(w - 1, Math.ceil((r.x + r.w) * w))
  const y0 = Math.max(0, Math.floor(r.y * h)); const y1 = Math.min(h - 1, Math.ceil((r.y + r.h) * h))
  let sum = 0; let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x
      sum += 255 - v[i]! + Math.abs(v[i]! - v[i + 1]!) + Math.abs(v[i]! - v[i + w]!)
      n++
    }
  }
  return n === 0 ? 0 : sum / n
}

/** True when the anchor box holds clearly more ink turned 180° than as found. */
export function isUpsideDown (g: Grey, anchor: Rect): boolean {
  return inkIn(g, turnRect(anchor)) - inkIn(g, anchor) > TURN_MARGIN
}
