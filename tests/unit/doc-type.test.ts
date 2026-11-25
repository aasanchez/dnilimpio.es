// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { ageOn, classify, issueRanges, mrzDate } from '../../src/detect/doc-type.ts'
import { checkDigit, parseMrz, type Mrz } from '../../src/ocr/mrz.ts'

const TODAY = '2026-11-25'

/** A TD1 MRZ with valid check digits, parsed. Fictional data. */
function mrz (code: string, birth: string, expiry: string, state = 'ESP'): Mrz {
  const number = 'BAA000589'
  const l1 = code.padEnd(2, '<') + state + number + String(checkDigit(number)) + '99999999R'.padEnd(15, '<')
  const l2a = birth + String(checkDigit(birth)) + 'F' + expiry + String(checkDigit(expiry)) + 'ESP' + '<'.repeat(11)
  const composite = l1.slice(5, 30) + l2a.slice(0, 7) + l2a.slice(8, 15) + l2a.slice(18, 29)
  const m = parseMrz([l1, l2a + String(checkDigit(composite)), 'ESPANOLA<ESPANOLA<<CARMEN<<<<'].join('\n'))
  if (!m) throw new Error('fixture MRZ did not parse')
  return m
}

describe('dates', () => {
  it('reads MRZ dates with the right century', () => {
    expect(mrzDate('800101', 'birth', TODAY)).toBe('1980-01-01')
    expect(mrzDate('050302', 'birth', TODAY)).toBe('2005-03-02')
    expect(mrzDate('310101', 'expiry', TODAY)).toBe('2031-01-01')
    expect(mrzDate('311301', 'expiry', TODAY)).toBeNull()
    expect(mrzDate('31O101', 'expiry', TODAY)).toBeNull()
  })
  it('counts age in whole years', () => {
    expect(ageOn('1980-06-15', '2010-06-14')).toBe(29)
    expect(ageOn('1980-06-15', '2010-06-15')).toBe(30)
  })
  it('keeps only issue dates that match the validity for that age', () => {
    // Born 1980, expires 2031: 10 years (issued 2020–2021 at 40). 5 years would mean age 45.
    expect(issueRanges('1980-01-01', '2031-01-01')).toEqual([{ from: '2020-01-01', to: '2021-01-01' }])
  })
})

describe('classify', () => {
  it('TIE: document code IR', () => {
    expect(classify(mrz('IR', '900101', '290101'), TODAY)).toEqual({ kind: 'tie', model: 'tie' })
  })
  it('DNI 4.0: issued after August 2021', () => {
    // Born 1980, expires 2033 → issued 2022–2023 at 42.
    expect(classify(mrz('ID', '800101', '330101'), TODAY)).toEqual({ kind: 'dni', model: 'dni-4.0' })
    // Born 2000, expires 2028 → 5 years, issued 2022–2023 at 22.
    expect(classify(mrz('ID', '000615', '280615'), TODAY)).toEqual({ kind: 'dni', model: 'dni-4.0' })
  })
  it('DNI 3.0: issued 2015 to mid 2021', () => {
    // Born 1980, expires 2028 → issued 2017–2018 at 37.
    expect(classify(mrz('ID', '800101', '280101'), TODAY)).toEqual({ kind: 'dni', model: 'dni-3.0' })
  })
  it('DNI, version unknown: issue range crosses August 2021', () => {
    // Born 1980, expires 2031-12 → issued 2020-12 to 2021-12.
    expect(classify(mrz('ID', '800101', '311201'), TODAY)).toEqual({ kind: 'dni', model: null })
  })
  it('DNI, version unknown: permanent (holder 70 or over)', () => {
    expect(classify(mrz('ID', '400101', '991231'), TODAY)).toEqual({ kind: 'dni', model: null })
  })
  it('DNI, version unknown: issued before the DNI 3.0', () => {
    // Born 1960, expires 2020 → issued 2009–2010.
    expect(classify(mrz('ID', '600101', '200101'), TODAY)).toEqual({ kind: 'dni', model: null })
  })
  it('DNI, version unknown: a date check digit fails', () => {
    const m = mrz('ID', '800101', '330101')
    expect(classify({ ...m, checks: { ...m.checks, expiry: false } }, TODAY)).toEqual({ kind: 'dni', model: null })
  })
  it('other documents and states give no guess', () => {
    expect(classify(mrz('ID', '800101', '330101', 'FRA'), TODAY)).toEqual({ kind: 'other', model: null })
    expect(classify(mrz('P', '800101', '330101'), TODAY)).toEqual({ kind: 'other', model: null })
  })
})
