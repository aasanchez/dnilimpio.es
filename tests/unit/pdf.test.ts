// SPDX-License-Identifier: AGPL-3.0-or-later
// Inspects the exported PDF at object level (spec §16, §27 "test embedded rasters and PDF objects").
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { stripJpeg } from '../../src/engine/jpeg.ts'
import { A4_PT, CARD_BOX_PT, GAP_PT, ID1_MM, buildPdf, layout, pdfFileName, type Placement } from '../../src/engine/pdf.ts'
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

const PT_PER_MM = 72 / 25.4
const CARD = { width: 1712, height: 1080 }

/** Where each image is drawn: the `cm` transforms before each `Do`, multiplied (only scale and move). */
function drawn (pdf: Uint8Array): Placement[] {
  const content = streams(pdf).filter((s) => !s.dict.includes('/Subtype /Image'))
  expect(content).toHaveLength(1)
  const c = content[0]!
  const ops = c.dict.includes('/FlateDecode') ? inflateSync(c.body).toString('latin1') : latin1(c.body)
  return ops.split(/\bDo\b/).slice(0, -1).map((block) => {
    let at = { x: 0, y: 0, w: 1, h: 1 }
    for (const m of block.slice(block.lastIndexOf('q')).matchAll(/((?:-?[\d.]+\s+){6})cm\b/g)) {
      const [a = 0, , , d = 0, e = 0, f = 0] = (m[1] ?? '').trim().split(/\s+/).map(Number)
      at = { x: at.x + e * at.w, y: at.y + f * at.h, w: at.w * a, h: at.h * d }
    }
    return at
  })
}

describe('layout', () => {
  it('prints a side at 130% of the ID-1 card size, about 111 × 70 mm', () => {
    expect(CARD_BOX_PT.w / PT_PER_MM).toBeCloseTo(ID1_MM.w * 1.3, 6)
    expect(CARD_BOX_PT.h / PT_PER_MM).toBeCloseTo(ID1_MM.h * 1.3, 6)
    const [p] = layout([CARD])
    expect(p!.w / PT_PER_MM).toBeCloseTo(111.28, 1)
    expect(p!.h / PT_PER_MM).toBeGreaterThan(69.5)
    expect(p!.h / PT_PER_MM).toBeLessThanOrEqual(ID1_MM.h * 1.3 + 1e-9)
    expect(p!.w / p!.h).toBeCloseTo(CARD.width / CARD.height, 9)
  })

  it('centres one side on the page', () => {
    const [p] = layout([CARD])
    expect(p!.x + p!.w / 2).toBeCloseTo(A4_PT.w / 2, 6)
    expect(p!.y + p!.h / 2).toBeCloseTo(A4_PT.h / 2, 6)
  })

  it('stacks two sides, front on top, centred horizontally and as a pair vertically', () => {
    const [front, back] = layout([CARD, CARD])
    for (const p of [front!, back!]) expect(p.x + p.w / 2).toBeCloseTo(A4_PT.w / 2, 6)
    // PDF y grows upwards: the front is above the back, with the gap between them.
    expect(front!.y - (back!.y + back!.h)).toBeCloseTo(GAP_PT, 6)
    expect(GAP_PT / PT_PER_MM).toBeCloseTo(10, 6)
    const top = front!.y + front!.h
    const bottom = back!.y
    expect(A4_PT.h - top).toBeCloseTo(bottom, 6)
    expect(bottom).toBeGreaterThan(0)
  })

  it('keeps an odd aspect ratio inside the card box', () => {
    const [tall] = layout([{ width: 1000, height: 4000 }])
    expect(tall!.h).toBeCloseTo(CARD_BOX_PT.h, 6)
    expect(tall!.w / tall!.h).toBeCloseTo(0.25, 9)
  })
})

describe('buildPdf', () => {
  it('writes both sides on one A4 page and nothing but the cleaned images', async () => {
    const pdf = await buildPdf([dirtyJpeg(), dirtyJpeg()])
    const text = latin1(pdf)
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text).toMatch(/\/Type \/Pages[\s\S]*?\/Count 1\b/)
    expect(text.match(/\/Type \/Page\b(?!s)/g)).toHaveLength(1)
    expect(text.match(/\/MediaBox \[ 0 0 595\.28 841\.89 \]/g)).toHaveLength(1)

    const images = streams(pdf).filter((s) => s.dict.includes('/Subtype /Image'))
    expect(images).toHaveLength(2)
    const clean = stripJpeg(dirtyJpeg()).bytes
    for (const img of images) {
      expect(img.dict).toContain('/Filter /DCTDecode')
      expect(img.body).toEqual(clean)
    }
  })

  it('writes a single page when only the front is exported (the back is optional)', async () => {
    const text = latin1(await buildPdf([dirtyJpeg()]))
    expect(text).toMatch(/\/Type \/Pages[\s\S]*?\/Count 1/)
    expect(text.match(/\/Type \/Page\b(?!s)/g)).toHaveLength(1)
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

  it('draws the images at the laid-out size, keeping every pixel of the JPEG', async () => {
    const pdf = await buildPdf([dirtyJpeg(), dirtyJpeg()])
    const info = stripJpeg(dirtyJpeg()).info
    const want = layout([info, info])
    const got = drawn(pdf)
    expect(got).toHaveLength(2)
    got.forEach((at, i) => {
      expect(at.w).toBeCloseTo(want[i]!.w, 2)
      expect(at.h).toBeCloseTo(want[i]!.h, 2)
      expect(at.x).toBeCloseTo(want[i]!.x, 2)
      expect(at.y).toBeCloseTo(want[i]!.y, 2)
    })
    // The image object keeps the encoder's pixel size: only the drawn size changes.
    const img = streams(pdf).find((s) => s.dict.includes('/Subtype /Image'))!
    expect(img.dict).toContain(`/Width ${String(info.width)}`)
    expect(img.dict).toContain(`/Height ${String(info.height)}`)
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

  it('rejects no sides, more than two sides and non-JPEG input', async () => {
    await expect(buildPdf([])).rejects.toThrow()
    await expect(buildPdf([dirtyJpeg(), dirtyJpeg(), dirtyJpeg()])).rejects.toThrow()
    await expect(buildPdf([new Uint8Array([1, 2, 3])])).rejects.toThrow()
  })
})

describe('pdfFileName', () => {
  it('names the file after the document type only, in ASCII', () => {
    expect(pdfFileName('dni')).toBe('redacted-dni.pdf')
    expect(pdfFileName('tie')).toBe('redacted-tie.pdf')
  })
})
