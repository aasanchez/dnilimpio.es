// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { WATERMARK_MAX_CHARS, breakWord, graphemes, layoutWatermark, normaliseWatermark, textDirection, wrap } from '../../src/engine/watermark.ts'

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

describe('layoutWatermark', () => {
  it('returns null for empty text', () => {
    expect(layoutWatermark('   ', 1712, 1080, mono)).toBeNull()
  })
  it('runs along the diagonal and fits the image', () => {
    const l = layoutWatermark('COPY EXCLUSIVELY FOR RENTAL APPLICATION', 1712, 1080, mono)
    expect(l).not.toBeNull()
    if (!l) return
    expect(l.angle).toBeCloseTo(-Math.atan2(1080, 1712), 9)
    const diagonal = Math.hypot(1712, 1080)
    for (const line of l.lines) expect(mono(line) * l.size).toBeLessThanOrEqual(diagonal * 0.8 + 1e-6)
    expect(l.lines.join(' ')).toBe('COPY EXCLUSIVELY FOR RENTAL APPLICATION')
  })
  it('keeps a long unbroken token inside the image at the minimum size', () => {
    const token = 'x'.repeat(WATERMARK_MAX_CHARS)
    const l = layoutWatermark(token, 1712, 1080, mono)
    expect(l).not.toBeNull()
    if (!l) return
    const diagonal = Math.hypot(1712, 1080)
    expect(l.lines.join('')).toBe(token)
    for (const line of l.lines) expect(mono(line) * l.size).toBeLessThanOrEqual(diagonal * 0.8 + 1e-6)
    expect(l.lines.length * l.size * 1.25).toBeLessThanOrEqual(Math.min(1712, 1080))
  })
  it('keeps short text from growing beyond the maximum size', () => {
    const l = layoutWatermark('X', 1712, 1080, mono)
    expect(l?.size).toBeLessThanOrEqual(Math.hypot(1712, 1080) * 0.09)
  })
})
