// SPDX-License-Identifier: AGPL-3.0-or-later
// Test helpers: minimal file headers for each accepted image type, with any size in pixels.
// They carry no pixel data, so a browser cannot decode them: they test the checks before decoding.

const u16be = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff]
const u32be = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const u16le = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff]
const u24le = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff]
const u32le = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const text = (s: string): number[] => Array.from(new TextEncoder().encode(s))

/** An ISO BMFF box; `full` adds version and flags (4 zero bytes). */
export function box (type: string, body: number[], full = false): number[] {
  const content = full ? [0, 0, 0, 0, ...body] : body
  return [...u32be(content.length + 8), ...text(type), ...content]
}

export function pngHeader (width: number, height: number): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32be(13), ...text('IHDR'), ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0])
}

/** A JPEG with an APP1 segment of `appBytes` before the frame header, as phones write EXIF. */
export function jpegHeader (width: number, height: number, appBytes = 100): Uint8Array {
  const app = [0xff, 0xe1, ...u16be(appBytes + 2), ...new Array<number>(appBytes).fill(0x41)]
  const sof = [0xff, 0xc0, ...u16be(17), 8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
  return new Uint8Array([0xff, 0xd8, ...app, ...sof, 0xff, 0xda, 0, 2])
}

export function webpHeader (kind: 'VP8 ' | 'VP8L' | 'VP8X', width: number, height: number): Uint8Array {
  let chunk: number[]
  if (kind === 'VP8 ') chunk = [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height)]
  else if (kind === 'VP8L') chunk = [0x2f, ...u32le(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14))]
  else chunk = [0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]
  const body = [...text(kind), ...u32le(chunk.length), ...chunk, 0, 0]
  return new Uint8Array([...text('RIFF'), ...u32le(body.length + 4), ...text('WEBP'), ...body])
}

/** An HEIC header: ftyp, then meta with one `ispe` per image (a tiled photo has several). */
export function heicHeader (sizes: ReadonlyArray<readonly [number, number]>, major = 'heic', compatible = ['mif1', 'heic']): Uint8Array {
  const ftyp = box('ftyp', [...text(major), 0, 0, 0, 0, ...compatible.flatMap(text)])
  const ispe = sizes.flatMap(([w, h]) => box('ispe', [...u32be(w), ...u32be(h)], true))
  const meta = box('meta', [...box('hdlr', [0, 0, 0, 0, ...text('pict'), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], true), ...box('iprp', box('ipco', ispe))], true)
  return new Uint8Array([...ftyp, ...meta, ...box('mdat', [1, 2, 3, 4])])
}
