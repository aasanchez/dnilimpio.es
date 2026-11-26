// SPDX-License-Identifier: AGPL-3.0-or-later
// Turns the OCR worker's text lines into the shape the rest of the app reads: lines in reading
// order, each split into words with their own boxes. Pure: no DOM, no worker.
//
// PP-OCR returns one box per text line. The worker measures where each word is from the ink
// (spans.ts) and those spans are used when present. Otherwise the word boxes are estimated from the
// position of each word in the line's text, and the estimate is made conservative, because these boxes become black boxes
// that must cover the whole word: in a proportional font a narrow prefix ("DNI ", "NIE:") puts the
// real start of a word up to a third earlier than the average character width says. So each word box
// starts at half its estimated offset and ends at one and a half times its estimated end, never
// outside the line. Covering a little more than the word is the safe error; covering less is not.

import type { WireLine } from './protocol.ts'

export interface OcrBox { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
export interface OcrWord { readonly text: string; readonly confidence: number; readonly bbox: OcrBox }
export interface OcrLine { readonly text: string; readonly confidence: number; readonly bbox: OcrBox; readonly words: readonly OcrWord[] }

/** Share of a word's estimated start offset, and multiple of its estimated end, used for its box. */
const START_FACTOR = 0.5
const END_FACTOR = 1.5

/** Splits one line into words, with conservative boxes estimated from character offsets. */
export function toLine (w: WireLine): OcrLine {
  const text = w.text.trim()
  const bbox = { x0: w.x, y0: w.y, x1: w.x + w.w, y1: w.y + w.h }
  const perChar = text.length > 0 ? w.w / text.length : 0
  const words: OcrWord[] = []
  const matches = [...text.matchAll(/\S+/g)]
  if (w.spans?.length === matches.length) {
    matches.forEach((m, i) => {
      const s = w.spans?.[i]
      if (s) words.push({ text: m[0], confidence: w.confidence, bbox: { x0: s.x0, y0: bbox.y0, x1: s.x1, y1: bbox.y1 } })
    })
    return { text, confidence: w.confidence, bbox, words }
  }
  for (const m of matches) {
    const start = m.index
    const end = start + m[0].length
    const x0 = w.x + start * perChar * START_FACTOR
    const x1 = Math.min(bbox.x1, w.x + end * perChar * END_FACTOR)
    words.push({ text: m[0], confidence: w.confidence, bbox: { x0, y0: bbox.y0, x1, y1: bbox.y1 } })
  }
  return { text, confidence: w.confidence, bbox, words }
}

/**
 * Reading order: top to bottom, and left to right within a row. Two lines are in the same row when
 * the centre of one lies within the other's height.
 */
export function inReadingOrder (lines: readonly OcrLine[]): OcrLine[] {
  const centre = (l: OcrLine): number => (l.bbox.y0 + l.bbox.y1) / 2
  const byTop = [...lines].sort((a, b) => centre(a) - centre(b))
  const rows: OcrLine[][] = []
  for (const l of byTop) {
    const row = rows.at(-1)
    const first = row?.[0]
    if (row && first && centre(l) >= first.bbox.y0 && centre(l) <= first.bbox.y1) row.push(l)
    else rows.push([l])
  }
  return rows.flatMap((r) => r.sort((a, b) => a.bbox.x0 - b.bbox.x0))
}

/** The worker's reply as ordered lines and the page text (one line per text line). */
export function fromWire (wire: readonly WireLine[]): { text: string; lines: OcrLine[] } {
  const lines = inReadingOrder(wire.filter((w) => w.text.trim() !== '').map(toLine))
  return { text: lines.map((l) => l.text).join('\n'), lines }
}
