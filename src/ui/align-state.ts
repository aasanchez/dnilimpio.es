// SPDX-License-Identifier: AGPL-3.0-or-later
// Alignment results per side (spec §4.2). Plain object, mutated by the align screens: the canvases
// are large and must not be wrapped in reactive proxies.

import type { Quad } from '../geometry/homography.ts'
import type { Side } from '../zones/dni.ts'

export interface AlignState {
  quads: Record<Side, Quad | null>;
  /** Straightened 1712 × 1080 card per side; null until the card is straightened. */
  warped: Record<Side, HTMLCanvasElement | null>;
  /** Which detector placed the corners automatically; null when nobody did or the person confirmed them. */
  found: Record<Side, 'model' | 'edges' | null>;
}

export function emptyAlignState (): AlignState {
  return { quads: { front: null, back: null }, warped: { front: null, back: null }, found: { front: null, back: null } }
}

/** Drops everything derived from one side, e.g. when its photo is replaced. Shrinks the canvas to free memory. */
export function resetSide (state: AlignState, side: Side): void {
  state.quads[side] = null
  state.found[side] = null
  const c = state.warped[side]
  if (c) {
    c.width = 0
    c.height = 0
  }
  state.warped[side] = null
}

/**
 * What switching from one side to the other does with the side being left (PR #81).
 * Moved, valid corners are saved (straightened) and the side is done. Moved but crossed corners stay
 * on screen and the side is not done. Corners nobody moved keep the side as it was (`wasDone`), so a
 * default frame or an unchecked detection never counts as confirmed.
 */
export function leaveSide (touched: boolean, valid: boolean, wasDone: boolean): { save: boolean; done: boolean } {
  return touched ? { save: valid, done: valid } : { save: false, done: wasDone }
}
