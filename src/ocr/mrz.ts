// SPDX-License-Identifier: AGPL-3.0-or-later
// Machine-readable zone (MRZ) of ID-1 cards, format TD1 (ICAO 9303 part 5): 3 lines of 30 characters.
// Used on the back of the DNI 3.0/4.0 (document code "ID") and the TIE ("IR").
// Pure functions: OCR text in, checked fields out. Nothing here touches the image or the network.

export const MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'
const LINE = 30

export interface Mrz {
  /** The three lines as read, after clean-up (30 characters each). */
  readonly lines: readonly [string, string, string]
  /** Document code, e.g. "ID" (DNI) or "IR" (TIE residence permit). Fillers removed. */
  readonly documentCode: string
  readonly issuingState: string
  readonly documentNumber: string
  /** Optional data of line 1; on the DNI it holds the personal number (DNI/NIE). Fillers removed. */
  readonly optional1: string
  readonly birthDate: string
  readonly sex: string
  readonly expiryDate: string
  readonly nationality: string
  /** True when every check digit (number, birth, expiry, composite) matches. */
  readonly valid: boolean
  readonly checks: { readonly number: boolean; readonly birth: boolean; readonly expiry: boolean; readonly composite: boolean }
}

/** ICAO 9303 check digit: weights 7, 3, 1; digits as is, A–Z as 10–35, '<' as 0. */
export function checkDigit (s: string): number {
  const weights = [7, 3, 1]
  let sum = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i] ?? '<'
    const v = c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 55 : 0
    sum += v * (weights[i % 3] ?? 1)
  }
  return sum % 10
}

/** Common OCR confusions between MRZ characters (each maps to what it may really be). */
const CONFUSIONS: Readonly<Record<string, string>> = {
  0: 'ODQ', O: '0Q', D: '0', Q: '0O', J: '0', 1: 'IL', I: '1L', L: '1', 2: 'Z', Z: '2', 5: 'S', S: '5', 8: 'B', B: '8', 6: 'G', G: '6', 7: 'T', T: '7',
}
const TO_DIGIT: Readonly<Record<string, string>> = { O: '0', D: '0', Q: '0', J: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7' }
/** Fields that are digits only (dates, check digits): letters there are misreadings. */
const digits = (s: string): string => s.replace(/[A-Z]/g, (c) => TO_DIGIT[c] ?? c)

/**
 * When a field fails its check digit, lists every single-character OCR confusion that passes it.
 * Returns [field] when it already passes or no digit is readable.
 */
export function repairs (field: string, digit: string | undefined): string[] {
  if (digit === undefined || !/^[0-9]$/.test(digit) || checkDigit(field) === Number(digit)) return [field]
  const fixes = new Set<string>()
  for (let i = 0; i < field.length; i++) {
    for (const alt of CONFUSIONS[field[i] ?? ''] ?? '') {
      const v = field.slice(0, i) + alt + field.slice(i + 1)
      if (checkDigit(v) === Number(digit)) fixes.add(v)
    }
  }
  return [...fixes]
}

const ok = (field: string, digit: string | undefined): boolean => digit !== undefined && /^[0-9]$/.test(digit) && checkDigit(field) === Number(digit)
const strip = (s: string): string => s.replace(/</g, ' ').trim().replace(/\s+/g, ' ')

/**
 * Finds a TD1 MRZ in OCR output. Tolerates spaces, lower case and a few common OCR confusions in
 * filler runs (« and K for <). Returns null when there are not three 30-character lines.
 */
export function parseMrz (text: string): Mrz | null {
  const candidates = text
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/[\s«]/g, (c) => (c === '«' ? '<<' : '')).replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= LINE - 2 && l.length <= LINE + 2)
    .map((l) => l.slice(0, LINE).padEnd(LINE, '<'))
  for (let i = 0; i + 3 <= candidates.length; i++) {
    const [a, b, c] = candidates.slice(i, i + 3)
    const m = a !== undefined && b !== undefined && c !== undefined ? fromLines(a, b, c) : null
    if (m) return m
  }
  return null
}

function fromLines (r1: string, r2: string, l3: string): Mrz | null {
  if (!/^[A-Z][A-Z<]/.test(r1)) return null
  // Line 2: dates, sex, check digits. Positions that must be digits are normalised first.
  const d = (a: number, b: number): string => digits(r2.slice(a, b))
  const l2raw = d(0, 7) + r2.slice(7, 8) + d(8, 15) + r2.slice(15, 29) + d(29, 30)
  if (!/^[0-9<]{6}/.test(l2raw)) return null
  const numberDigit = digits(r1[14] ?? '<')
  const rawNumber = r1.slice(5, 14)
  // A misread document number is corrected only when exactly one candidate also passes the
  // composite check digit, which covers the number a second time.
  const compositeOf = (n: string): string => n + numberDigit + r1.slice(15, 30) + l2raw.slice(0, 7) + l2raw.slice(8, 15) + l2raw.slice(18, 29)
  const candidates = repairs(rawNumber, numberDigit)
  const fixes = candidates.length === 1 && candidates[0] === rawNumber ? candidates : candidates.filter((n) => ok(compositeOf(n), l2raw[29]))
  const number = fixes.length === 1 ? fixes[0] ?? rawNumber : rawNumber
  const l1 = r1.slice(0, 5) + number + numberDigit + r1.slice(15, 30)
  const l2 = l2raw
  const documentNumber = l1.slice(5, 14)
  const birth = l2.slice(0, 6)
  const expiry = l2.slice(8, 14)
  const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29)
  const checks = {
    number: ok(documentNumber, l1[14]),
    birth: ok(birth, l2[6]),
    expiry: ok(expiry, l2[14]),
    composite: ok(composite, l2[29]),
  }
  return {
    lines: [l1, l2, l3],
    documentCode: strip(l1.slice(0, 2)).replace(/ /g, ''),
    issuingState: strip(l1.slice(2, 5)),
    documentNumber: strip(documentNumber),
    optional1: strip(l1.slice(15, 30)),
    birthDate: birth,
    sex: l2[7] ?? '<',
    expiryDate: expiry,
    nationality: strip(l2.slice(15, 18)),
    valid: checks.number && checks.birth && checks.expiry && checks.composite,
    checks,
  }
}
