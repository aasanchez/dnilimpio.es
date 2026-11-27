// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF export (spec §16): one A4 portrait page that shows each document side at 130% of the real
// ID-1 card size (ISO/IEC 7810: 85.60 × 53.98 mm; the DNI and the TIE are both ID-1). One side is
// centred on the page; two sides are stacked, front on top, centred as a pair. The JPEG keeps its
// full resolution: only the drawn size is set (1712 px over 111 mm is about 390 dpi).
// Built with @cantoo/pdf-lib (maintained MIT fork of pdf-lib; see docs/adr/0001).
// The library embeds JPEG bytes as they are, so each image goes through stripJpeg() first: no
// EXIF, GPS, thumbnail, ICC, XMP or comment segment can reach the file. `updateMetadata: false`
// stops the library from writing an Info dictionary (producer, creator, dates). The result is
// checked by tests/unit/pdf.test.ts at object level, not only by how it looks.

import { PDFDocument } from '@cantoo/pdf-lib'
import { stripJpeg } from './jpeg.ts'
import type { DocChoice } from '../zones/documents.ts'

/** A4 in PostScript points (1 pt = 1/72 in). */
export const A4_PT = { w: 595.28, h: 841.89 } as const
const MM = 72 / 25.4
/** ID-1 card size (ISO/IEC 7810) in millimetres. */
export const ID1_MM = { w: 85.6, h: 53.98 } as const
/** Each side is printed this much larger than the real card, so small print stays readable. */
export const CARD_SCALE = 1.3
/** Box each side is fitted into: 130% of ID-1, about 111 × 70 mm. */
export const CARD_BOX_PT = { w: ID1_MM.w * CARD_SCALE * MM, h: ID1_MM.h * CARD_SCALE * MM } as const
/** Space between the front and the back. */
export const GAP_PT = 10 * MM
/** At most two sides: front and back. */
export const MAX_SIDES = 2

export interface Placement { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** Largest rectangle with the image's aspect ratio that fits inside the card box. */
function fit (width: number, height: number): { w: number; h: number } {
  const s = Math.min(CARD_BOX_PT.w / width, CARD_BOX_PT.h / height)
  return { w: width * s, h: height * s }
}

/**
 * Where each side goes on the page, in the given order (front, back). Each side is fitted into the
 * card box and centred horizontally; the sides are stacked top to bottom with GAP_PT between them,
 * and the stack is centred vertically. PDF y grows upwards, so the first side gets the largest y.
 */
export function layout (sizes: ReadonlyArray<{ readonly width: number; readonly height: number }>): Placement[] {
  const boxes = sizes.map((s) => fit(s.width, s.height))
  const stack = boxes.reduce((sum, b) => sum + b.h, 0) + GAP_PT * Math.max(0, boxes.length - 1)
  let top = (A4_PT.h + stack) / 2
  return boxes.map((b) => {
    const at = { x: (A4_PT.w - b.w) / 2, y: top - b.h, w: b.w, h: b.h }
    top -= b.h + GAP_PT
    return at
  })
}

/**
 * Builds a one-page PDF from JPEGs of the sanitised rasters, in the given order (front, back).
 * Throws when there are no images, more than two, or an image is not an acceptable JPEG.
 */
export async function buildPdf (jpegs: readonly Uint8Array[]): Promise<Uint8Array> {
  if (jpegs.length === 0) throw new Error('A PDF needs at least one side')
  if (jpegs.length > MAX_SIDES) throw new Error('A PDF holds at most two sides')
  const doc = await PDFDocument.create({ updateMetadata: false })
  const cleaned = jpegs.map((j) => stripJpeg(j))
  const images = []
  for (const { bytes } of cleaned) images.push(await doc.embedJpg(bytes))
  const places = layout(cleaned.map(({ info }) => info))
  const page = doc.addPage([A4_PT.w, A4_PT.h])
  images.forEach((image, i) => {
    const at = places[i]!
    page.drawImage(image, { x: at.x, y: at.y, width: at.w, height: at.h })
  })
  // No object streams: every object stays readable as plain text, which keeps audits simple.
  return await doc.save({ useObjectStreams: false })
}

/**
 * File name of the exported PDF (§16): `redacted-dni.pdf` or `redacted-tie.pdf`. It names only the
 * document type, never anything from the photo or its file name, and stays ASCII in every language.
 */
export const pdfFileName = (choice: DocChoice): string => `redacted-${choice}.pdf`
