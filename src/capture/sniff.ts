// SPDX-License-Identifier: AGPL-3.0-or-later
// Checks a photo file before the browser decodes it (ADR 0031). The type comes from the file's
// first bytes, never from its name or MIME type. The size in pixels comes from the file's header,
// so a small file that would expand to a huge image (a "decompression bomb") is refused before
// any memory is spent on its pixels. Only headers are read: no pixel data, no metadata values.

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'heic'

/** 25 MB: a 48 MP phone JPEG is about 10 to 20 MB; HEIC and WebP are smaller. */
export const MAX_BYTES = 25 * 1024 * 1024
/** 50 million pixels: room for 48 and 50 MP phone photos (8160 × 6120 is 49.9 MP). */
export const MAX_PIXELS = 50_000_000
/** Longest side: the largest canvas side every supported browser can draw. */
export const MAX_SIDE = 16_384

/** Bytes needed by `sniffType`. */
export const HEAD_BYTES = 64

/** Reads `length` bytes at `offset`; returns fewer at the end of the file. */
export type ByteReader = (offset: number, length: number) => Promise<Uint8Array>

export interface Dimensions { readonly width: number; readonly height: number }

const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx'])
const HEIF_GENERIC = new Set(['mif1', 'msf1'])

const ascii = (b: Uint8Array, at: number, n: number): string => {
  let s = ''
  for (let i = at; i < at + n && i < b.length; i++) s += String.fromCharCode(b[i] ?? 0)
  return s
}
const u16be = (b: Uint8Array, at: number): number => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0)
const u16le = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8)
const u24le = (b: Uint8Array, at: number): number => u16le(b, at) | ((b[at + 2] ?? 0) << 16)
const u32be = (b: Uint8Array, at: number): number => (u16be(b, at) * 0x10000) + u16be(b, at + 2)
const u32le = (b: Uint8Array, at: number): number => u16le(b, at) + (u16le(b, at + 2) * 0x10000)

/** The image type from the first bytes of a file, or null for anything else (GIF, PDF, AVIF…). */
export function sniffType (head: Uint8Array): ImageKind | null {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg'
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.every((v, i) => head[i] === v)) return 'png'
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') return 'webp'
  if (ascii(head, 4, 4) === 'ftyp') {
    const major = ascii(head, 8, 4)
    if (HEIC_BRANDS.has(major)) return 'heic'
    if (HEIF_GENERIC.has(major)) {
      // A generic HEIF file is HEIC only if it lists an HEVC brand (AVIF uses the same box).
      const end = Math.min(u32be(head, 0), head.length)
      for (let at = 16; at + 4 <= end; at += 4) if (HEIC_BRANDS.has(ascii(head, at, 4))) return 'heic'
    }
  }
  return null
}

/** True when the browser may safely decode an image of this size. */
export function fitsPixelLimit ({ width, height }: Dimensions): boolean {
  return width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE && width * height <= MAX_PIXELS
}

function pngSize (b: Uint8Array): Dimensions | null {
  if (ascii(b, 12, 4) !== 'IHDR') return null
  return { width: u32be(b, 16), height: u32be(b, 20) }
}

function webpSize (b: Uint8Array): Dimensions | null {
  switch (ascii(b, 12, 4)) {
    case 'VP8 ': // lossy: frame header after a 3-byte start code
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
      return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
    case 'VP8L': { // lossless: 14 bits each, stored minus one
      if (b[20] !== 0x2f) return null
      const bits = u32le(b, 21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    case 'VP8X': // extended: 24 bits each, stored minus one
      return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
    default:
      return null
  }
}

/** Start-of-frame markers that carry the image size (not DHT C4, JPG C8 or DAC CC). */
const isSof = (m: number): boolean => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc

/**
 * Walks the JPEG segments to the first start-of-frame. Only the 4-byte segment headers are read,
 * so large EXIF or XMP segments (portrait depth maps can be several MB) are skipped, not loaded.
 */
async function jpegSize (read: ByteReader, size: number): Promise<Dimensions | null> {
  let at = 2
  for (let n = 0; n < 4096 && at + 4 <= size; n++) {
    const h = await read(at, 4)
    if (h[0] !== 0xff) return null
    const marker = h[1] ?? 0
    if (marker === 0xff) { at += 1; continue } // fill byte
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue } // no length
    if (marker === 0xd9 || marker === 0xda) return null // end of image or scan data before a frame
    if (isSof(marker)) {
      const f = await read(at, 9)
      const height = u16be(f, 5)
      return f.length === 9 && height > 0 ? { width: u16be(f, 7), height } : null
    }
    const len = u16be(h, 2)
    if (len < 2) return null
    at += 2 + len
  }
  return null
}

/** A box's type, where its content starts and where it ends, or null if the header is broken. */
function boxAt (b: Uint8Array, at: number, end: number): { type: string; body: number; next: number } | null {
  if (at + 8 > end) return null
  let size = u32be(b, at)
  let body = at + 8
  if (size === 1) { size = u32be(b, at + 8) * 0x1_0000_0000 + u32be(b, at + 12); body += 8 } else if (size === 0) size = end - at
  if (size < body - at || at + size > end) return null
  return { type: ascii(b, at + 4, 4), body, next: at + size }
}

/** Largest `ispe` (image spatial extents) inside `meta/iprp/ipco`. Each HEIF image item has one. */
function largestIspe (meta: Uint8Array): Dimensions | null {
  let best: Dimensions | null = null
  const walk = (from: number, end: number, path: readonly string[]): void => {
    for (let at = from, n = 0; at < end && n < 10_000; n++) {
      const box = boxAt(meta, at, end)
      if (!box) return
      const want = path[0]
      if (want === undefined && box.type === 'ispe' && box.body + 12 <= box.next) {
        const d = { width: u32be(meta, box.body + 4), height: u32be(meta, box.body + 8) }
        if (!best || d.width * d.height > best.width * best.height) best = d
      } else if (want !== undefined && box.type === want) {
        walk(box.body, box.next, path.slice(1))
      }
      at = box.next
    }
  }
  // `meta` is a full box: its children start after 4 bytes of version and flags.
  walk(4, meta.length, ['iprp', 'ipco'])
  return best
}

/** Bounded read of the `meta` box: it holds the item table, never pixel data. */
const MAX_META = 1024 * 1024

async function heicSize (read: ByteReader, size: number): Promise<Dimensions | null> {
  let at = 0
  for (let n = 0; n < 64 && at + 8 <= size; n++) {
    const h = await read(at, 16)
    if (h.length < 8) return null
    const small = u32be(h, 0)
    const header = small === 1 ? 16 : 8
    const boxSize = small === 1 ? u32be(h, 8) * 0x1_0000_0000 + u32be(h, 12) : small === 0 ? size - at : small
    if (boxSize < header || at + boxSize > size) return null
    if (ascii(h, 4, 4) === 'meta') {
      const bodyLen = boxSize - header
      if (bodyLen <= 4 || bodyLen > MAX_META) return null
      const meta = await read(at + header, bodyLen)
      const d = largestIspe(meta)
      meta.fill(0)
      return d
    }
    at += boxSize
  }
  return null
}

/** The image size from the file's header, or null when the header cannot be read. */
export async function readDimensions (kind: ImageKind, read: ByteReader, size: number): Promise<Dimensions | null> {
  switch (kind) {
    case 'png': return pngSize(await read(0, 24))
    case 'webp': return webpSize(await read(0, 30))
    case 'jpeg': return await jpegSize(read, size)
    case 'heic': return await heicSize(read, size)
  }
}

/** A reader over a Blob that loads only the requested slice. */
export function blobReader (blob: Blob): ByteReader {
  return async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer())
}
