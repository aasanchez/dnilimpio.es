// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { DATE_FIELDS, FINDABLE, coverFor, dateFieldAt, datesByMrz, findSensitive, isDate, isFindable, isIdNumber, isMrzLine, isSupportNumber, mrzDate, mrzNames, namesFromText, overlap, toRect, type Found, type OcrLineWords, type OcrWord } from '../../src/ocr/find.ts'
import { checkDigit, parseMrz } from '../../src/ocr/mrz.ts'
import { DOCUMENTS } from '../../src/zones/documents.ts'
import { DNI_4_0 } from '../../src/zones/dni.ts'
import { TIE } from '../../src/zones/tie.ts'
import type { ZoneId } from '../../src/zones/types.ts'

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
    // The MRZ cuts long names ("MARIA<DOL"): the labelled line is still covered in full.
    const cut = findSensitive([line(100, 650, 'NOMBRE'), line(150, 650, 'MARIA', 'DOLORES')], SIZE, mrzNames('FERNANDEZ<FERNANDEZ<<MARIA<DOL'))
    expect(cut.map((f) => f.text)).toEqual(['MARIA DOLORES'])
    expect(cut[0]?.rect.w).toBeGreaterThan((5 + 7) * 30 / SIZE.w)
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

/** A valid TD1 MRZ (DNI) with the given birth and expiry dates (YYMMDD), as OCR text. */
function mrzText (birth: string, expiry: string): string {
  const number = 'BAA000589'
  const l1 = `IDESP${number}${String(checkDigit(number))}99999999R<<<<<<`
  const l2a = `${birth}${String(checkDigit(birth))}F${expiry}${String(checkDigit(expiry))}ESP<<<<<<<<<<<`
  const composite = l1.slice(5, 30) + l2a.slice(0, 7) + l2a.slice(8, 15) + l2a.slice(18, 29)
  return [l1, l2a + String(checkDigit(composite)), 'ESPANOLA<ESPANOLA<<CARMEN<<<<'].join('\n')
}

const at = (x: number, y: number): Found['rect'] => ({ x, y, w: 0.1, h: 0.05 })
const date = (text: string, x: number, y: number): Found => ({ kind: 'date', text, rect: at(x, y) })
const front = (d: typeof DNI_4_0): Array<{ id: ZoneId; rects: Found['rect'][] }> => d.zones.filter((z) => z.side === 'front').map((z) => ({ id: z.id, rects: [...z.rects] }))

describe('one field list for the switches and the search', () => {
  it('looks only for fields that exist, and every date field is one of them', () => {
    const ids = new Set(DOCUMENTS.flatMap((d) => d.zones.map((z) => z.id)))
    for (const f of FINDABLE) expect(ids.has(f)).toBe(true)
    for (const d of DATE_FIELDS) expect(isFindable(d)).toBe(true)
    // Fields with no pattern to check: only their fixed box covers them.
    for (const id of ['signature', 'address', 'placeOfBirth', 'parents', 'permitType'] as const) expect(isFindable(id)).toBe(false)
  })

  it('turns a printed date into the MRZ form', () => {
    expect(mrzDate('01 01 1980')).toBe('800101')
    expect(mrzDate('02.06.2031')).toBe('310602')
    expect(mrzDate('31 02 2020')).toBeUndefined()
  })

  it('names the date of birth and the expiry date from the MRZ, and leaves other dates as dates', () => {
    const mrz = parseMrz(mrzText('800101', '310602'))
    const found = [date('01 01 1980', 0.8, 0.5), date('02 06 2031', 0.6, 0.6), date('02 06 2021', 0.4, 0.6), { kind: 'can', text: '987654', rect: at(0.8, 0.85) } satisfies Found]
    expect(datesByMrz(found, mrz).map((f) => f.kind)).toEqual(['dateOfBirth', 'expiryDate', 'date', 'can'])
    expect(datesByMrz(found, null).map((f) => f.kind)).toEqual(['date', 'date', 'date', 'can'])
  })

  it('places a date by the layout: the zone it overlaps, else the nearest one, never a field already taken', () => {
    const zones = front(DNI_4_0)
    expect(dateFieldAt(at(0.42, 0.6), zones)).toBe('issueDate')
    expect(dateFieldAt(at(0.62, 0.6), zones)).toBe('expiryDate')
    expect(dateFieldAt(at(0.82, 0.52), zones)).toBe('dateOfBirth')
    expect(dateFieldAt(at(0.62, 0.6), zones, new Set<ZoneId>(['expiryDate']))).toBe('issueDate')
    expect(dateFieldAt(at(0.5, 0.5), [])).toBeUndefined()
  })

  it('covers only what the switches hide: the date of birth stays visible by default', () => {
    const recommended = new Set<ZoneId>(['can', 'signature', 'issueDate', 'expiryDate', 'supportNumber', 'mrz'])
    const found: Found[] = [
      { kind: 'name', text: 'CARMEN', rect: at(0.4, 0.44) },
      { kind: 'idNumber', text: '99999999R', rect: at(0.45, 0.2) },
      date('01 01 1980', 0.82, 0.52),
      date('02 06 2021', 0.42, 0.6),
      { kind: 'can', text: '987654', rect: at(0.8, 0.85) },
    ]
    const [res] = coverFor([{ side: 'front', found, zones: front(DNI_4_0) }], recommended)
    expect(res?.rects).toEqual([at(0.42, 0.6), at(0.8, 0.85)])
    const [all] = coverFor([{ side: 'front', found, zones: front(DNI_4_0) }], new Set<ZoneId>([...recommended, 'name', 'idNumber', 'dateOfBirth']))
    expect(all?.rects).toHaveLength(5)
  })

  it('on the TIE back, an unnamed date is the issue date; with no date zone it follows any hidden date', () => {
    const back = TIE.zones.filter((z) => z.side === 'back').map((z) => ({ id: z.id, rects: [...z.rects] }))
    const d = [date('01 01 2019', 0.2, 0.18)]
    expect(coverFor([{ side: 'back', found: d, zones: back }], new Set<ZoneId>(['issueDate']))[0]?.rects).toHaveLength(1)
    expect(coverFor([{ side: 'back', found: d, zones: back }], new Set<ZoneId>(['expiryDate']))[0]?.rects).toHaveLength(0)
    expect(coverFor([{ side: 'back', found: d, zones: [] }], new Set<ZoneId>(['expiryDate']))[0]?.rects).toHaveLength(1)
    expect(coverFor([{ side: 'back', found: d, zones: [] }], new Set<ZoneId>(['can']))[0]?.rects).toHaveLength(0)
  })
})
