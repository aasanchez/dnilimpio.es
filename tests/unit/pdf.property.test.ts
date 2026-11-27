// SPDX-License-Identifier: AGPL-3.0-or-later
// Property-based tests for the PDF export: the page layout for any image size, and the file for any
// metadata a camera or encoder could add to the JPEG. Nothing but the cleaned image may reach the PDF.
// Inputs come from the seeded generator in property.ts; a failure prints the seed that repeats it.
import { describe, expect, it } from 'vitest'
import { stripJpeg } from '../../src/engine/jpeg.ts'
import { A4_PT, CARD_BOX_PT, GAP_PT, buildPdf, layout } from '../../src/engine/pdf.ts'
import { CLEAN, latin1 } from './jpeg-fixture.ts'
import { check, checkAsync, type Rng } from './property.ts'

const EPS = 1e-6

describe('PDF layout, for any one or two image sizes', () => {
  it('fits each side in the card box, keeps its shape, centres it and keeps the sides apart', () => {
    check('layout', (r) => Array.from({ length: r.int(1, 2) }, () => ({ width: r.int(1, 10000), height: r.int(1, 10000) })), (sizes) => {
      const places = layout(sizes)
      expect(places).toHaveLength(sizes.length)
      places.forEach((p, i) => {
        const s = sizes[i]!
        // On the page and inside the 130% card box, touching it on at least one side.
        expect(p.x).toBeGreaterThanOrEqual(-EPS)
        expect(p.y).toBeGreaterThanOrEqual(-EPS)
        expect(p.x + p.w).toBeLessThanOrEqual(A4_PT.w + EPS)
        expect(p.y + p.h).toBeLessThanOrEqual(A4_PT.h + EPS)
        expect(p.w).toBeLessThanOrEqual(CARD_BOX_PT.w + EPS)
        expect(p.h).toBeLessThanOrEqual(CARD_BOX_PT.h + EPS)
        expect(Math.abs(p.w - CARD_BOX_PT.w) < EPS || Math.abs(p.h - CARD_BOX_PT.h) < EPS).toBe(true)
        // Same aspect ratio as the image: nothing is stretched or cropped.
        expect(Math.abs(p.w * s.height - p.h * s.width)).toBeLessThan(1e-6 * p.w * s.height)
        expect(p.x + p.w / 2).toBeCloseTo(A4_PT.w / 2, 6)
      })
      if (places.length === 2) {
        const [front, back] = places
        expect(front!.y - (back!.y + back!.h)).toBeCloseTo(GAP_PT, 6)
      }
      const top = places[0]!.y + places[0]!.h
      const bottom = places[places.length - 1]!.y
      expect(A4_PT.h - top).toBeCloseTo(bottom, 6)
    })
  })
})

/** The JPEG fixture split into its segments before the scan (SOI excluded), and the rest. */
function split (jpeg: Uint8Array): { head: Uint8Array[]; scan: Uint8Array } {
  const head: Uint8Array[] = []
  let i = 2
  while (jpeg[i] === 0xff && jpeg[i + 1] !== 0xda) {
    const len = (jpeg[i + 2]! << 8) | jpeg[i + 3]!
    head.push(jpeg.subarray(i, i + 2 + len))
    i += 2 + len
  }
  return { head, scan: jpeg.subarray(i) }
}

/** A segment a camera or editor could write: APP0–APP15 or a comment, holding a unique canary. */
function metadata (r: Rng, canary: string): Uint8Array {
  const marker = r.bool(0.8) ? 0xe0 + r.int(0, 15) : 0xfe
  const filler = Array.from({ length: r.int(0, 300) }, () => r.int(0, 255))
  const at = r.int(0, filler.length)
  const body = [...filler.slice(0, at), ...new TextEncoder().encode(canary), ...filler.slice(at)]
  const len = body.length + 2
  return new Uint8Array([0xff, marker, len >> 8, len & 0xff, ...body])
}

/** CLEAN with metadata segments inserted at random places before the scan, as real files have them. */
function dirty (r: Rng): { bytes: Uint8Array; canaries: string[] } {
  const { head, scan } = split(CLEAN)
  const parts = [...head]
  const canaries: string[] = []
  for (let n = r.int(0, 6); n > 0; n--) {
    const canary = `CANARY-${r.int(0, 2 ** 31).toString(36)}-${r.int(0, 2 ** 31).toString(36)}`
    canaries.push(canary)
    parts.splice(r.int(0, parts.length), 0, metadata(r, canary))
  }
  const bytes = new Uint8Array([0xff, 0xd8, ...parts.flatMap((p) => [...p]), ...scan])
  return { bytes, canaries }
}

describe('PDF file, for any metadata in the JPEGs', () => {
  const clean = stripJpeg(CLEAN).bytes

  it('stripJpeg returns the same clean image whatever metadata surrounds it', () => {
    check('stripJpeg', dirty, ({ bytes, canaries }) => {
      const out = stripJpeg(bytes).bytes
      expect(out).toEqual(clean)
      for (const c of canaries) expect(latin1(out)).not.toContain(c)
    })
  })

  it('holds one page with only the cleaned images, and no canary from any metadata', async () => {
    await checkAsync('buildPdf', (r) => Array.from({ length: r.int(1, 2) }, () => dirty(r)), async (sides) => {
      const pdf = latin1(await buildPdf(sides.map((s) => s.bytes)))
      for (const s of sides) for (const c of s.canaries) expect(pdf).not.toContain(c)
      expect(pdf.match(/\/Type \/Page\b(?!s)/g)).toHaveLength(1)
      expect(pdf.match(/\/Subtype \/Image/g)).toHaveLength(sides.length)
      // Each image stream is exactly the cleaned JPEG.
      const want = latin1(clean)
      expect(pdf.split(want).length - 1).toBe(sides.length)
    }, { runs: 40 })
  })
})
