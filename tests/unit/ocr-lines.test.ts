// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { fromWire, inReadingOrder, toLine } from '../../src/ocr/lines.ts'

const wire = (text: string, x: number, y: number, w: number, h = 20): { text: string; confidence: number; x: number; y: number; w: number; h: number } => ({ text, confidence: 0.9, x, y, w, h })

describe('toLine', () => {
  it('splits a line into words with boxes from character offsets', () => {
    const l = toLine(wire('01 01 1980', 100, 50, 100))
    expect(l.words.map((w) => w.text)).toEqual(['01', '01', '1980'])
    expect(l.words[0]?.bbox).toEqual({ x0: 100, y0: 50, x1: 120, y1: 70 })
    expect(l.words[2]?.bbox).toEqual({ x0: 160, y0: 50, x1: 200, y1: 70 })
    expect(l.bbox).toEqual({ x0: 100, y0: 50, x1: 200, y1: 70 })
  })
  it('keeps no empty words', () => {
    expect(toLine(wire('  ', 0, 0, 10)).words).toEqual([])
  })
})

describe('inReadingOrder', () => {
  it('orders rows top to bottom and each row left to right', () => {
    const lines = [wire('right', 300, 102, 50), wire('below', 0, 200, 50), wire('left', 0, 100, 50), wire('top', 0, 10, 50)].map(toLine)
    expect(inReadingOrder(lines).map((l) => l.text)).toEqual(['top', 'left', 'right', 'below'])
  })
})

describe('fromWire', () => {
  it('joins the lines as text in reading order and drops empty ones', () => {
    const r = fromWire([wire('B', 0, 100, 10), wire(' ', 0, 50, 10), wire('A', 0, 0, 10)])
    expect(r.text).toBe('A\nB')
    expect(r.lines).toHaveLength(2)
  })
})
