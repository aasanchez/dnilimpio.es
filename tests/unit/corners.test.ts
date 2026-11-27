// SPDX-License-Identifier: AGPL-3.0-or-later
// Corner finding (src/detect/corners.ts) with a fake model, a fake edge detector and fake canvases:
// the order of detectors, the time limit on the model, the snapping step and the clean-up of the
// photo copies run in Node.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Detection } from '../../src/detect/result.ts'

const model = vi.hoisted(() => ({ detect: vi.fn(), load: vi.fn() }))
const edges = vi.hoisted(() => ({ detectCard: vi.fn(), toWorkGrey: vi.fn() }))
const refine = vi.hoisted(() => ({ refineQuad: vi.fn() }))

vi.mock('../../src/detect/model.ts', () => model)
vi.mock('../../src/detect/edges.ts', () => edges)
vi.mock('../../src/detect/refine.ts', () => refine)

const { MODEL_WAIT_MS, findCorners, modelSupported, prefetchCornerModel } = await import('../../src/detect/corners.ts')

/** A stand-in for OffscreenCanvas that keeps every pixel copy it gives out. */
class FakeCanvas {
  static made: FakeCanvas[] = []
  copies: Uint8ClampedArray[] = []
  constructor (public width: number, public height: number) { FakeCanvas.made.push(this) }
  getContext (): unknown {
    return {
      drawImage: () => undefined,
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4).fill(9)
        this.copies.push(data)
        return { width: w, height: h, data }
      },
    }
  }
}

const photo = (width = 4000, height = 3000): ImageBitmap => ({ width, height }) as unknown as ImageBitmap

type Q = Detection['quad']
const quad = (x0: number, y0: number, x1: number, y1: number): Q =>
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] as unknown as Q

const FROM_MODEL: Detection = { quad: quad(400, 300, 3600, 2700), score: 0.97, source: 'model' }
let greys: Array<{ v: Uint8Array }> = []

beforeEach(() => {
  FakeCanvas.made = []
  greys = []
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  model.detect.mockResolvedValue(null)
  model.load.mockResolvedValue({})
  edges.detectCard.mockReturnValue(null)
  edges.toWorkGrey.mockImplementation(() => {
    const g = { w: 10, h: 10, v: new Uint8Array(100).fill(5) }
    greys.push(g)
    return { grey: g }
  })
  // By default snapping finds nothing better: refineQuad returns the same quad.
  refine.refineQuad.mockImplementation((_g: unknown, q: Q) => q)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/** Every canvas is 0 × 0 and every copy of the pixels is zero. */
function expectCleared (): void {
  for (const c of FakeCanvas.made) {
    expect([c.width, c.height]).toEqual([0, 0])
    for (const d of c.copies) expect(d.every((v) => v === 0)).toBe(true)
  }
  for (const g of greys) expect(g.v.every((v) => v === 0)).toBe(true)
}

describe('modelSupported', () => {
  it('needs WebAssembly', () => {
    expect(modelSupported()).toBe(true)
    vi.stubGlobal('WebAssembly', undefined)
    expect(modelSupported()).toBe(false)
  })
})

describe('findCorners', () => {
  it('takes the model\'s answer first and does not run edge detection', async () => {
    model.detect.mockResolvedValue(FROM_MODEL)
    expect(await findCorners(photo(), 1.586)).toEqual(FROM_MODEL)
    expect(edges.detectCard).not.toHaveBeenCalled()
    expectCleared()
  })

  it('snaps the model\'s corners onto the card\'s edges, on a copy at most 1000 px long', async () => {
    model.detect.mockResolvedValue(FROM_MODEL)
    // refineQuad works on the 1000 × 750 copy (scale 0.25): it moves each corner by 10 px there.
    refine.refineQuad.mockImplementation((_g: unknown, q: Q) => q.map((p) => ({ x: p.x + 10, y: p.y + 10 })))
    const found = await findCorners(photo(), 1.586)
    expect(refine.refineQuad.mock.calls[0]?.[1]).toEqual(quad(100, 75, 900, 675))
    expect(found).toEqual({ ...FROM_MODEL, quad: quad(440, 340, 3640, 2740) })
    expect(FakeCanvas.made[0]).toBeDefined()
    expectCleared()
  })

  it('keeps the unsnapped corners when snapping fails, and still clears the copies', async () => {
    model.detect.mockResolvedValue(FROM_MODEL)
    refine.refineQuad.mockImplementation(() => { throw new Error('bug') })
    expect(await findCorners(photo(), 1.586)).toEqual(FROM_MODEL)
    expectCleared()
  })

  it('falls back to edge detection when the model finds nothing, and scales its corners to the photo', async () => {
    // Edge detection reads an 800 × 600 copy of the 4000 × 3000 photo (scale 0.2).
    edges.detectCard.mockReturnValue({ quad: quad(80, 60, 720, 540), confidence: 0.6 })
    const found = await findCorners(photo(), 1.586)
    expect(edges.detectCard.mock.calls[0]?.[0]).toMatchObject({ width: 800, height: 600 })
    expect(edges.detectCard.mock.calls[0]?.[1]).toEqual({ aspect: 1.586 })
    expect(found).toEqual({ quad: quad(400, 300, 3600, 2700), score: 0.6, source: 'edges' })
    expectCleared()
  })

  it('falls back to edge detection when the model fails to run', async () => {
    model.detect.mockRejectedValue(new Error('no WebAssembly memory'))
    edges.detectCard.mockReturnValue({ quad: quad(80, 60, 720, 540), confidence: 0.6 })
    expect((await findCorners(photo(), 1.586))?.source).toBe('edges')
  })

  it('does not wait for a model that takes longer than the time limit', async () => {
    vi.useFakeTimers()
    model.detect.mockReturnValue(new Promise(() => undefined)) // never answers
    edges.detectCard.mockReturnValue({ quad: quad(80, 60, 720, 540), confidence: 0.6 })
    const pending = findCorners(photo(), 1.586)
    await vi.advanceTimersByTimeAsync(MODEL_WAIT_MS - 1)
    expect(edges.detectCard).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect((await pending)?.source).toBe('edges')
  })

  it('skips the model when the browser has no WebAssembly', async () => {
    vi.stubGlobal('WebAssembly', undefined)
    edges.detectCard.mockReturnValue({ quad: quad(80, 60, 720, 540), confidence: 0.6 })
    expect((await findCorners(photo(), 1.586))?.source).toBe('edges')
    expect(model.detect).not.toHaveBeenCalled()
  })

  it('returns null, never throws, when no detector finds the card', async () => {
    expect(await findCorners(photo(), 1.586)).toBeNull()
    edges.detectCard.mockImplementation(() => { throw new Error('bug') })
    expect(await findCorners(photo(), 1.586)).toBeNull()
    expectCleared()
  })

  it('does not scale up a small photo', async () => {
    edges.detectCard.mockReturnValue({ quad: quad(10, 10, 300, 200), confidence: 0.6 })
    const found = await findCorners(photo(320, 240), 1.586)
    expect(edges.detectCard.mock.calls[0]?.[0]).toMatchObject({ width: 320, height: 240 })
    expect(found?.quad).toEqual(quad(10, 10, 300, 200))
  })
})

describe('prefetchCornerModel', () => {
  it('starts loading the model, and a failed load stays silent', async () => {
    model.load.mockRejectedValueOnce(new Error('offline'))
    prefetchCornerModel()
    await vi.waitFor(() => { expect(model.load).toHaveBeenCalledTimes(1) })
  })

  it('does nothing without WebAssembly', async () => {
    vi.stubGlobal('WebAssembly', undefined)
    prefetchCornerModel()
    await Promise.resolve()
    expect(model.load).not.toHaveBeenCalled()
  })
})
