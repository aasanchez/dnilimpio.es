// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic canaries: fictional values that enter the app from every place document data comes
// from. A request, report or file that carries one of them carried document data.

/** Values printed on the synthetic cards of toEditorWithText (OCR reads them). */
export const CARD_CANARIES = ['99999999R', 'CARMEN', 'ESPANOLA', 'BAA000589', 'CAA000000', '987654', 'CALLE MAYOR']
/** File names to load the two photos with. */
export const NAMES = ['canary-name-front-q7k2.png', 'canary-name-back-x4m9.png'] as const
/** A word that appears only in the watermark the user types. */
export const MARK = 'CANARYMARKZ8V3'
/** A watermark text that carries MARK and a card value. */
export const WATERMARK = `Solo para el alquiler ${MARK} 99999999R`
/** Every canary, upper case. */
export const CANARIES = [...CARD_CANARIES, MARK, ...NAMES.map((n) => n.replace(/\.png$/, '').toUpperCase())]

function safeDecode (s: string): string {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')) } catch { return s }
}

/** The canaries found in some text, in plain or URL-encoded form, case-insensitive. */
export function canariesIn (...parts: string[]): string[] {
  const raw = parts.join('\n')
  const text = [raw, safeDecode(raw)].join('\n').toUpperCase()
  return CANARIES.filter((c) => text.includes(c))
}
