// SPDX-License-Identifier: AGPL-3.0-or-later
// Turns the OCR worker's text lines into the shape the rest of the app reads: lines in reading
// order, each split into words with their own boxes. Pure: no DOM, no worker.
//
// PP-OCR returns one box per text line. The word boxes are estimated from the position of each word
// in the line's text (character offsets scaled to the line's width). Card text is close to evenly
// spaced, and the boxes that cover data get a margin (find.ts toRect()), which absorbs the estimate.

import type { WireLine } from './protocol.ts'

export interface OcrBox { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
export interface OcrWord { readonly text: string; readonly confidence: number; readonly bbox: OcrBox }
export interface OcrLine { readonly text: string; readonly confidence: number; readonly bbox: OcrBox; readonly words: readonly OcrWord[] }

/** Splits one line into words, with boxes estimated from character offsets. */
export function toLine (w: WireLine): OcrLine {
  const text = w.text.trim()
  const bbox = { x0: w.x, y0: w.y, x1: w.x + w.w, y1: w.y + w.h }
  const perChar = text.length > 0 ? w.w / text.length : 0
  const words: OcrWord[] = []
  for (const m of text.matchAll(/\S+/g)) {
    const start = m.index
    const x0 = w.x + start * perChar
    words.push({ text: m[0], confidence: w.confidence, bbox: { x0, y0: bbox.y0, x1: x0 + m[0].length * perChar, y1: bbox.y1 } })
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
