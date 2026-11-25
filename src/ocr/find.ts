// SPDX-License-Identifier: AGPL-3.0-or-later
// Smart field finding: picks the personal data out of OCR words and returns where it is on the card.
// It works from what the text says, not from measured zones, so it also covers layouts we have not
// measured. Pure functions: OCR words in, normalised rectangles out. Nothing here touches the image.

import { parseMrz } from './mrz.ts'

/** What a found item is. The user chooses which kinds to cover. */
export type FoundKind = 'name' | 'idNumber' | 'date' | 'supportNumber' | 'can' | 'mrz'

export const FOUND_KINDS: readonly FoundKind[] = ['name', 'idNumber', 'date', 'supportNumber', 'can', 'mrz']

/** Kinds selected by default: the same data the fields list hides by default. Name and ID number stay visible. */
export const DEFAULT_KINDS: readonly FoundKind[] = ['date', 'supportNumber', 'can', 'mrz']

export interface Box { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
export interface OcrWord { readonly text: string; readonly confidence: number; readonly bbox: Box }
export interface OcrLineWords { readonly text: string; readonly words: readonly OcrWord[]; readonly bbox: Box }

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface Found { readonly kind: FoundKind; readonly text: string; readonly rect: Rect }

/** Words below this confidence (0–1) are ignored, except inside a match that a check digit or letter confirms. */
export const MIN_WORD_CONFIDENCE = 0.5

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'

/** True for a valid DNI ("12345678Z") or NIE ("X1234567L") number: the letter is a checksum. */
export function isIdNumber (s: string): boolean {
  const m = /^([XYZ]|\d)(\d{7})([A-Z])$/.exec(s)
  if (!m) return false
  const lead = m[1] ?? ''
  const n = Number(('XYZ'.indexOf(lead) >= 0 ? String('XYZ'.indexOf(lead)) : lead) + (m[2] ?? ''))
  return DNI_LETTERS[n % 23] === m[3]
}

/** Day, month and four-digit year with a real calendar day. Separators: none, space, dot, slash or dash. */
export function isDate (s: string): boolean {
  const m = /^(\d{2})[ ./-]?(\d{2})[ ./-]?(\d{4})$/.exec(s)
  if (!m) return false
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

/** Support number (IDESP): three letters and six digits on the DNI ("CAA000000"), E and eight digits on the TIE. */
export const isSupportNumber = (s: string): boolean => /^[A-Z]{3}\d{6}$/.test(s) || /^E\d{8}$/.test(s)

/** Card access number: exactly six digits on its own. */
export const isCan = (s: string): boolean => /^\d{6}$/.test(s)

/** An MRZ line: mostly A–Z, 0–9 and at least two '<' fillers. */
export const isMrzLine = (s: string): boolean => {
  const t = s.replace(/\s/g, '')
  return t.length >= 20 && (t.match(/</g)?.length ?? 0) >= 2 && /^[A-Z0-9<«]+$/.test(t)
}

const LABELS = /^(APELLIDOS?|NOMBRES?|SURNAMES?|NAMES?|NOM|COGNOMS?)\b/

/** Upper case, accents removed, so "Española" and "ESPANOLA" (as in the MRZ) compare equal. */
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/** Keeps letters, digits and the separators a value can contain. */
const clean = (s: string): string => fold(s).replace(/[^A-Z0-9<«./ -]/g, '')

const union = (ws: readonly OcrWord[]): Box => ({
  x0: Math.min(...ws.map((w) => w.bbox.x0)),
  y0: Math.min(...ws.map((w) => w.bbox.y0)),
  x1: Math.max(...ws.map((w) => w.bbox.x1)),
  y1: Math.max(...ws.map((w) => w.bbox.y1)),
})

/**
 * Pixel box → normalised rectangle, grown by a margin of a quarter of the text height on each side
 * (at least 0.5 % of the card), so the fill covers the glyphs even when OCR boxes are tight.
 */
export function toRect (b: Box, size: { readonly w: number; readonly h: number }): Rect {
  const m = Math.max((b.y1 - b.y0) * 0.25, size.w * 0.005)
  const x0 = Math.max(0, b.x0 - m)
  const y0 = Math.max(0, b.y0 - m)
  const x1 = Math.min(size.w, b.x1 + m)
  const y1 = Math.min(size.h, b.y1 + m)
  return { x: x0 / size.w, y: y0 / size.h, w: (x1 - x0) / size.w, h: (y1 - y0) / size.h }
}

/** Name parts from the third MRZ line ("ESPANOLA<ESPANOLA<<CARMEN<<<<"), at least two letters each. */
export function mrzNames (line3: string): string[] {
  return line3.split(/<+/).filter((p) => /^[A-Z]{2,}$/.test(p))
}

/**
 * Finds personal data in the OCR words of one side of a card.
 * - Numbers and dates are matched on one word or on 2–3 neighbouring words ("01 01 1980").
 *   A DNI/NIE number and a date must pass their checks; that is what makes a match trustworthy.
 * - Names: words equal to a name part read from the MRZ (any side), or the line under a
 *   "APELLIDOS" / "NOMBRE" label.
 * - The MRZ lines themselves.
 * `size` is the image size in pixels; results are normalised to it.
 */
export function findSensitive (lines: readonly OcrLineWords[], size: { readonly w: number; readonly h: number }, names: readonly string[] = []): Found[] {
  const out: Found[] = []
  const add = (kind: FoundKind, ws: readonly OcrWord[], text: string): void => { out.push({ kind, text, rect: toRect(union(ws), size) }) }
  const nameSet = new Set(names.map(fold))

  lines.forEach((line, li) => {
    const words = line.words.filter((w) => w.text.trim() !== '')
    if (isMrzLine(fold(line.text)) && words.length > 0) {
      add('mrz', words, line.text.trim())
      return
    }
    const used = new Set<number>()
    // Longest windows first, so "01 01 1980" wins over "1980" alone.
    for (const n of [3, 2, 1]) {
      for (let i = 0; i + n <= words.length; i++) {
        const idx = Array.from({ length: n }, (_, k) => i + k)
        if (idx.some((k) => used.has(k))) continue
        const ws = idx.map((k) => words[k]).filter((w): w is OcrWord => w !== undefined)
        const joined = ws.map((w) => clean(w.text)).join(' ').trim()
        const compact = joined.replace(/[ .-]/g, '')
        const confident = ws.every((w) => w.confidence >= MIN_WORD_CONFIDENCE)
        let kind: FoundKind | null = null
        if (isDate(joined)) kind = 'date'
        else if (n <= 2 && isIdNumber(compact)) kind = 'idNumber'
        else if (n === 1 && confident && isSupportNumber(compact)) kind = 'supportNumber'
        else if (n === 1 && confident && isCan(compact) && words.length === 1) kind = 'can'
        if (!kind) continue
        idx.forEach((k) => used.add(k))
        add(kind, ws, joined)
      }
    }
    const nameWords = words.filter((w, k) => !used.has(k) && nameSet.has(clean(w.text).replace(/[^A-Z]/g, '')))
    if (nameWords.length > 0) add('name', nameWords, nameWords.map((w) => w.text).join(' '))
    else if (LABELS.test(fold(lines[li - 1]?.text.trim() ?? '')) && !LABELS.test(fold(line.text.trim()))) {
      const letters = words.filter((w) => /^[A-Z'-]{2,}$/.test(fold(w.text)))
      if (letters.length > 0 && letters.length === words.length) add('name', letters, line.text.trim())
    }
  })
  return out
}

/** Name parts from any MRZ found in the given text (e.g. the back of the card), or none. */
export function namesFromText (text: string): string[] {
  const m = parseMrz(text)
  return m ? mrzNames(m.lines[2]) : []
}

/** Intersection over union of two rectangles, to skip results already covered by a box. */
export function overlap (a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const inter = ix * iy
  const uni = a.w * a.h + b.w * b.h - inter
  return uni > 0 ? inter / uni : 0
}
