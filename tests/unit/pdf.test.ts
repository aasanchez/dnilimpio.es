// SPDX-License-Identifier: AGPL-3.0-or-later
// Inspects the exported PDF at object level (spec §16, §27 "test embedded rasters and PDF objects").
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { stripJpeg } from '../../src/engine/jpeg.ts'
import { A4_PT, MARGIN_PT, buildPdf, place } from '../../src/engine/pdf.ts'
import { CANARIES, dirtyJpeg, latin1 } from './jpeg-fixture.ts'

/** Dictionary text of every object, with stream bodies cut out. */
function objects (pdf: string): string[] {
  return [...pdf.matchAll(/\d+ 0 obj([\s\S]*?)endobj/g)].map((m) => (m[1] ?? '').replace(/stream\r?\n[\s\S]*?endstream/, 'stream'))
}

function streams (pdf: Uint8Array): Array<{ dict: string; body: Uint8Array }> {
  const s = latin1(pdf)
  const out: Array<{ dict: string; body: Uint8Array }> = []
  for (const m of s.matchAll(/<<([\s\S]*?)>>\s*stream\r?\n/g)) {
    const len = Number(/\/Length (\d+)/.exec(m[1] ?? '')?.[1])
    const start = m.index + m[0].length
    out.push({ dict: m[1] ?? '', body: pdf.subarray(start, start + len) })
  }
  return out
}

describe('place', () => {
  it('centres the image inside the margins and keeps its aspect ratio', () => {
    const p = place(1712, 1080)
    expect(p.w).toBeCloseTo(A4_PT.w - 2 * MARGIN_PT, 6)
    expect(p.w / p.h).toBeCloseTo(1712 / 1080, 9)
    expect(p.x).toBeCloseTo(MARGIN_PT, 6)
    expect(p.y + p.h / 2).toBeCloseTo(A4_PT.h / 2, 6)
    const tall = place(1000, 4000)
    expect(tall.h).toBeCloseTo(A4_PT.h - 2 * MARGIN_PT, 6)
  })
})

describe('buildPdf', () => {
  it('writes one A4 page per side and nothing but the cleaned images', async () => {
    const pdf = await buildPdf([dirtyJpeg(), dirtyJpeg()])
    const text = latin1(pdf)
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text).toMatch(/\/Type \/Pages[\s\S]*?\/Count 2/)
    expect(text.match(/\/Type \/Page\b(?!s)/g)).toHaveLength(2)
    expect(text.match(/\/MediaBox \[ 0 0 595\.28 841\.89 \]/g)).toHaveLength(2)

    const images = streams(pdf).filter((s) => s.dict.includes('/Subtype /Image'))
    expect(images).toHaveLength(2)
    const clean = stripJpeg(dirtyJpeg()).bytes
    for (const img of images) {
      expect(img.dict).toContain('/Filter /DCTDecode')
      expect(img.body).toEqual(clean)
    }
  })

  it('contains no metadata, text, annotations, forms, scripts or attachments', async () => {
    const pdf = await buildPdf([dirtyJpeg()])
    const text = latin1(pdf)
    for (const c of CANARIES) expect(text).not.toContain(c)
    for (const key of ['/Info', '/Metadata', '/Producer', '/Creator', '/CreationDate', '/ModDate', '/Title', '/Author',
      '/JavaScript', '/JS', '/OpenAction', '/AA', '/AcroForm', '/EmbeddedFile', '/FileAttachment', '/Type /Font', '/FontFile', '/ObjStm', '/Encrypt']) {
      expect(objects(text).join('\n')).not.toContain(key)
    }
    // The library writes an empty font dictionary and an empty annotation array; any entry would be a defect.
    for (const m of text.matchAll(/\/Font <<([^>]*)>>/g)) expect((m[1] ?? '').trim()).toBe('')
    for (const m of text.matchAll(/\/Annots \[([^\]]*)\]/g)) expect((m[1] ?? '').trim()).toBe('')
  })

  it('draws each image with a single transform and no text operators', async () => {
    const pdf = await buildPdf([dirtyJpeg()])
    const content = streams(pdf).filter((s) => !s.dict.includes('/Subtype /Image'))
    expect(content).toHaveLength(1)
    const c = content[0]!
    const ops = c.dict.includes('/FlateDecode') ? inflateSync(c.body).toString('latin1') : latin1(c.body)
    expect(ops).not.toMatch(/\bBT\b|\bTj\b|\bTJ\b/)
    expect(ops.match(/\bDo\b/g)).toHaveLength(1)
  })

  it('is deterministic', async () => {
    expect(await buildPdf([dirtyJpeg()])).toEqual(await buildPdf([dirtyJpeg()]))
  })

  it('rejects an empty page list and non-JPEG input', async () => {
    await expect(buildPdf([])).rejects.toThrow()
    await expect(buildPdf([new Uint8Array([1, 2, 3])])).rejects.toThrow()
  })
})
