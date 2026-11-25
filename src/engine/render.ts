// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser glue for the secure rendering path (spec §16). The preview and the PDF use the same function,
// so what the user reviews is exactly what is exported:
//   straightened card → sanitise() (greyscale, opaque masks, self-check) → watermark → new canvas
//   → JPEG → stripJpeg() → PDF.
// The card canvas is only read; the result is always a new canvas.
// The PDF step lives in export.ts, which is loaded on demand (it carries the PDF library).

import type { Rect } from '../zones/dni.ts'
import { sanitise } from './raster.ts'
import { drawWatermark } from './watermark.ts'

export interface RenderOptions {
  readonly masks: readonly Rect[]
  readonly greyscale: boolean
  readonly watermark: string
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
  const clean = sanitise(src, { masks: opts.masks, greyscale: opts.greyscale })
  src.data.fill(0)
  if (out.width !== width) out.width = width
  if (out.height !== height) out.height = height
  const ctx = context(out)
  const img = new ImageData(width, height)
  img.data.set(clean.data)
  clean.data.fill(0)
  ctx.putImageData(img, 0, 0)
  img.data.fill(0)
  drawWatermark(ctx, opts.watermark, width, height)
}

/** Saves a Blob as a file through a temporary object URL, which is revoked right after. */
export function saveFile (blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  // Revoke once the browser has started the download (some need the URL for a moment after the click).
  setTimeout(() => { URL.revokeObjectURL(url) }, 10_000)
}
