// SPDX-License-Identifier: AGPL-3.0-or-later
// Perspective-corrects the card region of a photo into a fixed-size ID-1 image (spec §4.2).

import { apply, homography, isConvex, type Quad } from './homography.ts';

/** ID-1 card: 85.60 × 53.98 mm. 1712 px wide → 20 px/mm; height rounds to 1080 (ratio error < 0.1 %). */
export const CARD_MM = { w: 85.6, h: 53.98 } as const;
export const CARD_PX = { w: 1712, h: 1080 } as const;

export interface RGBA { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }

/**
 * Inverse-maps every output pixel into the source with bilinear sampling.
 * `quad` lists the card corners in the source image: top-left, top-right, bottom-right, bottom-left.
 */
export function warpToCard(src: RGBA, quad: Quad, out: RGBA = { width: CARD_PX.w, height: CARD_PX.h, data: new Uint8ClampedArray(CARD_PX.w * CARD_PX.h * 4) }): RGBA {
  if (!isConvex(quad)) throw new Error('Card corners must form a convex quadrilateral');
  const W = out.width, H = out.height;
  const rect: Quad = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const m = homography(rect, quad);
  if (!m) throw new Error('Degenerate card corners');
  const sd = src.data, od = out.data, sw = src.width, sh = src.height;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = apply(m, { x: x + 0.5, y: y + 0.5 }); // sample at pixel centres
      const fx = Math.min(Math.max(p.x - 0.5, 0), sw - 1);
      const fy = Math.min(Math.max(p.y - 0.5, 0), sh - 1);
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
      const ax = fx - x0, ay = fy - y0;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) {
        const tl = sd[(y0 * sw + x0) * 4 + c]!, tr = sd[(y0 * sw + x1) * 4 + c]!;
        const bl = sd[(y1 * sw + x0) * 4 + c]!, br = sd[(y1 * sw + x1) * 4 + c]!;
        od[o + c] = (tl * (1 - ax) + tr * ax) * (1 - ay) + (bl * (1 - ax) + br * ax) * ay;
      }
    }
  }
  return out;
}
