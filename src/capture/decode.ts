// SPDX-License-Identifier: AGPL-3.0-or-later
// Turns a user-supplied File/Blob into an ImageBitmap held only in memory (spec §4.1, §2.2).
// Before decoding, the file is checked by its content (ADR 0031): JPEG, PNG, WebP or HEIC by its
// first bytes, at most MAX_BYTES, and at most MAX_PIXELS by its header. Decoding is left to the
// browser: JPEG, PNG and WebP everywhere, HEIC only where the platform supports it (Safari 17+).

import {
  HEAD_BYTES, MAX_BYTES, blobReader, fitsPixelLimit, readDimensions, sniffType,
  type Dimensions, type ImageKind,
} from './sniff.ts'

export { MAX_BYTES, MAX_PIXELS } from './sniff.ts'

export type DecodeError =
  | { kind: 'not-an-image' }
  | { kind: 'heic-unsupported' }
  | { kind: 'too-large'; bytes: number }
  | { kind: 'too-many-pixels'; width: number; height: number }
  | { kind: 'decode-failed' }

export type DecodeResult = { ok: true; bitmap: ImageBitmap } | { ok: false; error: DecodeError }

export type Inspection = { ok: true; kind: ImageKind; size: Dimensions } | { ok: false; error: DecodeError }

/** Checks size, type (by content) and pixel count, reading only the file's header. */
export async function inspect (blob: Blob): Promise<Inspection> {
  if (blob.size > MAX_BYTES) return { ok: false, error: { kind: 'too-large', bytes: blob.size } }
  const read = blobReader(blob)
  let kind: ImageKind | null
  let size: Dimensions | null
  try {
    kind = sniffType(await read(0, HEAD_BYTES))
    if (!kind) return { ok: false, error: { kind: 'not-an-image' } }
    size = await readDimensions(kind, read, blob.size)
  } catch {
    return { ok: false, error: { kind: 'decode-failed' } } // the file could not be read at all
  }
  if (!size) return { ok: false, error: { kind: 'decode-failed' } }
  if (!fitsPixelLimit(size)) return { ok: false, error: { kind: 'too-many-pixels', ...size } }
  return { ok: true, kind, size }
}

/** Refuses a decoded bitmap over the limit (a live camera frame, or a header that lied). */
export function checkBitmap (bitmap: ImageBitmap): DecodeResult {
  const size = { width: bitmap.width, height: bitmap.height }
  if (fitsPixelLimit(size)) return { ok: true, bitmap }
  bitmap.close()
  return { ok: false, error: { kind: 'too-many-pixels', ...size } }
}

export async function decodeImage (blob: Blob): Promise<DecodeResult> {
  const checked = await inspect(blob)
  if (!checked.ok) return checked
  try {
    // 'from-image' applies the EXIF orientation so the user sees the photo upright.
    // EXIF itself never reaches the output: exports are re-encoded from canvas (§4.6).
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    return checkBitmap(bitmap)
  } catch {
    return { ok: false, error: { kind: checked.kind === 'heic' ? 'heic-unsupported' : 'decode-failed' } }
  }
}
