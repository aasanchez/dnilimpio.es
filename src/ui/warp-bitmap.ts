// SPDX-License-Identifier: AGPL-3.0-or-later
// Bridges ImageBitmap ↔ the pure warp kernel: reads the photo's pixels once, warps, returns a
// 1712 × 1080 canvas. The temporary full-size canvas is shrunk to 0 × 0 right after use (§4.8).

import type { Quad } from '../geometry/homography.ts'
import { fitPixels, scaleQuad } from '../geometry/quad-edit.ts'
import { CARD_PX, warpToCard } from '../geometry/warp.ts'

export function warpBitmap (bitmap: ImageBitmap, quad: Quad): HTMLCanvasElement {
  const s = fitPixels(bitmap.width, bitmap.height)
  const w = Math.max(1, Math.round(bitmap.width * s))
  const h = Math.max(1, Math.round(bitmap.height * s))
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const tctx = tmp.getContext('2d', { willReadFrequently: true })
  if (!tctx) throw new Error('2D canvas unavailable')
  tctx.drawImage(bitmap, 0, 0, w, h)
  const src = tctx.getImageData(0, 0, w, h)
  tmp.width = 0
  tmp.height = 0

  const out = new ImageData(CARD_PX.w, CARD_PX.h)
  warpToCard(src, scaleQuad(quad, w / bitmap.width, h / bitmap.height), out)
  src.data.fill(0)

  const canvas = document.createElement('canvas')
  canvas.width = CARD_PX.w
  canvas.height = CARD_PX.h
  canvas.getContext('2d')?.putImageData(out, 0, 0)
  out.data.fill(0)
  return canvas
}
