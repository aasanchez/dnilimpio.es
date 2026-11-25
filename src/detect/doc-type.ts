// SPDX-License-Identifier: AGPL-3.0-or-later
// Guesses the document type from the MRZ on the back. Pure: an Mrz and today's date in, a guess out.
//
//   - Document code "IR" (residence permit) with issuing state ESP → TIE.
//   - Document code "ID" with issuing state ESP → DNI. The MRZ of the DNI 3.0 and 4.0 is the same,
//     so the version comes from the issue date, inferred from the dates of birth and expiry:
//     the DNI is valid 2 years under age 5, 5 years under 30, 10 years under 70, and permanent from
//     70 (Real Decreto 1553/2005, art. 6). The DNI 4.0 is issued from 2 August 2021.
//     When the dates allow both versions, or the check digits fail, there is no version guess.
//
// The result only preselects the picker: the person confirms or changes it.

import type { Mrz } from '../ocr/mrz.ts'
import type { DocModel } from '../zones/types.ts'

/** First day the DNI 4.0 was issued. */
export const DNI_4_0_FROM = '2021-08-02'
/** First day the DNI 3.0 was issued. Earlier DNIs (2.0 and older) are not supported. */
export const DNI_3_0_FROM = '2015-01-01'

/**
 * The guess. `model` is null when the MRZ is not from a supported document, or the DNI version
 * cannot be told apart. `kind` still says "DNI" in that case, so the screen can say so.
 */
export interface DocGuess {
  readonly kind: 'dni' | 'tie' | 'other'
  readonly model: DocModel | null
}

/** Validity in years by age at issue, with the age range [from, to) it applies to. */
const VALIDITY: ReadonlyArray<{ readonly years: number; readonly from: number; readonly to: number }> = [
  { years: 2, from: 0, to: 5 },
  { years: 5, from: 5, to: 30 },
  { years: 10, from: 30, to: 70 },
]

/** An MRZ date (YYMMDD) as ISO YYYY-MM-DD. Birth dates in the future belong to the previous century. */
export function mrzDate (yymmdd: string, kind: 'birth' | 'expiry', today: string): string | null {
  if (!/^[0-9]{6}$/.test(yymmdd)) return null
  const yy = Number(yymmdd.slice(0, 2))
  const mm = Number(yymmdd.slice(2, 4))
  const dd = Number(yymmdd.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const nowYy = Number(today.slice(2, 4))
  const century = kind === 'birth' && yy > nowYy ? 1900 : 2000
  return `${String(century + yy)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`
}

/** Adds whole years to an ISO date (string arithmetic: no time zones involved). */
const addYears = (iso: string, years: number): string => `${String(Number(iso.slice(0, 4)) + years).padStart(4, '0')}${iso.slice(4)}`

/** Age in whole years on `on` of someone born on `birth`. */
export function ageOn (birth: string, on: string): number {
  const years = Number(on.slice(0, 4)) - Number(birth.slice(0, 4))
  return on.slice(5) < birth.slice(5) ? years - 1 : years
}

/**
 * Possible issue dates of a DNI: expiry minus 2, 5 or 10 years, kept only when the holder's age on
 * that date matches that validity. The expiry may fall on the holder's birthday instead of the
 * issue day, so the issue date is treated as a range of one year before the exact anniversary.
 */
export function issueRanges (birth: string, expiry: string): Array<{ readonly from: string; readonly to: string }> {
  const out: Array<{ from: string; to: string }> = []
  for (const v of VALIDITY) {
    const to = addYears(expiry, -v.years)
    const from = addYears(to, -1)
    // The age range at issue must overlap the age range this validity applies to.
    if (ageOn(birth, to) < v.from || ageOn(birth, from) >= v.to) continue
    out.push({ from, to })
  }
  return out
}

/** Which DNI version was issued in [from, to], or null when the range crosses a boundary. */
function versionIn (r: { readonly from: string; readonly to: string }): DocModel | 'older' | null {
  if (r.from >= DNI_4_0_FROM) return 'dni-4.0'
  if (r.to < DNI_4_0_FROM && r.from >= DNI_3_0_FROM) return 'dni-3.0'
  if (r.to < DNI_3_0_FROM) return 'older'
  return null
}

/** Guesses the document from its MRZ. `today` is an ISO date (YYYY-MM-DD). */
export function classify (mrz: Mrz, today: string): DocGuess {
  if (mrz.issuingState !== 'ESP') return { kind: 'other', model: null }
  if (mrz.documentCode === 'IR') return { kind: 'tie', model: 'tie' }
  if (mrz.documentCode !== 'ID') return { kind: 'other', model: null }
  if (!mrz.checks.birth || !mrz.checks.expiry) return { kind: 'dni', model: null }
  const birth = mrzDate(mrz.birthDate, 'birth', today)
  const expiry = mrzDate(mrz.expiryDate, 'expiry', today)
  if (birth === null || expiry === null) return { kind: 'dni', model: null }
  const versions = new Set(issueRanges(birth, expiry).map(versionIn))
  // Permanent DNIs (holder 70 or over) match no range: the version cannot be inferred.
  if (versions.size !== 1) return { kind: 'dni', model: null }
  const [v] = versions
  return { kind: 'dni', model: v === 'dni-4.0' || v === 'dni-3.0' ? v : null }
}
