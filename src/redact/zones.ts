// SPDX-License-Identifier: AGPL-3.0-or-later
// Converts normalised zones to pixel rectangles and paints opaque fills (spec §2.3, §4.3).

import type { Rect, Side, ZoneId, ModelZones } from '../zones/dni.ts'

export interface PxRect { readonly x: number, readonly y: number, readonly w: number, readonly h: number }

/** Normalised → pixels, rounded outwards so a fill never leaves a partial pixel uncovered. */
export function toPixels (r: Rect, width: number, height: number): PxRect {
  const x0 = Math.max(0, Math.floor(r.x * width + 1e-9))
  const y0 = Math.max(0, Math.floor(r.y * height + 1e-9))
  // The epsilon stops float noise (0.1 + 0.2 = 0.30000000000000004) from adding a whole pixel.
  const x1 = Math.min(width, Math.ceil((r.x + r.w) * width - 1e-9))
  const y1 = Math.min(height, Math.ceil((r.y + r.h) * height - 1e-9))
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
}

/** Zones hidden by default for one side: mandatory and hidden ones, plus any optional ones the user turned on. */
export function activeRects (model: ModelZones, side: Side, optionalOn: ReadonlySet<ZoneId>): Rect[] {
  return model.zones
    .filter((z) => z.side === side && (z.default !== 'visible' || optionalOn.has(z.id)))
    .flatMap((z) => z.rects)
}

export const FILL_RGB = [0, 0, 0] as const

/** Paints opaque fills directly into an RGBA buffer. Alpha is forced to 255: no blur, no transparency. */
export function fillRects (data: Uint8ClampedArray, width: number, height: number, rects: readonly PxRect[]): void {
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h && y < height; y++) {
      for (let x = r.x; x < r.x + r.w && x < width; x++) {
        const o = (y * width + x) * 4
        data[o] = FILL_RGB[0]
        data[o + 1] = FILL_RGB[1]
        data[o + 2] = FILL_RGB[2]
        data[o + 3] = 255
      }
    }
  }
}
