// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { findSensitive, isDate, isIdNumber, isMrzLine, isSupportNumber, mrzNames, namesFromText, overlap, toRect, type OcrLineWords, type OcrWord } from '../../src/ocr/find.ts'
import { checkDigit } from '../../src/ocr/mrz.ts'

const SIZE = { w: 1712, h: 1080 }

/** One OCR line from words laid out left to right, 30 px per character, at row y. */
function line (y: number, x: number, ...texts: Array<string | [string, number]>): OcrLineWords {
  const words: OcrWord[] = []
  let cx = x
  for (const t of texts) {
    const [text, confidence] = typeof t === 'string' ? [t, 0.9] : t
    words.push({ text, confidence, bbox: { x0: cx, y0: y, x1: cx + text.length * 30, y1: y + 40 } })
    cx += text.length * 30 + 20
  }
  return { text: words.map((w) => w.text).join(' '), words, bbox: { x0: x, y0: y, x1: cx, y1: y + 40 } }
}

describe('checks', () => {
  it('validates DNI and NIE letters', () => {
    expect(isIdNumber('99999999R')).toBe(true)
    expect(isIdNumber('12345678Z')).toBe(true)
    expect(isIdNumber('12345678A')).toBe(false)
    expect(isIdNumber('X1234567L')).toBe(true)
    expect(isIdNumber('Y1234567X')).toBe(true)
    expect(isIdNumber('X1234567A')).toBe(false)
    expect(isIdNumber('1234567Z')).toBe(false)
  })

  it('accepts real calendar dates only', () => {
    expect(isDate('01 01 1980')).toBe(true)
    expect(isDate('29.02.2024')).toBe(true)
    expect(isDate('29/02/2023')).toBe(false)
    expect(isDate('31 04 2030')).toBe(false)
    expect(isDate('01011980')).toBe(true)
    expect(isDate('12 13 1980')).toBe(false)
    expect(isDate('01 01 80')).toBe(false)
  })

  it('recognises support numbers and MRZ lines', () => {
    expect(isSupportNumber('CAA000000')).toBe(true)
    expect(isSupportNumber('E12345678')).toBe(true)
    expect(isSupportNumber('CA000000')).toBe(false)
    expect(isMrzLine('IDESPBAA000589599999999R<<<<<<')).toBe(true)
    expect(isMrzLine('DOMICILIO CALLE MAYOR 1')).toBe(false)
  })
})

describe('toRect', () => {
  it('grows the box by a margin and stays inside the image', () => {
    const r = toRect({ x0: 100, y0: 100, x1: 400, y1: 140 }, SIZE)
    expect(r.x * SIZE.w).toBeCloseTo(100 - 10, 5)
    expect((r.y + r.h) * SIZE.h).toBeCloseTo(140 + 10, 5)
    const edge = toRect({ x0: 0, y0: 0, x1: 10, y1: 10 }, SIZE)
    expect(edge.x).toBe(0)
    expect(edge.y).toBe(0)
  })
})

describe('findSensitive', () => {
  it('finds the DNI number, dates split over words, the support number and the CAN', () => {
    const found = findSensitive([
      line(100, 650, 'DNI', '99999999R'),
      line(600, 650, 'EMISIÓN', '02', '06', '2021'),
      line(700, 650, 'NUM', 'SOPORTE', 'CAA000000'),
      line(900, 1340, '987654'),
    ], SIZE)
    expect(found.map((f) => [f.kind, f.text])).toEqual([
      ['idNumber', '99999999R'],
      ['date', '02 06 2021'],
      ['supportNumber', 'CAA000000'],
      ['can', '987654'],
    ])
    // The date box covers its three words and not the label.
    const date = found[1]?.rect
    expect(date && date.x * SIZE.w).toBeGreaterThan(650 + 7 * 30)
  })

  it('accepts a number split from its letter and rejects a wrong letter', () => {
    const found = findSensitive([line(100, 100, '99999999', 'R'), line(200, 100, '12345678A')], SIZE)
    expect(found.map((f) => f.kind)).toEqual(['idNumber'])
  })

  it('ignores low-confidence support numbers and CANs, and six digits inside a longer line', () => {
    const found = findSensitive([line(100, 100, ['CAA000000', 0.2]), line(200, 100, ['987654', 0.3]), line(300, 100, 'CP', '280001')], SIZE)
    expect(found).toEqual([])
  })

  it('marks whole MRZ lines', () => {
    const found = findSensitive([line(800, 50, 'IDESPBAA000589599999999R<<<<<<')], SIZE)
    expect(found.map((f) => f.kind)).toEqual(['mrz'])
  })

  it('finds names from the MRZ, ignoring accents, and the line under a name label', () => {
    const found = findSensitive([
      line(100, 650, 'APELLIDOS'),
      line(150, 650, 'ESPAÑOLA'),
      line(200, 650, 'Española'),
      line(250, 650, 'NOMBRE'),
      line(300, 650, 'CARMEN'),
      line(400, 650, 'SEXO', 'F'),
    ], SIZE, ['ESPANOLA', 'CARMEN'])
    expect(found.map((f) => [f.kind, f.text])).toEqual([['name', 'ESPAÑOLA'], ['name', 'Española'], ['name', 'CARMEN']])
    const byLabel = findSensitive([line(100, 650, 'NOMBRE'), line(150, 650, 'LUCÍA')], SIZE)
    expect(byLabel.map((f) => f.kind)).toEqual(['name'])
    const notAName = findSensitive([line(100, 650, 'NOMBRE'), line(150, 650, 'CALLE', '12')], SIZE)
    expect(notAName).toEqual([])
  })
})

describe('names from the MRZ', () => {
  it('splits the third line into name parts', () => {
    expect(mrzNames('ESPANOLA<ESPANOLA<<CARMEN<<<<')).toEqual(['ESPANOLA', 'ESPANOLA', 'CARMEN'])
    expect(mrzNames('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<')).toEqual([])
  })

  it('reads them from OCR text that holds a valid MRZ', () => {
    const number = 'BAA000589'
    const l1 = `IDESP${number}${String(checkDigit(number))}99999999R<<<<<<`
    const l2a = `800101${String(checkDigit('800101'))}F310101${String(checkDigit('310101'))}ESP<<<<<<<<<<<`
    const composite = l1.slice(5, 30) + l2a.slice(0, 7) + l2a.slice(8, 15) + l2a.slice(18, 29)
    const text = ['DOMICILIO', l1, l2a + String(checkDigit(composite)), 'ESPANOLA<ESPANOLA<<CARMEN<<<<'].join('\n')
    expect(namesFromText(text)).toEqual(['ESPANOLA', 'ESPANOLA', 'CARMEN'])
    expect(namesFromText('no mrz here')).toEqual([])
  })
})

describe('overlap', () => {
  it('is 1 for the same rectangle and 0 for disjoint ones', () => {
    const a = { x: 0.1, y: 0.1, w: 0.2, h: 0.1 }
    expect(overlap(a, a)).toBe(1)
    expect(overlap(a, { x: 0.5, y: 0.5, w: 0.1, h: 0.1 })).toBe(0)
  })
})
