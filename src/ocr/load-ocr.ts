// SPDX-License-Identifier: AGPL-3.0-or-later
// Single entry point for the on-demand OCR module, so the first page load does not include the OCR engine.

let pending: Promise<typeof import('./ocr.ts')> | null = null

export async function loadOcr (): Promise<typeof import('./ocr.ts')> {
  pending ??= import('./ocr.ts').catch((e: unknown) => {
    pending = null
    throw e
  })
  return await pending
}

/**
 * Stops OCR and frees its memory, if the OCR module was ever loaded (it is never loaded just for this).
 * Called when the user clears everything, so no worker keeps the last card it read.
 */
export async function stopOcrIfLoaded (): Promise<void> {
  if (!pending) return
  try {
    await (await pending).stopOcr()
  } catch {
    // Not loaded after all: nothing to stop.
  }
}
