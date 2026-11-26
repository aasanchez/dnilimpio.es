// SPDX-License-Identifier: AGPL-3.0-or-later
// Straightens one photo without help: find the card (corners.ts: model, then edge detection), turn a
// sideways card to landscape, turn an upside-down card the right way up (upright.ts), then warp.
// Returns null when no card is found: the person then places the corners by hand.

import type { Quad } from '../geometry/homography.ts'
import { landscape, rotateQuad } from '../geometry/quad-edit.ts'
import { warpBitmap } from '../ui/warp-bitmap.ts'
import { shrink, wipe } from '../engine/wipe.ts'
import type { ModelZones, Side } from '../zones/types.ts'
import { findCorners } from './corners.ts'
import { anchorOf, isUpsideDown, type Grey } from './upright.ts'

/** Size of the small straightened copy used to check which way up the card is. */
const CHECK_W = 428

export interface AutoAlign {
  readonly quad: Quad
  readonly source: 'model' | 'edges'
  /** True when the card was found upside down and turned. */
  readonly turned: boolean
}

/** Grey levels of a small canvas, on a buffer the caller clears after use. */
type OwnGrey = Grey & { readonly v: Float32Array }

function greyOf (c: HTMLCanvasElement): OwnGrey {
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas unavailable')
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  try {
    const v = new Float32Array(c.width * c.height)
    for (let i = 0, j = 0; j < v.length; i += 4, j++) v[j] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!
    return { w: c.width, h: c.height, v }
  } finally {
    wipe(data)
  }
}

/** The card's corners in reading order (top-left of the upright card first), or null. */
export async function autoAlign (bitmap: ImageBitmap, doc: ModelZones, side: Side, size: { readonly w: number; readonly h: number }): Promise<AutoAlign | null> {
  const found = await findCorners(bitmap, size.w / size.h)
  if (!found) return null
  let quad = landscape(found.quad)
  const small = warpBitmap(bitmap, quad, { w: CHECK_W, h: Math.round(CHECK_W * size.h / size.w) })
  let grey: OwnGrey | undefined
  let turned = false
  try {
    grey = greyOf(small)
    const anchor = anchorOf(doc, side)
    turned = anchor ? isUpsideDown(grey, anchor) : false
  } finally {
    // The grey copy of the card is only needed for this check.
    shrink(small)
    wipe(grey?.v)
  }
  if (turned) quad = rotateQuad(rotateQuad(quad))
  return { quad, source: found.source, turned }
}
