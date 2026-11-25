// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF export, loaded on demand: this module pulls in the PDF library, which is most of the bundle.
// main.ts starts loading it once the page is idle, so it is ready (and in the HTTP cache) before
// the user reaches the review step, even if they go offline in between.

import { buildPdf } from './pdf.ts'

/** JPEG quality for the export: high enough to keep small print readable. */
export const JPEG_QUALITY = 0.92

/** Generic file name (§16): never derived from the source file name. */
export { PDF_FILE_NAME } from './pdf.ts'

async function toJpeg (canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY) })
  if (!blob) throw new Error('JPEG encoding failed')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Builds the PDF from already sanitised canvases (one page each, in order). */
export async function exportPdf (sanitised: readonly HTMLCanvasElement[]): Promise<Blob> {
  const jpegs: Uint8Array[] = []
  let pdf: Uint8Array | undefined
  try {
    for (const c of sanitised) jpegs.push(await toJpeg(c))
    pdf = await buildPdf(jpegs)
    return new Blob([new Uint8Array(pdf)], { type: 'application/pdf' })
  } finally {
    // Also when encoding or the PDF fails: only the Blob keeps the result.
    for (const j of jpegs) j.fill(0)
    pdf?.fill(0)
  }
}
