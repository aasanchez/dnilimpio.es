// SPDX-License-Identifier: AGPL-3.0-or-later
// Watermark (spec §14): one centred, diagonal, semi-transparent block of text, wrapped and scaled to
// stay readable. It is drawn into the sanitised raster, so it becomes part of the image pixels.
// Layout is pure (it takes a text-measuring function), so it is tested without a browser.

/** Measures the width of `text` at font size 1 (in the same units as the result × size). */
export type Measure = (text: string) => number

export interface WatermarkLayout {
  readonly lines: readonly string[]
  /** Font size in pixels. */
  readonly size: number
  /** Rotation in radians (negative: rising from bottom-left to top-right). */
  readonly angle: number
  readonly direction: 'ltr' | 'rtl'
}

/** Longest text accepted. Longer input is cut, so a pasted essay cannot make the text unreadably small. */
export const WATERMARK_MAX_CHARS = 120
const MIN_SIZE_RATIO = 0.035 // of the image diagonal
const MAX_SIZE_RATIO = 0.09
const LINE_HEIGHT = 1.25

/** User-perceived characters (grapheme clusters), so a cut never splits an accent, emoji or ligature. */
export function graphemes (text: string): string[] {
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment)
}

/** Collapses whitespace, trims and caps the length. Empty result means no watermark. */
export function normaliseWatermark (text: string): string {
  return graphemes(text.replace(/\s+/g, ' ').trim()).slice(0, WATERMARK_MAX_CHARS).join('')
}

/** Direction of the first strong character: Hebrew, Arabic, Syriac, Thaana, N'Ko and Arabic presentation forms are RTL. */
export function textDirection (text: string): 'ltr' | 'rtl' {
  for (const ch of text) {
    if (/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u.test(ch)) return 'rtl'
    if (/\p{L}/u.test(ch)) return 'ltr'
  }
  return 'ltr'
}

/** Splits a word wider than `max` into grapheme-safe pieces that are each at most `max` wide (or one grapheme). */
export function breakWord (word: string, max: number, measure: Measure): string[] {
  if (measure(word) <= max) return [word]
  const pieces: string[] = []
  let piece = ''
  for (const g of graphemes(word)) {
    if (piece !== '' && measure(piece + g) > max) {
      pieces.push(piece)
      piece = g
    } else {
      piece += g
    }
  }
  if (piece !== '') pieces.push(piece)
  return pieces
}

/**
 * Greedy word wrap at font size 1. A word longer than `width` gets a line of its own; a word longer
 * than `hardWidth` (a URL, an identifier) is first broken into pieces, so no line can exceed it.
 */
export function wrap (text: string, width: number, measure: Measure, hardWidth = Infinity): string[] {
  const words = text.split(' ').filter((w) => w !== '').flatMap((w) => breakWord(w, hardWidth, measure))
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const candidate = line === '' ? w : `${line} ${w}`
    if (line !== '' && measure(candidate) > width) {
      lines.push(line)
      line = w
    } else {
      line = candidate
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

/**
 * Chooses line breaks and a font size so the block fits along the image diagonal.
 * Tries 1 to 4 lines and keeps the layout with the largest font size. Returns null for empty text.
 */
export function layoutWatermark (raw: string, width: number, height: number, measure: Measure): WatermarkLayout | null {
  const text = normaliseWatermark(raw)
  if (text === '') return null
  const diagonal = Math.hypot(width, height)
  const angle = -Math.atan2(height, width)
  // Usable box along the diagonal: most of its length, a band across it.
  const boxW = diagonal * 0.8
  const boxH = Math.min(width, height) * 0.6
  const total = measure(text)
  const minSize = diagonal * MIN_SIZE_RATIO
  // At the minimum size, no line may be wider than the box: break long unspaced tokens to keep them inside.
  const hardWidth = boxW / minSize
  let best: { lines: string[]; size: number } | null = null
  for (let n = 1; n <= 4; n++) {
    const lines = wrap(text, total / n, measure, hardWidth)
    const widest = Math.max(...lines.map(measure))
    const size = Math.min(boxW / widest, boxH / (lines.length * LINE_HEIGHT))
    if (!best || size > best.size) best = { lines, size }
  }
  if (!best) return null
  const size = Math.max(minSize, Math.min(best.size, diagonal * MAX_SIZE_RATIO))
  return { lines: best.lines, size, angle, direction: textDirection(text) }
}

/** Font stack: local system fonts only, never downloaded (spec §18, §22). */
export const WATERMARK_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", sans-serif'

/** Draws the watermark onto a 2D context covering the whole image. Does nothing for empty text. */
export function drawWatermark (ctx: CanvasRenderingContext2D, text: string, width: number, height: number): void {
  ctx.save()
  ctx.font = `700 100px ${WATERMARK_FONT}`
  const layout = layoutWatermark(text, width, height, (s) => ctx.measureText(s).width / 100)
  if (!layout) {
    ctx.restore()
    return
  }
  ctx.translate(width / 2, height / 2)
  ctx.rotate(layout.angle)
  ctx.font = `700 ${String(layout.size)}px ${WATERMARK_FONT}`
  ctx.direction = layout.direction
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(2, layout.size * 0.08)
  const step = layout.size * LINE_HEIGHT
  const top = -((layout.lines.length - 1) * step) / 2
  layout.lines.forEach((line, i) => {
    const y = top + i * step
    // Light halo under dark text: readable on both light and dark parts of the card.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.strokeText(line, 0, y)
    ctx.fillStyle = 'rgba(20, 20, 20, 0.5)'
    ctx.fillText(line, 0, y)
  })
  ctx.restore()
}
