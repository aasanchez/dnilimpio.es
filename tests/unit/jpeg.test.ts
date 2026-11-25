// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { JpegError, listMarkers, stripJpeg } from '../../src/engine/jpeg.ts'
import { CANARIES, CLEAN, dirtyJpeg, latin1 } from './jpeg-fixture.ts'

const ALLOWED = new Set([0xd8, 0xc0, 0xc1, 0xc2, 0xc4, 0xdb, 0xdd, 0xda, 0xd9])

describe('stripJpeg', () => {
  it('drops every APPn and COM segment and keeps the image data', () => {
    const dirty = dirtyJpeg()
    expect(listMarkers(dirty)).toContain(0xe1)
    expect(listMarkers(dirty)).toContain(0xfe)
    const { bytes, info } = stripJpeg(dirty)
    expect(info).toEqual({ width: 64, height: 40, components: 3 })
    for (const m of listMarkers(bytes)) expect(ALLOWED.has(m)).toBe(true)
    for (const c of CANARIES) expect(latin1(bytes)).not.toContain(c)
    // The browser encoder's own APP0 (JFIF) and APP2 (ICC) are dropped too.
    expect(listMarkers(CLEAN)).toContain(0xe0)
    expect(listMarkers(bytes)).not.toContain(0xe0)
  })

  it('gives the same result for the clean and the dirty file, and is idempotent', () => {
    const a = stripJpeg(CLEAN).bytes
    const b = stripJpeg(dirtyJpeg()).bytes
    expect(b).toEqual(a)
    expect(stripJpeg(a).bytes).toEqual(a)
  })

  it('keeps the entropy-coded scan byte for byte', () => {
    const scan = (b: Uint8Array): Uint8Array => {
      const s = latin1(b)
      const i = s.indexOf('\xff\xda')
      return b.subarray(i, b.length)
    }
    expect(scan(stripJpeg(CLEAN).bytes)).toEqual(scan(CLEAN))
  })

  it('rejects non-JPEG, truncated and unsupported files', () => {
    expect(() => stripJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow(JpegError)
    expect(() => stripJpeg(CLEAN.subarray(0, 40))).toThrow(JpegError)
    const lossless = new Uint8Array(CLEAN)
    const sof = latin1(lossless).indexOf('\xff\xc0')
    lossless[sof + 1] = 0xc3
    expect(() => stripJpeg(lossless)).toThrow(/Unsupported/)
  })
})
