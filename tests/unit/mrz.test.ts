// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { checkDigit, parseMrz, repairs } from '../../src/ocr/mrz.ts'

// ICAO 9303 part 5 TD1 specimen (fictional data).
const ICAO = ['I<UTOD231458907<<<<<<<<<<<<<<<', '7408122F1204159UTO<<<<<<<<<<<6', 'ERIKSSON<<ANNA<MARIA<<<<<<<<<<']

/** Builds a valid TD1 MRZ, computing the check digits. */
function td1 (code: string, number: string, optional: string, birth: string, expiry: string): string[] {
  const l1 = (code.padEnd(2, '<') + 'ESP' + number.padEnd(9, '<') + String(checkDigit(number.padEnd(9, '<'))) + optional.padEnd(15, '<'))
  const l2a = birth + String(checkDigit(birth)) + 'F' + expiry + String(checkDigit(expiry)) + 'ESP' + '<'.repeat(11)
  const composite = l1.slice(5, 30) + l2a.slice(0, 7) + l2a.slice(8, 15) + l2a.slice(18, 29)
  return [l1, l2a + String(checkDigit(composite)), 'ESPANOLA<ESPANOLA<<CARMEN<<<<']
}

describe('checkDigit', () => {
  it('matches the ICAO examples', () => {
    expect(checkDigit('D23145890')).toBe(7)
    expect(checkDigit('740812')).toBe(2)
    expect(checkDigit('120415')).toBe(9)
  })
})

describe('parseMrz', () => {
  it('parses and validates the ICAO TD1 specimen', () => {
    const m = parseMrz(ICAO.join('\n'))
    expect(m).not.toBeNull()
    expect(m?.documentCode).toBe('I')
    expect(m?.documentNumber).toBe('D23145890')
    expect(m?.birthDate).toBe('740812')
    expect(m?.expiryDate).toBe('120415')
    expect(m?.nationality).toBe('UTO')
    expect(m?.valid).toBe(true)
  })

  it('tells a DNI (ID) from a TIE (IR)', () => {
    expect(parseMrz(td1('ID', 'BAA000589', '99999999R', '800101', '310101').join('\n'))?.documentCode).toBe('ID')
    const tie = parseMrz(td1('IR', 'E12345678', 'X1234567L', '900215', '290630').join('\n'))
    expect(tie?.documentCode).toBe('IR')
    expect(tie?.optional1).toBe('X1234567L')
    expect(tie?.valid).toBe(true)
  })

  it('tolerates OCR noise: spaces, lower case, surrounding text', () => {
    const [a, b, c] = td1('ID', 'BAA000589', '99999999R', '800101', '310101')
    const noisy = `DOCUMENTO\n${a!.toLowerCase().replace(/(.{5})/g, '$1 ')}\n${b!}\n${c!}\nfin`
    const m = parseMrz(noisy)
    expect(m?.documentNumber).toBe('BAA000589')
    expect(m?.valid).toBe(true)
  })

  it('repairs one OCR confusion in the number when exactly one fix passes both check digits', () => {
    const [a, b, c] = td1('ID', 'BAA000589', '99999999R', '800101', '310101')
    const misread = a!.slice(0, 8) + 'J' + a!.slice(9) // BAA000589 read as BAAJ00589
    const m = parseMrz([misread, b, c].join('\n'))
    expect(m?.documentNumber).toBe('BAA000589')
    expect(m?.valid).toBe(true)
    expect(repairs('BAA000589', String(checkDigit('BAA000589')))).toEqual(['BAA000589'])
    expect(repairs('BAAJ00589', String(checkDigit('BAA000589')))).toContain('BAA000589')
  })

  it('reads letters in date fields as the digits they look like', () => {
    const [a, b, c] = td1('ID', 'BAA000589', '99999999R', '800101', '310101')
    const m = parseMrz([a, b!.replace('800101', '8OO1O1'), c].join('\n'))
    expect(m?.birthDate).toBe('800101')
    expect(m?.valid).toBe(true)
  })

  it('flags a wrong check digit', () => {
    const [a, b, c] = td1('ID', 'BAA000589', '99999999R', '800101', '310101')
    const bad = a!.slice(0, 14) + String((Number(a![14]) + 1) % 10) + a!.slice(15)
    const m = parseMrz([bad, b, c].join('\n'))
    expect(m?.checks.number).toBe(false)
    expect(m?.valid).toBe(false)
  })

  it('returns null without three MRZ lines', () => {
    expect(parseMrz('hello\nworld')).toBeNull()
    expect(parseMrz(ICAO.slice(0, 2).join('\n'))).toBeNull()
  })
})
