// SPDX-License-Identifier: AGPL-3.0-or-later
/** Decoded photo per side, held in memory only (spec §20). */
export interface CaptureState { front: ImageBitmap | null; back: ImageBitmap | null }
