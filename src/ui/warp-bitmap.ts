// SPDX-License-Identifier: AGPL-3.0-or-later
// Bridges ImageBitmap ↔ the pure warp kernel: reads the photo's pixels once, warps, returns a
// canvas of the document's size (1712 × 1080 for an ID-1 card). The temporary full-size canvas is shrunk to 0 × 0 right after use (§4.8).

import type { Quad } from '../geometry/homography.ts'
import { fitPixels, scaleQuad } from '../geometry/quad-edit.ts'
import { CARD_PX, warpToCard } from '../geometry/warp.ts'
import { shrink, wipe } from '../engine/wipe.ts'

export function warpBitmap (bitmap: ImageBitmap, quad: Quad, size: { readonly w: number, readonly h: number } = CARD_PX): HTMLCanvasElement {
  const s = fitPixels(bitmap.width, bitmap.height)
  const w = Math.max(1, Math.round(bitmap.width * s))
  const h = Math.max(1, Math.round(bitmap.height * s))
  const tmp = document.createElement('canvas')
  let src: ImageData | undefined
  let out: ImageData | undefined
  try {
    tmp.width = w
    tmp.height = h
    const tctx = tmp.getContext('2d', { willReadFrequently: true })
    if (!tctx) throw new Error('2D canvas unavailable')
    tctx.drawImage(bitmap, 0, 0, w, h)
    src = tctx.getImageData(0, 0, w, h)
    shrink(tmp)

    out = new ImageData(size.w, size.h)
    warpToCard(src, scaleQuad(quad, w / bitmap.width, h / bitmap.height), out)
    wipe(src.data)

    const canvas = document.createElement('canvas')
    canvas.width = size.w
    canvas.height = size.h
    canvas.getContext('2d')?.putImageData(out, 0, 0)
    return canvas
  } finally {
    // Also when a step throws (e.g. the photo was closed meanwhile): no copy outlives this call.
    shrink(tmp)
    wipe(src?.data, out?.data)
  }
}
