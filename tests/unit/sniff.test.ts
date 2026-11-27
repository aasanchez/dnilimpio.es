// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_PIXELS, MAX_SIDE, blobReader, fitsPixelLimit, readDimensions, sniffType, type ImageKind } from '../../src/capture/sniff.ts'
import { heicHeader, jpegHeader, pngHeader, webpHeader } from '../image-headers.ts'
import { CLEAN } from './jpeg-fixture.ts'

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)))
const dims = async (kind: ImageKind, bytes: Uint8Array): Promise<unknown> =>
  await readDimensions(kind, blobReader(new Blob([bytes as BlobPart])), bytes.length)

describe('sniffType', () => {
  it('knows JPEG, PNG, WebP and HEIC by their first bytes', () => {
    expect(sniffType(CLEAN)).toBe('jpeg')
    expect(sniffType(fixture('synthetic-front.png'))).toBe('png')
    expect(sniffType(webpHeader('VP8X', 10, 10))).toBe('webp')
    expect(sniffType(heicHeader([[10, 10]]))).toBe('heic')
    expect(sniffType(heicHeader([[10, 10]], 'mif1', ['heic']))).toBe('heic')
  })
  it('refuses every other type, whatever the file is called', () => {
    const t = new TextEncoder()
    expect(sniffType(t.encode('%PDF-1.7\n'))).toBeNull()
    expect(sniffType(t.encode('GIF89a'))).toBeNull()
    expect(sniffType(t.encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniffType(new Uint8Array([0x42, 0x4d, 0, 0]))).toBeNull() // BMP
    expect(sniffType(new Uint8Array([0x50, 0x4b, 3, 4]))).toBeNull() // ZIP
    expect(sniffType(new Uint8Array())).toBeNull()
  })
  it('refuses AVIF, which shares the HEIF container', () => {
    expect(sniffType(heicHeader([[10, 10]], 'avif', ['mif1', 'avif']))).toBeNull()
    expect(sniffType(heicHeader([[10, 10]], 'mif1', ['avif']))).toBeNull()
  })
})

describe('readDimensions', () => {
  it('reads real files', async () => {
    expect(await dims('jpeg', CLEAN)).toEqual({ width: 64, height: 40 })
    expect(await dims('png', fixture('synthetic-front.png'))).toEqual({ width: 1600, height: 1200 })
  })
  it('reads each WebP variant', async () => {
    expect(await dims('webp', webpHeader('VP8 ', 4000, 3000))).toEqual({ width: 4000, height: 3000 })
    expect(await dims('webp', webpHeader('VP8L', 1600, 1200))).toEqual({ width: 1600, height: 1200 })
    expect(await dims('webp', webpHeader('VP8X', 8160, 6120))).toEqual({ width: 8160, height: 6120 })
  })
  it('skips large JPEG segments without reading them', async () => {
    const bytes = jpegHeader(8000, 6000, 60_000)
    const reads: number[] = []
    const blob = new Blob([bytes as BlobPart])
    const read = blobReader(blob)
    const d = await readDimensions('jpeg', async (o, n) => { reads.push(n); return await read(o, n) }, bytes.length)
    expect(d).toEqual({ width: 8000, height: 6000 })
    expect(Math.max(...reads)).toBeLessThanOrEqual(9)
  })
  it('takes the largest HEIC image (the full grid, not a tile or thumbnail)', async () => {
    expect(await dims('heic', heicHeader([[512, 512], [4032, 3024], [320, 240]]))).toEqual({ width: 4032, height: 3024 })
  })
  it('returns null for a broken or truncated header', async () => {
    expect(await dims('jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull()
    expect(await dims('jpeg', jpegHeader(100, 100).slice(0, 110))).toBeNull()
    expect(await dims('png', pngHeader(10, 10).slice(0, 12))).toBeNull()
    expect(await dims('heic', heicHeader([]))).toBeNull()
    expect(await dims('heic', heicHeader([[10, 10]]).slice(0, 40))).toBeNull()
  })
})

describe('fitsPixelLimit', () => {
  it('accepts 48 and 50 MP phone photos', () => {
    expect(fitsPixelLimit({ width: 8064, height: 6048 })).toBe(true)
    expect(fitsPixelLimit({ width: 8160, height: 6120 })).toBe(true)
  })
  it('refuses images over the pixel or side limit, and empty ones', () => {
    expect(fitsPixelLimit({ width: 10_000, height: 5_001 })).toBe(false)
    expect(10_000 * 5_001).toBeGreaterThan(MAX_PIXELS)
    expect(fitsPixelLimit({ width: MAX_SIDE + 1, height: 100 })).toBe(false)
    expect(fitsPixelLimit({ width: 0, height: 100 })).toBe(false)
  })
})
