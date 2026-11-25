// SPDX-License-Identifier: AGPL-3.0-or-later
// Watermark (spec §14): small, light, diagonal text repeated as a tiled pattern over the whole image.
// Each copy is a short block of wrapped text; the copies sit in staggered rows (like bricks), so any
// crop of the card still carries the text, while the card itself stays readable underneath.
// It is drawn into the sanitised raster, so it becomes part of the image pixels.
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
  /** Size of one copy of the text block, in pixels, before rotation. */
  readonly blockWidth: number
  readonly blockHeight: number
  /** Distance between copies along a row and between rows, in pixels, in the rotated frame. */
  readonly stepX: number
  readonly stepY: number
}

/** Centre of one copy of the text block, in image pixels. */
export interface WatermarkTile {
  readonly x: number
  readonly y: number
}

/** Longest text accepted. Longer input is cut, so a pasted essay cannot turn into a wall of text. */
export const WATERMARK_MAX_CHARS = 120
/** Font size as a share of the image diagonal: about the size of the text printed on the card. */
export const WATERMARK_SIZE_RATIO = 0.02
const MIN_SIZE = 10 // pixels, for very small images
/** Widest line of one copy, as a share of the image diagonal. Longer text wraps onto more lines. */
const MAX_BLOCK_RATIO = 0.4
const LINE_HEIGHT = 1.25
/** Empty space between copies, in font sizes. */
const GAP_X = 3
const GAP_Y = 2.5
/** Ink: dark text with a light halo, both faint, so it shows on light and dark parts of the card. */
export const WATERMARK_FILL = 'rgba(20, 20, 20, 0.16)'
export const WATERMARK_HALO = 'rgba(255, 255, 255, 0.16)'

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
 * Lays out one copy of the text block and the spacing of the tiled pattern. The font size is fixed
 * by the image size, not by the text, so the pattern looks the same for short and long text.
 * Returns null for empty text.
 */
export function layoutWatermark (raw: string, width: number, height: number, measure: Measure): WatermarkLayout | null {
  const text = normaliseWatermark(raw)
  if (text === '') return null
  const diagonal = Math.hypot(width, height)
  const size = Math.max(MIN_SIZE, diagonal * WATERMARK_SIZE_RATIO)
  // Line width limit in font units; unspaced tokens wider than that are broken, so no line exceeds it.
  const maxLine = Math.max((diagonal * MAX_BLOCK_RATIO) / size, measure('M'))
  const lines = wrap(text, maxLine, measure, maxLine)
  const blockWidth = Math.max(...lines.map(measure)) * size
  const blockHeight = lines.length * size * LINE_HEIGHT
  return {
    lines,
    size,
    angle: -Math.atan2(height, width),
    direction: textDirection(text),
    blockWidth,
    blockHeight,
    stepX: blockWidth + GAP_X * size,
    stepY: blockHeight + GAP_Y * size
  }
}

/**
 * Centres of every copy that touches the image. Rows run along the rotated axis through the image
 * centre; every other row is shifted by half a step, so the copies interlock instead of forming columns.
 */
export function tileWatermark (layout: WatermarkLayout, width: number, height: number): WatermarkTile[] {
  const { stepX, stepY, angle } = layout
  // Half-diagonal of one block: a copy whose centre is further than this from the image cannot touch it.
  const reach = Math.hypot(layout.blockWidth, layout.blockHeight) / 2
  const radius = Math.hypot(width, height) / 2 + reach
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const rows = Math.ceil(radius / stepY)
  const cols = Math.ceil(radius / stepX) + 1
  const tiles: WatermarkTile[] = []
  for (let r = -rows; r <= rows; r++) {
    const shift = (Math.abs(r) % 2) * (stepX / 2)
    for (let c = -cols; c <= cols; c++) {
      const u = c * stepX + shift
      const v = r * stepY
      const x = width / 2 + u * cos - v * sin
      const y = height / 2 + u * sin + v * cos
      if (x >= -reach && x <= width + reach && y >= -reach && y <= height + reach) tiles.push({ x, y })
    }
  }
  return tiles
}

/** Font stack: local system fonts only, never downloaded (spec §18, §22). */
export const WATERMARK_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", sans-serif'

/** Draws the tiled watermark onto a 2D context covering the whole image. Does nothing for empty text. */
export function drawWatermark (ctx: CanvasRenderingContext2D, text: string, width: number, height: number): void {
  ctx.save()
  ctx.font = `600 100px ${WATERMARK_FONT}`
  const layout = layoutWatermark(text, width, height, (s) => ctx.measureText(s).width / 100)
  if (!layout) {
    ctx.restore()
    return
  }
  ctx.font = `600 ${String(layout.size)}px ${WATERMARK_FONT}`
  ctx.direction = layout.direction
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, layout.size * 0.1)
  ctx.strokeStyle = WATERMARK_HALO
  ctx.fillStyle = WATERMARK_FILL
  const step = layout.size * LINE_HEIGHT
  const top = -((layout.lines.length - 1) * step) / 2
  for (const tile of tileWatermark(layout, width, height)) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.translate(tile.x, tile.y)
    ctx.rotate(layout.angle)
    layout.lines.forEach((line, i) => {
      ctx.strokeText(line, 0, top + i * step)
      ctx.fillText(line, 0, top + i * step)
    })
  }
  ctx.restore()
}
