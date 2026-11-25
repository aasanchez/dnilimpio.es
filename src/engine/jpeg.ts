// SPDX-License-Identifier: AGPL-3.0-or-later
// JPEG segment filter for export (spec §16). The browser encodes the sanitised canvas as a new JPEG;
// this module then rebuilds the file keeping only the segments a decoder needs, so no metadata
// (EXIF, GPS, thumbnails, ICC, XMP, comments, camera data) can reach the PDF, whatever the encoder wrote.

/** Segments kept: frame, tables, restart interval and scan. Everything else (APP0–APP15, COM, …) is dropped. */
const KEEP = new Set([
  0xc0, 0xc1, 0xc2, // SOF0–SOF2: baseline, extended, progressive (Huffman)
  0xc4, // DHT
  0xdb, // DQT
  0xdd, // DRI
])
const SOF = new Set([0xc0, 0xc1, 0xc2])

export interface JpegInfo { readonly width: number; readonly height: number; readonly components: 1 | 3 }

export class JpegError extends Error {}

function u16 (b: Uint8Array, i: number): number {
  if (i + 1 >= b.length) throw new JpegError('Truncated JPEG')
  return (b[i]! << 8) | b[i + 1]!
}

/** End of the entropy-coded data that starts at `i`: the first marker that is not RSTn or a stuffed 0xFF00. */
function scanEnd (b: Uint8Array, i: number): number {
  for (let j = i; j + 1 < b.length; j++) {
    if (b[j] !== 0xff) continue
    const m = b[j + 1]!
    if (m === 0x00 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) continue
    return j
  }
  throw new JpegError('JPEG has no end marker')
}

/**
 * Returns a new JPEG containing only SOI, DQT, DHT, DRI, SOF0–2, SOS + scan data and EOI.
 * Rejects arithmetic coding, lossless and hierarchical frames, and anything after EOI.
 */
export function stripJpeg (src: Uint8Array): { bytes: Uint8Array; info: JpegInfo } {
  if (src[0] !== 0xff || src[1] !== 0xd8) throw new JpegError('Not a JPEG')
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])]
  let info: JpegInfo | null = null
  let i = 2
  for (;;) {
    if (src[i] !== 0xff) throw new JpegError('Expected a marker')
    while (src[i] === 0xff) i++ // fill bytes
    const m = src[i]
    if (m === undefined) throw new JpegError('Truncated JPEG')
    const at = i - 1
    i++
    if (m === 0xd9) {
      parts.push(new Uint8Array([0xff, 0xd9]))
      break
    }
    const len = u16(src, i)
    if (len < 2 || i + len > src.length) throw new JpegError('Bad segment length')
    const segEnd = i + len
    if (m === 0xda) {
      const end = scanEnd(src, segEnd)
      parts.push(src.subarray(at, end))
      i = end
      continue
    }
    if (m >= 0xc3 && m <= 0xcf && m !== 0xc4) throw new JpegError('Unsupported JPEG coding')
    if (SOF.has(m)) {
      const height = u16(src, i + 3)
      const width = u16(src, i + 5)
      const n = src[i + 7]
      if (n !== 1 && n !== 3) throw new JpegError('Unsupported number of colour components')
      if (width === 0 || height === 0) throw new JpegError('Bad JPEG size')
      info = { width, height, components: n }
    }
    if (KEEP.has(m)) parts.push(src.subarray(at, segEnd))
    i = segEnd
  }
  if (!info) throw new JpegError('JPEG has no frame header')
  const total = parts.reduce((n, p) => n + p.length, 0)
  const bytes = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    bytes.set(p, o)
    o += p.length
  }
  return { bytes, info }
}

/** Marker codes in order of appearance, excluding those inside scan data. For tests and audits. */
export function listMarkers (b: Uint8Array): number[] {
  const out: number[] = []
  let i = 2
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new JpegError('Not a JPEG')
  out.push(0xd8)
  while (i < b.length) {
    while (b[i] === 0xff) i++
    const m = b[i]
    if (m === undefined) break
    out.push(m)
    i++
    if (m === 0xd9) break
    const len = u16(b, i)
    i += len
    if (m === 0xda) i = scanEnd(b, i)
  }
  return out
}
