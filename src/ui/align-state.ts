// SPDX-License-Identifier: AGPL-3.0-or-later
// Alignment results per side (spec §4.2). Plain object, mutated by the align screens: the canvases
// are large and must not be wrapped in reactive proxies.

import type { Quad } from '../geometry/homography.ts'
import type { Side } from '../zones/dni.ts'

export interface AlignState {
  quads: Record<Side, Quad | null>;
  /** Straightened 1712 × 1080 card per side; null until the user confirms the corners. */
  warped: Record<Side, HTMLCanvasElement | null>;
}

export function emptyAlignState (): AlignState {
  return { quads: { front: null, back: null }, warped: { front: null, back: null } }
}

/** Drops everything derived from one side, e.g. when its photo is replaced. Shrinks the canvas to free memory. */
export function resetSide (state: AlignState, side: Side): void {
  state.quads[side] = null
  const c = state.warped[side]
  if (c) {
    c.width = 0
    c.height = 0
  }
  state.warped[side] = null
}
