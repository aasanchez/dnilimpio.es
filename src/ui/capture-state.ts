// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Side } from '../zones/types.ts'

/** Decoded photo per side, held in memory only (spec §20). The back is optional: null when skipped. */
export interface CaptureState { front: ImageBitmap | null; back: ImageBitmap | null }

/**
 * The sides that have a photo, front first: the sides to straighten, edit and export. The front is
 * required to go on; the back is optional, as many requests need only the front.
 */
export function sidesOf (photos: { readonly front: unknown; readonly back: unknown }): Side[] {
  return (['front', 'back'] as const).filter((s) => photos[s] !== null)
}

/** True when the photo step can go on: the front is there. The back may be added or skipped. */
export const canContinue = (photos: { readonly front: unknown }): boolean => photos.front !== null
