// SPDX-License-Identifier: AGPL-3.0-or-later
// Property-based tests for redaction: manual box maths, zones to pixels, the secure raster, the
// mask seal after the watermark, and the whole path from the field choices to the final pixels.
// Inputs come from the seeded generator in property.ts; a failure prints the seed that repeats it.
import { describe, expect, it } from 'vitest'
import { HANDLES, MIN_SIZE, fromPoints, grow, handlePoint, hitTest, isUsable, move, resize, type Point } from '../../src/engine/masks.ts'
import { masksFor, placeZones, sideRects, zoneKey } from '../../src/engine/fields.ts'
import { MASK_MARGIN_PX, findUnmaskedPixel, maskPixels, sanitise, sealMasks, type MaskSurface, type RGBA } from '../../src/engine/raster.ts'
import { layoutWatermark, tileWatermark } from '../../src/engine/watermark.ts'
import { activeRects, fillRects, toPixels, type PxRect } from '../../src/redact/zones.ts'
import { DOCUMENTS } from '../../src/zones/documents.ts'
import type { Rect, Side, ZoneId } from '../../src/zones/types.ts'
import { check, type Rng } from './property.ts'

const EPS = 1e-6
const SIDES: readonly Side[] = ['front', 'back']

// ---------- Generators ----------

/** A coordinate on the card, biased towards the cases that break rounding: edges and float noise. */
function coord (r: Rng): number {
  switch (r.int(0, 5)) {
    case 0: return r.pick([0, 1, 0.1 + 0.2, 0.7 + 0.1, 1 / 3, 2 / 3])
    case 1: return r.int(0, 40) / 40 // on a pixel edge for many image sizes
    default: return r.next()
  }
}

/** A normalised rectangle on the card. Some are thinner than one pixel; some reach the edges. */
function normRect (r: Rng): Rect {
  const x = coord(r)
  const y = coord(r)
  const thin = r.bool(0.15)
  const w = Math.min(1 - x, thin ? r.float(0, 0.02) : coord(r) * (1 - x))
  const h = Math.min(1 - y, thin ? r.float(0, 0.02) : coord(r) * (1 - y))
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) }
}

function point (r: Rng, spill = 0): Point {
  return { x: r.float(-spill, 1 + spill), y: r.float(-spill, 1 + spill) }
}

/** A usable box inside the card, like the editor keeps. */
function usableBox (r: Rng): Rect {
  const w = r.float(MIN_SIZE, 1)
  const h = r.float(MIN_SIZE, 1)
  return { x: r.float(0, 1 - w), y: r.float(0, 1 - h), w, h }
}

/** A photo with random colours and random transparency, so flattening and greyscale are exercised. */
function photo (r: Rng, width: number, height: number): RGBA {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i++) data[i] = r.int(0, 255)
  // Make many pixels opaque, as a camera photo is, and a few fully transparent.
  for (let o = 3; o < data.length; o += 4) data[o] = r.bool(0.7) ? 255 : r.bool(0.1) ? 0 : data[o]!
  return { width, height, data }
}

function size (r: Rng): { width: number; height: number } {
  return { width: r.int(1, 48), height: r.int(1, 32) }
}

// ---------- Oracles, written without the code under test ----------

const inside = (p: Point, b: Rect): boolean => p.x >= b.x - EPS && p.y >= b.y - EPS && p.x <= b.x + b.w + EPS && p.y <= b.y + b.h + EPS
const onCard = (b: Rect): boolean => b.x >= -EPS && b.y >= -EPS && b.x + b.w <= 1 + EPS && b.y + b.h <= 1 + EPS && b.w >= 0 && b.h >= 0

/**
 * True when pixel (x, y) overlaps the normalised rectangle by more than a sliver, after growing the
 * rectangle by `margin` pixels. Such a pixel shows part of the field, so it must be black.
 */
function mustBeBlack (x: number, y: number, m: Rect, width: number, height: number, margin: number): boolean {
  const SLIVER = 1e-6
  const x0 = m.x * width - margin
  const x1 = (m.x + m.w) * width + margin
  const y0 = m.y * height - margin
  const y1 = (m.y + m.h) * height + margin
  if (m.w <= 0 || m.h <= 0) return false
  return Math.min(x + 1, x1) - Math.max(x, x0) > SLIVER && Math.min(y + 1, y1) - Math.max(y, y0) > SLIVER
}

function pixel (img: RGBA, x: number, y: number): number[] {
  const o = (y * img.width + x) * 4
  return [img.data[o]!, img.data[o + 1]!, img.data[o + 2]!, img.data[o + 3]!]
}

const isBlack = (p: readonly number[]): boolean => p[0] === 0 && p[1] === 0 && p[2] === 0 && p[3] === 255

/** Stores a number the way a Uint8ClampedArray does: clamped, rounded half to even. */
function u8 (v: number): number {
  const c = Math.min(255, Math.max(0, v))
  const f = Math.floor(c)
  const d = c - f
  if (d > 0.5) return f + 1
  if (d < 0.5) return f
  return f % 2 === 0 ? f : f + 1
}

/** The colour sanitise() should keep for an unmasked pixel: flattened onto white, then optional BT.601 luma. */
function expectedColour (src: readonly number[], greyscale: boolean): number[] {
  const a = src[3]!
  let rgb = a === 255 ? src.slice(0, 3) : src.slice(0, 3).map((c) => u8((c * a + 255 * (255 - a) + 127) / 255))
  if (greyscale) {
    const yv = u8((299 * rgb[0]! + 587 * rgb[1]! + 114 * rgb[2]!) / 1000)
    rgb = [yv, yv, yv]
  }
  return [...rgb, 255]
}

const insidePx = (x: number, y: number, rects: readonly PxRect[]): boolean => rects.some((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h)

/** A canvas stand-in backed by an RGBA buffer, as in raster.test.ts. */
function bufferSurface (img: RGBA, fill: (q: PxRect) => void = (q) => { fillRects(img.data, img.width, img.height, [q]) }): MaskSurface {
  return {
    fillBlack: fill,
    read: (q) => {
      const data = new Uint8ClampedArray(q.w * q.h * 4)
      for (let y = 0; y < q.h; y++) {
        const o = ((q.y + y) * img.width + q.x) * 4
        data.set(img.data.subarray(o, o + q.w * 4), y * q.w * 4)
      }
      return { width: q.w, height: q.h, data }
    },
  }
}

/**
 * Draws a stand-in for the watermark over the whole image, masks included: one blended block per
 * tile of the real tiled layout, with a light halo colour or dark ink, as drawWatermark() does.
 */
function paintWatermark (img: RGBA, r: Rng, text: string, scale: number): void {
  const layout = layoutWatermark(text, img.width, img.height, (s) => s.length * 0.6, scale)
  if (!layout) return
  const half = Math.max(1, Math.ceil(layout.size / 2))
  for (const t of tileWatermark(layout, img.width, img.height)) {
    const ink = r.bool() ? [255, 255, 255] : [20, 20, 20]
    const alpha = r.pick([0.05, 0.16, 0.5, 1])
    for (let y = Math.max(0, Math.floor(t.y) - half); y < Math.min(img.height, Math.floor(t.y) + half); y++) {
      for (let x = Math.max(0, Math.floor(t.x) - half * 3); x < Math.min(img.width, Math.floor(t.x) + half * 3); x++) {
        const o = (y * img.width + x) * 4
        for (let c = 0; c < 3; c++) img.data[o + c] = img.data[o + c]! * (1 - alpha) + ink[c]! * alpha
      }
    }
  }
}

// ---------- Manual boxes (src/engine/masks.ts) ----------

describe('manual boxes, for any input', () => {
  it('fromPoints spans both points, clamped to the card', () => {
    check('fromPoints', (r) => ({ a: point(r, 0.5), b: point(r, 0.5) }), ({ a, b }) => {
      const box = fromPoints(a, b)
      expect(onCard(box)).toBe(true)
      const clamp = (p: Point): Point => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })
      expect(inside(clamp(a), box)).toBe(true)
      expect(inside(clamp(b), box)).toBe(true)
      expect(fromPoints(b, a)).toEqual(box)
    })
  })

  it('move keeps the size and keeps the box on the card', () => {
    check('move', (r) => ({ box: usableBox(r), dx: r.float(-2, 2), dy: r.float(-2, 2) }), ({ box, dx, dy }) => {
      const moved = move(box, dx, dy)
      expect(moved.w).toBe(box.w)
      expect(moved.h).toBe(box.h)
      expect(onCard(moved)).toBe(true)
    })
  })

  it('resize keeps a usable box on the card, with the opposite corner fixed', () => {
    const opposite = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' } as const
    check('resize', (r) => ({ box: usableBox(r), handle: r.pick(HANDLES), to: point(r, 0.5) }), ({ box, handle, to }) => {
      const next = resize(box, handle, to)
      expect(onCard(next)).toBe(true)
      expect(isUsable(next)).toBe(true)
      if (next !== box) {
        const fixed = handlePoint(box, opposite[handle])
        const corners = HANDLES.map((h) => handlePoint(next, h))
        expect(corners.some((c) => Math.abs(c.x - fixed.x) < EPS && Math.abs(c.y - fixed.y) < EPS)).toBe(true)
      }
    })
  })

  it('grow never makes a box smaller than the minimum or larger than the card', () => {
    check('grow', (r) => ({ box: usableBox(r), dw: r.float(-1.5, 1.5), dh: r.float(-1.5, 1.5) }), ({ box, dw, dh }) => {
      const next = grow(box, dw, dh)
      expect(onCard(next)).toBe(true)
      expect(next.w).toBeGreaterThanOrEqual(Math.min(MIN_SIZE, 1 - box.x) - EPS)
      expect(next.h).toBeGreaterThanOrEqual(Math.min(MIN_SIZE, 1 - box.y) - EPS)
      expect(next.x).toBe(box.x)
      expect(next.y).toBe(box.y)
    })
  })

  it('hitTest picks the topmost box under the point, and only a box under it', () => {
    check('hitTest', (r) => ({
      boxes: Array.from({ length: r.int(0, 6) }, () => usableBox(r)),
      p: point(r, 0.1),
    }), ({ boxes, p }) => {
      const hit = hitTest(boxes, null, p, 0.01)
      const under = boxes.map((b, i) => (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h ? i : -1)).filter((i) => i >= 0)
      if (under.length === 0) expect(hit).toBeNull()
      else expect(hit).toEqual({ index: Math.max(...under), handle: null })
    })
  })
})

// ---------- Zones to pixels (src/redact/zones.ts) ----------

describe('zones to pixels, for any rectangle and image size', () => {
  it('toPixels covers the whole rectangle, stays in the image and adds less than one pixel per edge', () => {
    check('toPixels', (r) => ({ rect: normRect(r), ...size(r) }), ({ rect, width, height }) => {
      const q = toPixels(rect, width, height)
      expect(q.x).toBeGreaterThanOrEqual(0)
      expect(q.y).toBeGreaterThanOrEqual(0)
      expect(q.x + q.w).toBeLessThanOrEqual(width)
      expect(q.y + q.h).toBeLessThanOrEqual(height)
      if (rect.w > EPS && rect.h > EPS) {
        expect(q.x).toBeLessThanOrEqual(rect.x * width + EPS)
        expect(q.y).toBeLessThanOrEqual(rect.y * height + EPS)
        expect(q.x + q.w).toBeGreaterThanOrEqual(Math.min(width, (rect.x + rect.w) * width) - EPS)
        expect(q.y + q.h).toBeGreaterThanOrEqual(Math.min(height, (rect.y + rect.h) * height) - EPS)
        expect(rect.x * width - q.x).toBeLessThan(1)
        expect(q.x + q.w - (rect.x + rect.w) * width).toBeLessThan(1)
      }
    })
  })

  it('toPixels keeps containment: a rectangle inside another never covers a pixel the other does not', () => {
    check('toPixels monotonic', (r) => {
      const outer = normRect(r)
      const x = outer.x + r.next() * outer.w
      const y = outer.y + r.next() * outer.h
      const inner = { x, y, w: r.next() * (outer.x + outer.w - x), h: r.next() * (outer.y + outer.h - y) }
      return { outer, inner, ...size(r) }
    }, ({ outer, inner, width, height }) => {
      const a = toPixels(inner, width, height)
      const b = toPixels(outer, width, height)
      if (a.w === 0 || a.h === 0) return
      expect(a.x).toBeGreaterThanOrEqual(b.x)
      expect(a.y).toBeGreaterThanOrEqual(b.y)
      expect(a.x + a.w).toBeLessThanOrEqual(b.x + b.w)
      expect(a.y + a.h).toBeLessThanOrEqual(b.y + b.h)
    })
  })

  it('fillRects paints exactly the listed pixels opaque black and leaves the rest as it was', () => {
    check('fillRects', (r) => {
      const { width, height } = size(r)
      const rects = Array.from({ length: r.int(0, 4) }, () => toPixels(normRect(r), width, height))
      return { img: photo(r, width, height), rects }
    }, ({ img, rects }) => {
      const before = new Uint8ClampedArray(img.data)
      fillRects(img.data, img.width, img.height, rects)
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const o = (y * img.width + x) * 4
          if (insidePx(x, y, rects)) expect(isBlack(pixel(img, x, y))).toBe(true)
          else expect([...img.data.subarray(o, o + 4)]).toEqual([...before.subarray(o, o + 4)])
        }
      }
    })
  })

  it('activeRects hides every mandatory and hidden zone, and a visible zone only when turned on', () => {
    check('activeRects', (r) => {
      const doc = r.pick(DOCUMENTS)
      const ids = [...new Set(doc.zones.map((z) => z.id))]
      return { doc, side: r.pick(SIDES), on: new Set<ZoneId>(r.subset(ids)) }
    }, ({ doc, side, on }) => {
      const got = activeRects(doc, side, on)
      const want = doc.zones.filter((z) => z.side === side && (z.default !== 'visible' || on.has(z.id))).flatMap((z) => z.rects)
      expect(got).toEqual(want)
      // Every rectangle returned belongs to this side, and a mandatory field (the CAN) is always in.
      for (const q of got) expect(doc.zones.some((z) => z.side === side && z.rects.includes(q))).toBe(true)
      for (const z of doc.zones) if (z.side === side && z.default === 'mandatory') for (const q of z.rects) expect(got).toContain(q)
    })
  })
})

// ---------- Secure raster (src/engine/raster.ts) ----------

describe('secure raster, for any photo and any masks', () => {
  const gen = (r: Rng): { src: RGBA; masks: Rect[]; greyscale: boolean; margin: number } => {
    const { width, height } = size(r)
    return {
      src: photo(r, width, height),
      masks: Array.from({ length: r.int(0, 5) }, () => normRect(r)),
      greyscale: r.bool(),
      margin: r.pick([0, 1, MASK_MARGIN_PX, r.int(0, 6)]),
    }
  }

  it('makes every pixel a mask touches, plus its margin, opaque black', () => {
    check('sanitise covers', gen, ({ src, masks, greyscale, margin }) => {
      const out = sanitise(src, { masks, greyscale, margin })
      for (let y = 0; y < out.height; y++) {
        for (let x = 0; x < out.width; x++) {
          if (masks.some((m) => mustBeBlack(x, y, m, out.width, out.height, margin))) {
            expect(pixel(out, x, y), `pixel ${String(x)},${String(y)}`).toEqual([0, 0, 0, 255])
          }
        }
      }
    })
  })

  it('leaves every pixel outside the expanded masks as the flattened (and optionally grey) photo', () => {
    check('sanitise keeps the rest', gen, ({ src, masks, greyscale, margin }) => {
      const out = sanitise(src, { masks, greyscale, margin })
      const rects = maskPixels(masks, out.width, out.height, margin)
      for (let y = 0; y < out.height; y++) {
        for (let x = 0; x < out.width; x++) {
          const p = pixel(out, x, y)
          expect(p[3]).toBe(255)
          if (!insidePx(x, y, rects)) expect(p, `pixel ${String(x)},${String(y)}`).toEqual(expectedColour(pixel(src, x, y), greyscale))
        }
      }
    })
  })

  it('never changes its input', () => {
    check('sanitise is pure', gen, ({ src, masks, greyscale, margin }) => {
      const before = new Uint8ClampedArray(src.data)
      sanitise(src, { masks, greyscale, margin })
      expect(src.data).toEqual(before)
    })
  })
})

// ---------- Seal after the watermark (sealMasks) ----------

describe('masks after the watermark, for any image, masks and watermark', () => {
  const gen = (r: Rng): { img: RGBA; masks: Rect[]; text: string; scale: number } => {
    const { width, height } = size(r)
    const masks = Array.from({ length: r.int(1, 5) }, () => normRect(r))
    const img = sanitise(photo(r, width, height), { masks, greyscale: r.bool() })
    const text = r.pick(['', 'Copia para el banco', 'COPY ONLY 2026-11-27', 'نسخة', 'x'.repeat(r.int(1, 130))])
    return { img, masks, text, scale: r.float(0.5, 3) }
  }

  it('exports every masked pixel as opaque black, and touches no other pixel', () => {
    check('sealMasks', gen, ({ img, masks, text, scale }, r) => {
      paintWatermark(img, r, text, scale)
      const rects = maskPixels(masks, img.width, img.height)
      const watermarked = new Uint8ClampedArray(img.data)
      sealMasks(bufferSurface(img), rects)
      expect(findUnmaskedPixel(img, rects)).toBe(-1)
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const o = (y * img.width + x) * 4
          if (masks.some((m) => mustBeBlack(x, y, m, img.width, img.height, MASK_MARGIN_PX))) expect(isBlack(pixel(img, x, y))).toBe(true)
          else if (!insidePx(x, y, rects)) expect([...img.data.subarray(o, o + 4)]).toEqual([...watermarked.subarray(o, o + 4)])
        }
      }
    })
  })

  it('throws when the canvas leaves any masked pixel not opaque black', () => {
    check('sealMasks detects a leak', (r) => {
      const g = gen(r)
      const rects = maskPixels(g.masks, g.img.width, g.img.height).filter((q) => q.w > 0 && q.h > 0)
      return { ...g, rects }
    }, ({ img, rects }, r) => {
      if (rects.length === 0) return
      // A broken canvas: one fill does nothing, or a pixel turns grey or slightly transparent after the fills.
      const victim = r.pick(rects)
      const lx = victim.x + r.int(0, victim.w - 1)
      const ly = victim.y + r.int(0, victim.h - 1)
      const leak = r.pick<[number, number, number, number]>([[1, 0, 0, 255], [0, 0, 1, 255], [0, 0, 0, 254], [128, 128, 128, 255]])
      const at = (ly * img.width + lx) * 4
      const fill = (q: PxRect): void => { fillRects(img.data, img.width, img.height, [q]) }
      if (r.bool()) {
        // The fill of one mask is lost. Another mask over the same pixel would still hide it.
        img.data.set(leak, at)
        const surface = bufferSurface(img, (q) => { if (q !== victim) fill(q) })
        const coveredElsewhere = rects.some((q) => q !== victim && insidePx(lx, ly, [q]))
        if (coveredElsewhere) expect(() => { sealMasks(surface, rects) }).not.toThrow()
        else expect(() => { sealMasks(surface, rects) }).toThrow(/Redaction check failed/)
      } else {
        const surface = bufferSurface(img, fill)
        const read = surface.read
        const broken: MaskSurface = { fillBlack: surface.fillBlack, read: (q) => { img.data.set(leak, at); return read(q) } }
        expect(() => { sealMasks(broken, rects) }).toThrow(/Redaction check failed/)
      }
    })
  })
})

// ---------- From field choices to pixels ----------

describe('every hidden field, on every document, side and placement, exports black', () => {
  it('masksFor + placeZones + sanitise + sealMasks blacken every pixel of every hidden field', () => {
    check('hidden fields are black', (r) => {
      const doc = r.pick(DOCUMENTS)
      const side = r.pick(SIDES)
      const ids = [...new Set(doc.zones.map((z) => z.id))]
      const hidden = new Set<ZoneId>(r.subset(ids, 0.6))
      // The user may move or resize any template box.
      const placement: Record<string, Rect> = {}
      for (const { key } of sideRects(doc, side)) if (r.bool(0.3)) placement[key] = usableBox(r)
      const width = r.int(8, 64)
      const height = Math.max(1, Math.round(width * doc.size.h / doc.size.w))
      return { doc, side, hidden, placement, width, height }
    }, ({ doc, side, hidden, placement, width, height }, r) => {
      const placed = placeZones(doc, placement)
      const masks = masksFor(placed, side, hidden)
      const img = sanitise(photo(r, width, height), { masks, greyscale: r.bool() })
      paintWatermark(img, r, 'Solo para verificación', r.float(0.5, 3))
      sealMasks(bufferSurface(img), maskPixels(masks, width, height))
      placed.zones.forEach((z, zi) => {
        if (z.side !== side || !hidden.has(z.id)) return
        z.rects.forEach((q, ri) => {
          // The placed box wins over the template box.
          expect(q).toBe(placement[zoneKey(zi, ri)] ?? doc.zones[zi]!.rects[ri])
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              if (mustBeBlack(x, y, q, width, height, MASK_MARGIN_PX)) expect(isBlack(pixel(img, x, y)), `${z.id} pixel ${String(x)},${String(y)}`).toBe(true)
            }
          }
        })
      })
    }, { runs: 150 })
  })
})
