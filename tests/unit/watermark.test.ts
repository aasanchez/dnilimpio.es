// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { DEFAULT_WATERMARK_STYLE, WATERMARK_MAX_CHARS, WATERMARK_OPACITY, WATERMARK_SCALE, WATERMARK_SIZE_RATIO, breakWord, clampStyle, graphemes, layoutWatermark, normaliseWatermark, textDirection, tileWatermark, watermarkInk, wrap } from '../../src/engine/watermark.ts'

// Monospace stand-in for canvas measureText at font size 1: 0.6 units per character.
const mono = (s: string): number => graphemes(s).length * 0.6

describe('normaliseWatermark', () => {
  it('collapses whitespace, trims and caps the length', () => {
    expect(normaliseWatermark('  COPY \n ONLY\t')).toBe('COPY ONLY')
    expect(graphemes(normaliseWatermark('x'.repeat(500)))).toHaveLength(WATERMARK_MAX_CHARS)
    // A flag emoji is one character for the cap, never cut in half.
    expect(graphemes(normaliseWatermark('🇪🇸'.repeat(200)))).toEqual(Array<string>(WATERMARK_MAX_CHARS).fill('🇪🇸'))
  })
})

describe('textDirection', () => {
  it('follows the first strong character', () => {
    expect(textDirection('COPIA')).toBe('ltr')
    expect(textDirection('نسخة للإيجار')).toBe('rtl')
    expect(textDirection('123 نسخة')).toBe('rtl')
    expect(textDirection('Копія')).toBe('ltr')
    expect(textDirection('ⵜⴰⵎⴰⵣⵉⵖⵜ')).toBe('ltr')
  })
})

describe('wrap', () => {
  it('breaks between words and never splits a word', () => {
    expect(wrap('aa bb cc', 3, mono)).toEqual(['aa bb', 'cc'])
    expect(wrap('averyverylongword x', 1, mono)).toEqual(['averyverylongword', 'x'])
  })
  it('breaks a word wider than the hard width into grapheme-safe pieces', () => {
    expect(wrap('abcdefgh x', 1, mono, 0.6 * 3)).toEqual(['abc', 'def', 'gh', 'x'])
    expect(breakWord('e\u0301e\u0301e\u0301', 0.6 * 2, mono)).toEqual(['e\u0301e\u0301', 'e\u0301'])
  })
})

const W = 1712
const H = 1080
const DIAGONAL = Math.hypot(W, H)

describe('layoutWatermark', () => {
  it('returns null for empty text', () => {
    expect(layoutWatermark('   ', W, H, mono)).toBeNull()
  })
  it('uses small text along the diagonal, the same size for short and long text', () => {
    const short = layoutWatermark('X', W, H, mono)
    const long = layoutWatermark('COPY EXCLUSIVELY FOR RENTAL APPLICATION 25/11/2026', W, H, mono)
    expect(short).not.toBeNull()
    expect(long).not.toBeNull()
    if (!short || !long) return
    expect(long.angle).toBeCloseTo(-Math.atan2(H, W), 9)
    expect(short.size).toBeCloseTo(DIAGONAL * WATERMARK_SIZE_RATIO, 9)
    expect(long.size).toBe(short.size)
    // Small: well under the old single-block size (3.5 % to 9 % of the diagonal).
    expect(long.size).toBeLessThan(DIAGONAL * 0.03)
  })
  it('wraps long text so one copy stays a small block', () => {
    const text = 'COPY EXCLUSIVELY FOR THE RENTAL APPLICATION OF THE FLAT IN CALLE MAYOR 1 MADRID 25/11/2026'
    const l = layoutWatermark(text, W, H, mono)
    expect(l).not.toBeNull()
    if (!l) return
    expect(l.lines.length).toBeGreaterThan(1)
    expect(l.lines.join(' ')).toBe(text)
    for (const line of l.lines) expect(mono(line) * l.size).toBeLessThanOrEqual(DIAGONAL * 0.4 + 1e-6)
    expect(l.blockWidth).toBeLessThanOrEqual(DIAGONAL * 0.4 + 1e-6)
  })
  it('breaks a long unbroken token so no line overflows its block', () => {
    const token = 'x'.repeat(WATERMARK_MAX_CHARS)
    const l = layoutWatermark(token, W, H, mono)
    expect(l).not.toBeNull()
    if (!l) return
    expect(l.lines.join('')).toBe(token)
    for (const line of l.lines) expect(mono(line) * l.size).toBeLessThanOrEqual(DIAGONAL * 0.4 + 1e-6)
    expect(l.blockHeight).toBeLessThan(H / 2)
  })
  it('keeps a readable minimum size on tiny images', () => {
    expect(layoutWatermark('COPY', 64, 40, mono)?.size).toBe(10)
  })
  it('scales the font size and the spacing with the user scale', () => {
    const base = layoutWatermark('COPIA', W, H, mono)
    const big = layoutWatermark('COPIA', W, H, mono, 2)
    if (!base || !big) throw new Error('expected layouts')
    expect(big.size).toBeCloseTo(base.size * 2, 9)
    expect(big.stepY).toBeGreaterThan(base.stepY)
  })
  it('clamps the scale to the slider limits', () => {
    const at = (scale: number): number => layoutWatermark('COPIA', W, H, mono, scale)?.size ?? 0
    expect(at(100)).toBeCloseTo(DIAGONAL * WATERMARK_SIZE_RATIO * WATERMARK_SCALE.max, 9)
    expect(at(0)).toBeCloseTo(DIAGONAL * WATERMARK_SIZE_RATIO * WATERMARK_SCALE.min, 9)
    expect(at(Number.NaN)).toBeCloseTo(DIAGONAL * WATERMARK_SIZE_RATIO, 9)
  })
})

describe('watermark style', () => {
  it('defaults to the original look: normal size, 16% opacity', () => {
    expect(DEFAULT_WATERMARK_STYLE).toEqual({ scale: 1, opacity: 0.16 })
    expect(watermarkInk(DEFAULT_WATERMARK_STYLE.opacity)).toEqual({ fill: 'rgba(20, 20, 20, 0.16)', halo: 'rgba(255, 255, 255, 0.16)' })
  })
  it('draws solid black at 100% opacity, with the halo kept faint', () => {
    expect(watermarkInk(1)).toEqual({ fill: 'rgb(0, 0, 0)', halo: 'rgba(255, 255, 255, 0.16)' })
  })
  it('keeps values inside the slider limits', () => {
    expect(clampStyle({ scale: 9, opacity: 2 })).toEqual({ scale: WATERMARK_SCALE.max, opacity: WATERMARK_OPACITY.max })
    expect(clampStyle({ scale: -1, opacity: 0 })).toEqual({ scale: WATERMARK_SCALE.min, opacity: WATERMARK_OPACITY.min })
    expect(clampStyle({ scale: Number.NaN, opacity: Number.NaN })).toEqual(DEFAULT_WATERMARK_STYLE)
  })
})

describe('tileWatermark', () => {
  const texts = ['X', 'COPIA SOLO PARA ALQUILER 25/11/2026', 'x'.repeat(WATERMARK_MAX_CHARS)]
  it('repeats the text many times', () => {
    for (const text of texts) {
      const l = layoutWatermark(text, W, H, mono)
      expect(l).not.toBeNull()
      if (!l) return
      expect(tileWatermark(l, W, H).length).toBeGreaterThanOrEqual(6)
    }
  })
  it('puts at least one copy in every quarter-card crop', () => {
    for (const text of texts) {
      const l = layoutWatermark(text, W, H, mono)
      if (!l) throw new Error('no layout')
      const tiles = tileWatermark(l, W, H)
      for (let x0 = 0; x0 <= W / 2; x0 += W / 16) {
        for (let y0 = 0; y0 <= H / 2; y0 += H / 16) {
          const inside = tiles.some((t) => t.x >= x0 && t.x <= x0 + W / 2 && t.y >= y0 && t.y <= y0 + H / 2)
          expect(inside, `${text} at ${String(x0)},${String(y0)}`).toBe(true)
        }
      }
    }
  })
  it('leaves gaps between copies so the card stays readable', () => {
    const l = layoutWatermark('COPIA SOLO PARA ALQUILER', W, H, mono)
    if (!l) throw new Error('no layout')
    expect(l.stepX - l.blockWidth).toBeGreaterThanOrEqual(2 * l.size)
    expect(l.stepY - l.blockHeight).toBeGreaterThanOrEqual(2 * l.size)
  })
  it('only returns copies that can touch the image', () => {
    const l = layoutWatermark('COPIA', W, H, mono)
    if (!l) throw new Error('no layout')
    const reach = Math.hypot(l.blockWidth, l.blockHeight) / 2
    for (const t of tileWatermark(l, W, H)) {
      expect(t.x).toBeGreaterThanOrEqual(-reach)
      expect(t.x).toBeLessThanOrEqual(W + reach)
      expect(t.y).toBeGreaterThanOrEqual(-reach)
      expect(t.y).toBeLessThanOrEqual(H + reach)
    }
  })
})
