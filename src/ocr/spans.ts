// SPDX-License-Identifier: AGPL-3.0-or-later
// Where each word of a recognised line really is, from the ink in the image. Pure: RGBA pixels in,
// horizontal spans out. Runs in the OCR worker, before the pixels are zeroed.
//
// PP-OCR gives one box per line. Inside it, the columns are split into ink and background (Otsu's
// threshold on the line's grey levels); gaps wider than a share of the line height separate words.
// The spans are used only when their count equals the number of words in the recognised text, so a
// busy background or wide letter spacing makes the caller fall back to its conservative estimate
// (lines.ts) instead of guessing.

export interface Span { readonly x0: number; readonly x1: number }

/** A gap between words is at least this share of the line height (letter gaps are much narrower). */
const GAP_SHARE = 0.3
/** A column is ink when at least this share of its pixels is darker than the threshold. */
const COLUMN_INK = 0.04

/** Otsu's threshold of a 256-bin histogram. */
function otsu (hist: Uint32Array, total: number): number {
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * (hist[i] ?? 0)
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * (hist[t] ?? 0)
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

/**
 * Spans of the `words` words in the box (x, y, w, h) of an RGBA image `width` pixels wide, or null
 * when the ink does not split into exactly that many runs.
 */
export function wordSpans (data: Uint8Array, width: number, height: number, box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }, words: number): Span[] | null {
  if (words < 1) return null
  const x0 = Math.max(0, Math.floor(box.x))
  const x1 = Math.min(width, Math.ceil(box.x + box.w))
  const y0 = Math.max(0, Math.floor(box.y))
  const y1 = Math.min(height, Math.ceil(box.y + box.h))
  const w = x1 - x0
  const h = y1 - y0
  if (w < 2 || h < 2) return null
  const grey = new Uint8Array(w * h)
  const hist = new Uint32Array(256)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * width + x0 + x) * 4
      const v = Math.round(0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0))
      grey[y * w + x] = v
      hist[v] = (hist[v] ?? 0) + 1
    }
  }
  const t = otsu(hist, w * h)
  const ink = new Array<boolean>(w)
  for (let x = 0; x < w; x++) {
    let dark = 0
    for (let y = 0; y < h; y++) if ((grey[y * w + x] ?? 255) <= t) dark++
    ink[x] = dark >= Math.max(1, h * COLUMN_INK)
  }
  grey.fill(0)
  const minGap = Math.max(2, Math.round(h * GAP_SHARE))
  const runs: Array<{ x0: number; x1: number }> = []
  let start = -1
  let lastInk = -1
  for (let x = 0; x < w; x++) {
    if (!ink[x]) continue
    if (start < 0) start = x
    else if (x - lastInk - 1 >= minGap) {
      runs.push({ x0: start, x1: lastInk + 1 })
      start = x
    }
    lastInk = x
  }
  if (start >= 0) runs.push({ x0: start, x1: lastInk + 1 })
  if (runs.length !== words) return null
  return runs.map((r) => ({ x0: x0 + r.x0, x1: x0 + r.x1 }))
}
