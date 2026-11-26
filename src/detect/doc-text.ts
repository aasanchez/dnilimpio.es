// SPDX-License-Identifier: AGPL-3.0-or-later
// Guesses the document type from the text printed on the front of the card, and from where the
// document number sits. Pure: OCR lines in, a guess out. Nothing is stored or logged.
//
// Markers come from the specimens (sources in docs/ZONES.md):
//   - DNI 4.0 (dnielectronico.es, REF_110): "REINO DE ESPAÑA", "NATIONAL IDENTITY CARD", the
//     "EMISIÓN" field, "NUM SOPORTE", and the DNI number at the top of the card.
//   - DNI 3.0 (PRADO ESP-BO-05001): "NUM SOPORT" (without the final E) and the DNI number at the
//     bottom left. Both versions carry "DOCUMENTO NACIONAL DE IDENTIDAD".
//   - TIE (PRADO ESP-HO-03001, and a real "TARJETA DE RESIDENCIA PERMANENTE"): "PERMISO DE
//     RESIDENCIA", "RESIDENCE PERMIT", "TITRE DE SEJOUR", "TIPO DE PERMISO", "TYPE OF PERMIT",
//     "CARD EXPIRY", "PERSONAL NUMBER", and an NIE number (X/Y/Z first).
//
// Like the MRZ guess (doc-type.ts), the result only preselects the picker.

import { isIdNumber } from '../ocr/find.ts'
import type { DocModel } from '../zones/types.ts'
import type { DocGuess } from './doc-type.ts'

/** One OCR line. `y` is the vertical centre of the line, as a share of the card's height (0 top, 1 bottom). */
export interface TextLine { readonly text: string; readonly y?: number | undefined }

type Target = 'tie' | 'dni' | 'dni-4.0' | 'dni-3.0'

interface Marker {
  readonly phrase: string
  readonly target: Target
  readonly weight: number
  /** Exact word match only, for short words a misread could turn into another marker. */
  readonly exact?: boolean
}

const MARKERS: readonly Marker[] = [
  { phrase: 'PERMISO DE RESIDENCIA', target: 'tie', weight: 3 },
  { phrase: 'TARJETA DE RESIDENCIA', target: 'tie', weight: 3 },
  { phrase: 'RESIDENCE PERMIT', target: 'tie', weight: 3 },
  { phrase: 'TITRE DE SEJOUR', target: 'tie', weight: 2 },
  { phrase: 'TIPO DE PERMISO', target: 'tie', weight: 2 },
  { phrase: 'TYPE OF PERMIT', target: 'tie', weight: 2 },
  { phrase: 'CARD EXPIRY', target: 'tie', weight: 1 },
  { phrase: 'PERSONAL NUMBER', target: 'tie', weight: 1 },
  { phrase: 'DOCUMENTO NACIONAL DE IDENTIDAD', target: 'dni', weight: 3 },
  { phrase: 'REINO DE ESPANA', target: 'dni-4.0', weight: 3 },
  { phrase: 'NATIONAL IDENTITY CARD', target: 'dni-4.0', weight: 3 },
  { phrase: 'EMISION', target: 'dni-4.0', weight: 1, exact: true },
  { phrase: 'SOPORTE', target: 'dni-4.0', weight: 1, exact: true },
  { phrase: 'SOPORT', target: 'dni-3.0', weight: 1, exact: true },
]

/** A kind needs at least this score, and more than the other kind, to be guessed. */
const MIN_SCORE = 2

/** Upper case, no accents, only letters and digits separated by single spaces. */
export function normalise (s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

/** Misreads allowed in a phrase of this length: none up to 7 characters, then one per 7. */
const allowed = (len: number): number => Math.floor(len / 7)

/**
 * Whether `needle` occurs in `hay` with at most `maxErr` edits (approximate substring matching:
 * the match may start anywhere in `hay`).
 */
export function fuzzyContains (hay: string, needle: string, maxErr: number): boolean {
  if (needle.length === 0) return true
  let prev = new Array<number>(hay.length + 1).fill(0)
  for (let i = 1; i <= needle.length; i++) {
    const cur = new Array<number>(hay.length + 1)
    cur[0] = i
    for (let j = 1; j <= hay.length; j++) {
      const sub = (prev[j - 1] ?? 0) + (needle[i - 1] === hay[j - 1] ? 0 : 1)
      cur[j] = Math.min(sub, (prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1)
    }
    prev = cur
  }
  return prev.some((d) => d <= maxErr)
}

function matches (line: string, m: Marker): boolean {
  if (m.exact === true) return line.split(' ').includes(m.phrase)
  return fuzzyContains(line, m.phrase, allowed(m.phrase.length))
}

/** Scores of each target for these lines. Each marker counts once. */
export function scoreText (lines: readonly TextLine[]): Record<Target, number> {
  const score: Record<Target, number> = { tie: 0, dni: 0, 'dni-4.0': 0, 'dni-3.0': 0 }
  const norm = lines.map((l) => ({ text: normalise(l.text), y: l.y, raw: l.text }))
  const all = norm.map((l) => l.text).join(' ')
  for (const m of MARKERS) {
    if (norm.some((l) => matches(l.text, m)) || (m.exact !== true && matches(all, m))) score[m.target] += m.weight
  }
  // Document numbers. The MRZ (with '<') is left out: it is on the back and holds the number too.
  let nie = false
  let top = false
  let bottom = false
  for (const l of norm) {
    if (l.raw.includes('<')) continue
    for (const word of l.text.split(' ')) {
      if (!isIdNumber(word)) continue
      if (/^[XYZ]/.test(word)) nie = true
      else if (l.y !== undefined && l.y < 0.3) top = true
      else if (l.y !== undefined && l.y > 0.75) bottom = true
    }
  }
  if (nie) score.tie += 2
  if (top) score['dni-4.0'] += 2
  if (bottom) score['dni-3.0'] += 2
  return score
}

/** Guesses the document from the front's text. Returns null when the text says too little. */
export function classifyText (lines: readonly TextLine[]): DocGuess | null {
  const s = scoreText(lines)
  const dni = s.dni + s['dni-4.0'] + s['dni-3.0']
  if (s.tie >= MIN_SCORE && s.tie > dni) return { kind: 'tie', model: 'tie' }
  if (dni < MIN_SCORE || dni <= s.tie) return null
  const v4 = s['dni-4.0']
  const v3 = s['dni-3.0']
  let model: DocModel | null = null
  if (v4 >= MIN_SCORE && v4 > v3) model = 'dni-4.0'
  else if (v3 >= MIN_SCORE && v3 > v4) model = 'dni-3.0'
  return { kind: 'dni', model }
}

/**
 * Combines the MRZ guess with the text guess. The MRZ has check digits, so a model it names wins.
 * The text only fills in what the MRZ left open: the DNI version, or the whole guess when no MRZ
 * was read. When the two disagree on the kind, the MRZ's answer stands.
 */
export function combine (mrz: DocGuess | null, text: DocGuess | null): DocGuess | null {
  if (!mrz) return text
  if (mrz.model !== null || !text) return mrz
  if (mrz.kind === 'dni' && text.kind === 'dni') return { kind: 'dni', model: text.model }
  return mrz
}
