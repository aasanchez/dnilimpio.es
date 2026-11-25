// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF export (spec §16): one A4 portrait page per document side, each with one centred JPEG of the
// sanitised raster. Built with @cantoo/pdf-lib (maintained MIT fork of pdf-lib; see docs/adr/0001).
// The library embeds JPEG bytes as they are, so each image goes through stripJpeg() first: no
// EXIF, GPS, thumbnail, ICC, XMP or comment segment can reach the file. `updateMetadata: false`
// stops the library from writing an Info dictionary (producer, creator, dates). The result is
// checked by tests/unit/pdf.test.ts at object level, not only by how it looks.

import { PDFDocument } from '@cantoo/pdf-lib'
import { stripJpeg } from './jpeg.ts'

/** A4 in PostScript points (1 pt = 1/72 in). */
export const A4_PT = { w: 595.28, h: 841.89 } as const
/** 20 mm margin on every side of the page. */
export const MARGIN_PT = 20 * 72 / 25.4

export interface Placement { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** Largest rectangle with the image's aspect ratio that fits inside the page margins, centred. */
export function place (width: number, height: number): Placement {
  const boxW = A4_PT.w - 2 * MARGIN_PT
  const boxH = A4_PT.h - 2 * MARGIN_PT
  const s = Math.min(boxW / width, boxH / height)
  const w = width * s
  const h = height * s
  return { x: (A4_PT.w - w) / 2, y: (A4_PT.h - h) / 2, w, h }
}

/**
 * Builds the PDF from JPEGs of the sanitised rasters, one page each, in the given order (front, back).
 * Throws when there are no images or an image is not an acceptable JPEG.
 */
export async function buildPdf (jpegs: readonly Uint8Array[]): Promise<Uint8Array> {
  if (jpegs.length === 0) throw new Error('A PDF needs at least one page')
  const doc = await PDFDocument.create({ updateMetadata: false })
  for (const jpeg of jpegs) {
    const { bytes, info } = stripJpeg(jpeg)
    const image = await doc.embedJpg(bytes)
    const at = place(info.width, info.height)
    doc.addPage([A4_PT.w, A4_PT.h]).drawImage(image, { x: at.x, y: at.y, width: at.w, height: at.h })
  }
  // No object streams: every object stays readable as plain text, which keeps audits simple.
  return await doc.save({ useObjectStreams: false })
}

/** Generic file name (§16): never derived from the source file name. */
export const PDF_FILE_NAME = 'protected-document.pdf'
