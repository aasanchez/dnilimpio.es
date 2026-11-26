// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser glue for the secure rendering path (spec §16). The preview and the PDF use the same function,
// so what the user reviews is exactly what is exported:
//   straightened card → sanitise() (greyscale, opaque masks, self-check) → watermark → new canvas
//   → JPEG → stripJpeg() → PDF.
// The card canvas is only read; the result is always a new canvas.
// The PDF step lives in export.ts, which is loaded on demand (it carries the PDF library).

import type { Rect } from '../zones/dni.ts'
import { sanitise } from './raster.ts'
import { drawWatermark, type WatermarkStyle } from './watermark.ts'
import { downloadUrl } from './downloads.ts'
import { wipe } from './wipe.ts'

export interface RenderOptions {
  readonly masks: readonly Rect[]
  readonly greyscale: boolean
  readonly watermark: string
  readonly watermarkStyle?: WatermarkStyle
}

function context (c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return ctx
}

/** Draws the sanitised version of `card` into `out` (resized to match). */
export function renderSecure (card: HTMLCanvasElement, opts: RenderOptions, out: HTMLCanvasElement): void {
  const { width, height } = card
  const src = context(card).getImageData(0, 0, width, height)
  let clean: { data: Uint8ClampedArray } | undefined
  let img: ImageData | undefined
  try {
    clean = sanitise(src, { masks: opts.masks, greyscale: opts.greyscale })
    if (out.width !== width) out.width = width
    if (out.height !== height) out.height = height
    const ctx = context(out)
    img = new ImageData(width, height)
    img.data.set(clean.data)
    ctx.putImageData(img, 0, 0)
    drawWatermark(ctx, opts.watermark, width, height, opts.watermarkStyle)
  } finally {
    // Also when the self-check or drawing fails: no copy of the card's pixels outlives this call.
    wipe(src.data, clean?.data, img?.data)
  }
}

/**
 * Saves a Blob as a file through a temporary object URL. The URL is revoked after a short delay, or
 * at once by revokeDownloads() (downloads.ts) when the person clears everything or leaves the page.
 */
export function saveFile (blob: Blob, name: string): void {
  const url = downloadUrl(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
}
