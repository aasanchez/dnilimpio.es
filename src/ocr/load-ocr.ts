// SPDX-License-Identifier: AGPL-3.0-or-later
// Single entry point for the on-demand OCR module, so the first page load does not include Tesseract.js.

let pending: Promise<typeof import('./ocr.ts')> | null = null

export async function loadOcr (): Promise<typeof import('./ocr.ts')> {
  pending ??= import('./ocr.ts').catch((e: unknown) => {
    pending = null
    throw e
  })
  return await pending
}
