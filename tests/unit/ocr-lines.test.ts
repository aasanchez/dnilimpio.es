// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { fromWire, inReadingOrder, toLine } from '../../src/ocr/lines.ts'

const wire = (text: string, x: number, y: number, w: number, h = 20): { text: string; confidence: number; x: number; y: number; w: number; h: number } => ({ text, confidence: 0.9, x, y, w, h })

describe('toLine', () => {
  it('splits a line into words with conservative boxes from character offsets', () => {
    const l = toLine(wire('01 01 1980', 100, 50, 100))
    expect(l.words.map((w) => w.text)).toEqual(['01', '01', '1980'])
    expect(l.words[0]?.bbox).toEqual({ x0: 100, y0: 50, x1: 130, y1: 70 })
    expect(l.words[1]?.bbox).toEqual({ x0: 115, y0: 50, x1: 175, y1: 70 })
    expect(l.words[2]?.bbox).toEqual({ x0: 130, y0: 50, x1: 200, y1: 70 })
    expect(l.bbox).toEqual({ x0: 100, y0: 50, x1: 200, y1: 70 })
  })
  it('covers a word after a narrow prefix in a proportional font', () => {
    // "DNI 99999999R" in a 40 px sans-serif: the line spans x 3–313, the number really starts at x 88.
    const n = toLine(wire('DNI 99999999R', 3, 0, 310, 40)).words[1]
    expect(n?.bbox.x0).toBeLessThanOrEqual(88)
    expect(n?.bbox.x1).toBe(313)
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

describe('measured spans', () => {
  it('are used when there is one per word', () => {
    const l = toLine({ ...wire('DNI 99999999R', 3, 0, 310, 40), spans: [{ x0: 3, x1: 70 }, { x0: 88, x1: 313 }] })
    expect(l.words.map((w) => [w.bbox.x0, w.bbox.x1])).toEqual([[3, 70], [88, 313]])
  })
  it('are ignored when their count does not match', () => {
    const l = toLine({ ...wire('DNI 99999999R', 3, 0, 310, 40), spans: [{ x0: 3, x1: 313 }] })
    expect(l.words[1]?.bbox.x0).toBeLessThanOrEqual(88)
  })
})
