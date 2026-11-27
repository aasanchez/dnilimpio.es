// SPDX-License-Identifier: AGPL-3.0-or-later
// Secure raster (spec §16): builds a new RGBA buffer in which sensitive pixels are replaced, not covered.
// Order: optional greyscale → opaque masks (expanded outwards) → verification. The watermark is drawn
// after this step, on a canvas; sealMasks() then paints the masks again over it and checks the final
// pixels, so every masked pixel of the exported raster is opaque black. The result is re-encoded as a
// new image (see jpeg.ts and pdf.ts).
// Pure functions on RGBA buffers: no DOM, so the tests run in Node.

import { fillRects, toPixels, type PxRect } from '../redact/zones.ts'
import type { Rect } from '../zones/dni.ts'

export interface RGBA { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }

/** Default outward margin around every mask, in pixels, so no partial glyph stays visible at an edge. */
export const MASK_MARGIN_PX = 2

/** Grows a pixel rectangle by `margin` on every side, clamped to the image. */
export function expandRect (r: PxRect, margin: number, width: number, height: number): PxRect {
  const x0 = Math.max(0, r.x - margin)
  const y0 = Math.max(0, r.y - margin)
  const x1 = Math.min(width, r.x + r.w + margin)
  const y1 = Math.min(height, r.y + r.h + margin)
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
}

/** Normalised (0–1) masks → expanded pixel rectangles for an image of the given size. */
export function maskPixels (masks: readonly Rect[], width: number, height: number, margin = MASK_MARGIN_PX): PxRect[] {
  return masks
    .map((m) => expandRect(toPixels(m, width, height), margin, width, height))
    .filter((r) => r.w > 0 && r.h > 0)
}

/**
 * Greyscale in place with BT.601 luma weights (Uint8ClampedArray rounds to the nearest value).
 * Alpha is left as it is. Greyscale is a presentation option, not a security measure (§15).
 */
export function toGreyscale (img: RGBA): void {
  const d = img.data
  for (let o = 0; o < d.length; o += 4) {
    const y = (299 * d[o]! + 587 * d[o + 1]! + 114 * d[o + 2]!) / 1000
    d[o] = y
    d[o + 1] = y
    d[o + 2] = y
  }
}

/** Makes every pixel fully opaque by compositing onto white, so no colour hides in the alpha channel. */
export function flattenAlpha (img: RGBA): void {
  const d = img.data
  for (let o = 0; o < d.length; o += 4) {
    const a = d[o + 3]!
    if (a === 255) continue
    for (let c = 0; c < 3; c++) d[o + c] = (d[o + c]! * a + 255 * (255 - a) + 127) / 255
    d[o + 3] = 255
  }
}

/** Index of the first pixel inside `rects` that is not opaque black, or -1 when all are. */
export function findUnmaskedPixel (img: RGBA, rects: readonly PxRect[]): number {
  const d = img.data
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const o = (y * img.width + x) * 4
        if (d[o] !== 0 || d[o + 1] !== 0 || d[o + 2] !== 0 || d[o + 3] !== 255) return y * img.width + x
      }
    }
  }
  return -1
}

export interface SanitiseOptions {
  /** Normalised rectangles to hide (detected fields that are checked, plus manual masks). */
  readonly masks: readonly Rect[]
  readonly greyscale: boolean
  readonly margin?: number
}

/**
 * Returns a new buffer: the input is never modified, so the editor can still restore colour or
 * un-hide a field. Throws if any masked pixel survived, which would be a bug, not a user error.
 */
export function sanitise (src: RGBA, opts: SanitiseOptions): RGBA {
  const out: RGBA = { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) }
  flattenAlpha(out)
  if (opts.greyscale) toGreyscale(out)
  const rects = maskPixels(opts.masks, out.width, out.height, opts.margin ?? MASK_MARGIN_PX)
  fillRects(out.data, out.width, out.height, rects)
  if (findUnmaskedPixel(out, rects) !== -1) {
    // The copy is thrown away: clear it first, so a failed check leaves no copy of the card behind.
    out.data.fill(0)
    throw new Error('Redaction check failed: a masked pixel is not opaque black')
  }
  return out
}

/** The two operations sealMasks() needs from a canvas, so the check runs in Node too. */
export interface MaskSurface {
  /** Paints `r` opaque black (0, 0, 0, 255), replacing what is there. */
  fillBlack: (r: PxRect) => void
  /** Returns the pixels of `r` as a buffer of r.w × r.h pixels. */
  read: (r: PxRect) => RGBA
}

/**
 * Runs after anything drawn on top of the sanitised raster (the watermark). Paints every mask black
 * again, then reads the final pixels back and checks them. Throws if a masked pixel is not opaque
 * black. Only the masked areas are read, so the cost is small.
 */
export function sealMasks (surface: MaskSurface, rects: readonly PxRect[]): void {
  for (const r of rects) surface.fillBlack(r)
  for (const r of rects) {
    const region = surface.read(r)
    const bad = findUnmaskedPixel(region, [{ x: 0, y: 0, w: r.w, h: r.h }])
    region.data.fill(0)
    if (bad !== -1) throw new Error('Redaction check failed: a masked pixel is not opaque black after the watermark')
  }
}
