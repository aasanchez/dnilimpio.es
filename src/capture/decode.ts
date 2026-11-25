// SPDX-License-Identifier: AGPL-3.0-or-later
// Turns a user-supplied File/Blob into an ImageBitmap held only in memory (spec §4.1, §2.2).
// Decoding is left to the browser: JPEG and PNG everywhere, HEIC only where the platform supports it (Safari).

export type DecodeError =
  | { kind: 'not-an-image'; type: string }
  | { kind: 'heic-unsupported' }
  | { kind: 'too-large'; bytes: number }
  | { kind: 'decode-failed' }

export type DecodeResult = { ok: true; bitmap: ImageBitmap } | { ok: false; error: DecodeError }

/** 40 MB: well above any phone photo, low enough to avoid exhausting memory on mobile. */
export const MAX_BYTES = 40 * 1024 * 1024

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])

export function isHeic (blob: Pick<Blob, 'type'>, name = ''): boolean {
  return HEIC_TYPES.has(blob.type.toLowerCase()) || /\.(heic|heif)$/i.test(name)
}

/** Validates type and size before decoding. Exported for unit tests. */
export function precheck (blob: Pick<Blob, 'type' | 'size'>, name = ''): DecodeError | null {
  if (blob.size > MAX_BYTES) return { kind: 'too-large', bytes: blob.size }
  // Some platforms report an empty type for HEIC; accept by extension and let the decoder decide.
  if (blob.type === '' && isHeic(blob, name)) return null
  if (!blob.type.toLowerCase().startsWith('image/')) return { kind: 'not-an-image', type: blob.type }
  return null
}

export async function decodeImage (blob: Blob, name = ''): Promise<DecodeResult> {
  const pre = precheck(blob, name)
  if (pre) return { ok: false, error: pre }
  try {
    // 'from-image' applies the EXIF orientation so the user sees the photo upright.
    // EXIF itself never reaches the output: exports are re-encoded from canvas (§4.6).
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    return { ok: true, bitmap }
  } catch {
    return { ok: false, error: isHeic(blob, name) ? { kind: 'heic-unsupported' } : { kind: 'decode-failed' } }
  }
}

/** First image file in a DataTransfer (drop or paste), or null. */
export function firstImageFile (items: Iterable<File>): File | null {
  for (const f of items) if (f.type.startsWith('image/') || isHeic(f, f.name)) return f
  return null
}
