// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { expandRect, findUnmaskedPixel, flattenAlpha, maskPixels, sanitise, sealMasks, toGreyscale, type MaskSurface, type RGBA } from '../../src/engine/raster.ts'
import { fillRects, type PxRect } from '../../src/redact/zones.ts'

function image (w: number, h: number, rgba: [number, number, number, number]): RGBA {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let o = 0; o < data.length; o += 4) data.set(rgba, o)
  return { width: w, height: h, data }
}

function px (img: RGBA, x: number, y: number): number[] {
  const o = (y * img.width + x) * 4
  return [...img.data.subarray(o, o + 4)]
}

describe('expandRect / maskPixels', () => {
  it('grows outwards and clamps to the image', () => {
    expect(expandRect({ x: 1, y: 1, w: 2, h: 2 }, 2, 10, 10)).toEqual({ x: 0, y: 0, w: 5, h: 5 })
    expect(expandRect({ x: 8, y: 8, w: 2, h: 2 }, 2, 10, 10)).toEqual({ x: 6, y: 6, w: 4, h: 4 })
  })
  it('never covers less than the normalised rectangle, even at fractional edges', () => {
    const [r] = maskPixels([{ x: 0.333, y: 0.251, w: 0.1, h: 0.1 }], 1712, 1080, 0)
    expect(r!.x).toBeLessThanOrEqual(0.333 * 1712)
    expect(r!.x + r!.w).toBeGreaterThanOrEqual(0.433 * 1712)
    expect(r!.y).toBeLessThanOrEqual(0.251 * 1080)
    expect(r!.y + r!.h).toBeGreaterThanOrEqual(0.351 * 1080)
  })
  it('drops empty rectangles', () => {
    expect(maskPixels([{ x: 0.5, y: 0.5, w: 0, h: 0 }], 100, 100, 0)).toEqual([])
  })
})

describe('toGreyscale', () => {
  it('uses BT.601 luma and keeps alpha', () => {
    const img = image(1, 1, [255, 0, 0, 200])
    toGreyscale(img)
    expect(px(img, 0, 0)).toEqual([76, 76, 76, 200])
  })
})

describe('flattenAlpha', () => {
  it('composites onto white and makes every pixel opaque', () => {
    const img = image(2, 1, [0, 0, 0, 0])
    img.data.set([0, 0, 0, 128], 4)
    flattenAlpha(img)
    expect(px(img, 0, 0)).toEqual([255, 255, 255, 255])
    expect(px(img, 1, 0)).toEqual([127, 127, 127, 255])
  })
})

describe('sanitise', () => {
  const src = (): RGBA => image(100, 50, [10, 200, 30, 255])

  it('replaces every pixel of every expanded mask with opaque black', () => {
    const out = sanitise(src(), { masks: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }], greyscale: false, margin: 2 })
    // Mask 10..40 × 10..30, expanded by 2 → 8..42 × 8..32.
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 100; x++) {
        const inside = x >= 8 && x < 42 && y >= 8 && y < 32
        expect(px(out, x, y)).toEqual(inside ? [0, 0, 0, 255] : [10, 200, 30, 255])
      }
    }
  })

  it('does not modify the input, so the editor can still restore colour and un-hide fields', () => {
    const input = src()
    const before = new Uint8ClampedArray(input.data)
    sanitise(input, { masks: [{ x: 0, y: 0, w: 1, h: 1 }], greyscale: true })
    expect(input.data).toEqual(before)
  })

  it('applies greyscale before the masks, so masks stay pure black', () => {
    const out = sanitise(src(), { masks: [{ x: 0, y: 0, w: 0.5, h: 1 }], greyscale: true, margin: 0 })
    expect(px(out, 10, 10)).toEqual([0, 0, 0, 255])
    const [r, g, b] = px(out, 90, 10)
    expect(r).toBe(g)
    expect(g).toBe(b)
  })

  it('leaves no transparent pixel anywhere', () => {
    const out = sanitise(image(4, 4, [50, 50, 50, 0]), { masks: [], greyscale: false })
    for (let o = 3; o < out.data.length; o += 4) expect(out.data[o]).toBe(255)
  })

  it('reports surviving pixels through findUnmaskedPixel', () => {
    const img = image(4, 4, [0, 0, 0, 255])
    expect(findUnmaskedPixel(img, [{ x: 0, y: 0, w: 4, h: 4 }])).toBe(-1)
    img.data.set([1, 0, 0, 255], (2 * 4 + 3) * 4)
    expect(findUnmaskedPixel(img, [{ x: 0, y: 0, w: 4, h: 4 }])).toBe(2 * 4 + 3)
  })
})

/** A canvas stand-in backed by an RGBA buffer. `fill` can be broken to test the check. */
function bufferSurface (img: RGBA, fill: (r: PxRect) => void = (r) => { fillRects(img.data, img.width, img.height, [r]) }): MaskSurface {
  return {
    fillBlack: fill,
    read: (r) => {
      const data = new Uint8ClampedArray(r.w * r.h * 4)
      for (let y = 0; y < r.h; y++) {
        const o = ((r.y + y) * img.width + r.x) * 4
        data.set(img.data.subarray(o, o + r.w * 4), y * r.w * 4)
      }
      return { width: r.w, height: r.h, data }
    }
  }
}

describe('sealMasks', () => {
  // A sanitised raster, then a "watermark": a grey, half-transparent-looking stripe across the whole
  // image, masks included, as drawWatermark() does with its light halo.
  function watermarked (): { img: RGBA; rects: PxRect[] } {
    const img = sanitise(image(100, 50, [10, 200, 30, 255]), { masks: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }], greyscale: false, margin: 2 })
    for (let x = 0; x < 100; x++) for (let y = 18; y < 22; y++) img.data.set([60, 60, 60, 255], (y * 100 + x) * 4)
    return { img, rects: maskPixels([{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }], 100, 50, 2) }
  }

  it('makes every masked pixel opaque black again after the watermark, and leaves the rest alone', () => {
    const { img, rects } = watermarked()
    expect(findUnmaskedPixel(img, rects)).not.toBe(-1)
    sealMasks(bufferSurface(img), rects)
    expect(findUnmaskedPixel(img, rects)).toBe(-1)
    // Outside the mask the watermark stays.
    expect(px(img, 60, 20)).toEqual([60, 60, 60, 255])
    expect(px(img, 60, 40)).toEqual([10, 200, 30, 255])
  })

  it('throws when a masked pixel of the final raster is not opaque black', () => {
    const { img, rects } = watermarked()
    expect(() => { sealMasks(bufferSurface(img, () => {}), rects) }).toThrow(/Redaction check failed/)
  })

  it('accepts no masks', () => {
    const { img } = watermarked()
    expect(() => { sealMasks(bufferSurface(img), []) }).not.toThrow()
  })
})
