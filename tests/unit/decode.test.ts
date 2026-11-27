// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_BYTES, checkBitmap, inspect } from '../../src/capture/decode.ts'
import { heicHeader, jpegHeader, pngHeader, webpHeader } from '../image-headers.ts'

const png = new Uint8Array(readFileSync(new URL('../fixtures/synthetic-front.png', import.meta.url)))
const file = (bytes: Uint8Array, name: string, type: string): File => new File([bytes as BlobPart], name, { type })

describe('inspect', () => {
  it('accepts each type by content', async () => {
    expect(await inspect(file(png, 'a.png', 'image/png'))).toMatchObject({ ok: true, kind: 'png' })
    expect(await inspect(file(jpegHeader(4032, 3024), 'a.jpg', 'image/jpeg'))).toMatchObject({ ok: true, kind: 'jpeg' })
    expect(await inspect(file(webpHeader('VP8X', 4000, 3000), 'a.webp', 'image/webp'))).toMatchObject({ ok: true, kind: 'webp' })
    expect(await inspect(file(heicHeader([[4032, 3024]]), 'a.heic', ''))).toMatchObject({ ok: true, kind: 'heic' })
  })
  it('ignores the file name and MIME type', async () => {
    expect(await inspect(file(png, 'scan.pdf', 'application/pdf'))).toMatchObject({ ok: true, kind: 'png' })
    const fake = file(new TextEncoder().encode('%PDF-1.7 not a photo'), 'IMG_0001.jpg', 'image/jpeg')
    expect(await inspect(fake)).toEqual({ ok: false, error: { kind: 'not-an-image' } })
    const gif = file(new TextEncoder().encode('GIF89a......'), 'a.heic', 'image/heic')
    expect(await inspect(gif)).toEqual({ ok: false, error: { kind: 'not-an-image' } })
  })
  it('refuses a file over the size limit before reading it', async () => {
    const big = { size: MAX_BYTES + 1, slice: () => { throw new Error('read') } } as unknown as Blob
    expect(await inspect(big)).toEqual({ ok: false, error: { kind: 'too-large', bytes: MAX_BYTES + 1 } })
  })
  it('refuses a decompression bomb: a small file with a huge size in pixels', async () => {
    const bomb = pngHeader(100_000, 100_000)
    expect(bomb.length).toBeLessThan(100)
    expect(await inspect(file(bomb, 'a.png', 'image/png'))).toEqual({ ok: false, error: { kind: 'too-many-pixels', width: 100_000, height: 100_000 } })
    expect(await inspect(file(jpegHeader(65_000, 65_000), 'a.jpg', 'image/jpeg'))).toMatchObject({ ok: false, error: { kind: 'too-many-pixels' } })
    expect(await inspect(file(heicHeader([[512, 512], [20_000, 20_000]]), 'a.heic', ''))).toMatchObject({ ok: false, error: { kind: 'too-many-pixels' } })
  })
  it('refuses a file whose size cannot be read', async () => {
    expect(await inspect(file(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 'a.jpg', 'image/jpeg'))).toEqual({ ok: false, error: { kind: 'decode-failed' } })
  })
})

describe('checkBitmap', () => {
  it('passes a bitmap within the limit and closes one over it', () => {
    let closed = false
    const bmp = (width: number, height: number): ImageBitmap => ({ width, height, close: () => { closed = true } })
    expect(checkBitmap(bmp(2560, 1440)).ok).toBe(true)
    expect(closed).toBe(false)
    expect(checkBitmap(bmp(20_000, 20_000))).toEqual({ ok: false, error: { kind: 'too-many-pixels', width: 20_000, height: 20_000 } })
    expect(closed).toBe(true)
  })
})
