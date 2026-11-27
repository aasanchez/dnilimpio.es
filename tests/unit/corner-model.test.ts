// SPDX-License-Identifier: AGPL-3.0-or-later
// The corner model's wrapper (src/detect/model.ts) with a fake ONNX runtime whose session returns
// fixed outputs: runtime settings, the model's input, the two passes, and the release of every
// buffer that held photo pixels. The real model is checked by the e2e tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeTensor { type: string; data: Float32Array; dims: number[]; disposed: boolean; dispose: () => void }

const ort = vi.hoisted(() => {
  class Tensor {
    disposed = false
    constructor (public type: string, public data: Float32Array, public dims: number[]) {}
    dispose (): void { this.disposed = true }
  }
  return {
    env: { logLevel: '', wasm: {} },
    Tensor,
    InferenceSession: { create: vi.fn() },
  }
})

vi.mock('onnxruntime-web/wasm', () => ort)
vi.mock('scanic-ml/dist/ort-wasm-simd-threaded.mjs?url', () => ({ default: './assets/ml/ort.mjs' }))
vi.mock('scanic-ml/dist/ort-wasm-simd-threaded.wasm?base64', () => ({ default: 'AGFzbQ==' })) // "\0asm"
vi.mock('scanic-ml/dist/doccornernet_lean.ort?base64', () => ({ default: 'T1JU' })) // "ORT"

/** A card in the middle of the input, then a "document present" logit. */
const CARD = [0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75]

/** Output tensors as the runtime returns them: the eight corners and the logit. */
function outputs (coords: number[] | null, logit: number): Record<string, FakeTensor> {
  const out: Record<string, FakeTensor> = { score: new ort.Tensor('float32', new Float32Array([logit]), [1, 1]) }
  if (coords) out.coords = new ort.Tensor('float32', new Float32Array(coords), [1, 8])
  return out
}

/** A fake session that answers each run with the next of `answers`, keeping what it was given. */
function session (...answers: Array<Record<string, FakeTensor> | Error>): { inputNames: string[]; run: ReturnType<typeof vi.fn>; fed: FakeTensor[]; inputs: FakeTensor[]; outputs: FakeTensor[] } {
  const s = {
    inputNames: ['image'],
    fed: [] as FakeTensor[],
    inputs: [] as FakeTensor[],
    outputs: [] as FakeTensor[],
    run: vi.fn((feeds: Record<string, FakeTensor>) => {
      const t = feeds.image
      if (!t) return Promise.reject(new Error('wrong input name'))
      s.fed.push(t)
      // Copy the input: the module clears it as soon as the run settles.
      s.inputs.push({ ...t, data: t.data.slice() })
      const a = answers.shift() ?? outputs(null, -10)
      if (a instanceof Error) return Promise.reject(a)
      s.outputs.push(...Object.values(a))
      return Promise.resolve(a)
    }),
  }
  return s
}

/** A stand-in for OffscreenCanvas: every pixel is `rgb`; records the source rectangle drawn. */
class FakeCanvas {
  static made: FakeCanvas[] = []
  static rgb: [number, number, number] = [255, 0, 128]
  copies: Uint8ClampedArray[] = []
  drawn: number[] = []
  constructor (public width: number, public height: number) { FakeCanvas.made.push(this) }
  getContext (): unknown {
    return {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      drawImage: (_src: unknown, ...r: number[]) => { this.drawn = r },
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4)
        for (let i = 0; i < data.length; i += 4) data.set([...FakeCanvas.rgb, 255], i)
        this.copies.push(data)
        return { width: w, height: h, data }
      },
    }
  }
}

const photo = { width: 2000, height: 1000 } as unknown as ImageBitmap

let mod: typeof import('../../src/detect/model.ts')

beforeEach(async () => {
  FakeCanvas.made = []
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  vi.resetModules()
  mod = await import('../../src/detect/model.ts')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('load', () => {
  it('starts the runtime with one thread, no proxy worker and the bundled files, once per page', async () => {
    const s = session()
    ort.InferenceSession.create.mockResolvedValue(s)
    expect(await mod.load()).toBe(s)
    expect(await mod.load()).toBe(s)
    expect(ort.InferenceSession.create).toHaveBeenCalledTimes(1)
    expect(ort.env.wasm as Record<string, unknown>).toMatchObject({ numThreads: 1, proxy: false })
    expect(Array.from((ort.env.wasm as { wasmBinary?: Uint8Array }).wasmBinary ?? [])).toEqual([0, 97, 115, 109])
    const [modelBytes, options] = ort.InferenceSession.create.mock.calls[0] as [Uint8Array, unknown]
    expect(new TextDecoder().decode(modelBytes)).toBe('ORT')
    expect(options).toEqual({ executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
  })

  it('tries again on the next call after a failure', async () => {
    ort.InferenceSession.create.mockRejectedValueOnce(new Error('no memory')).mockResolvedValueOnce(session())
    await expect(mod.load()).rejects.toThrow('no memory')
    await expect(mod.load()).resolves.toBeDefined()
    expect(ort.InferenceSession.create).toHaveBeenCalledTimes(2)
  })
})

describe('detect', () => {
  it('gives the model the photo as 224 × 224 RGB, ImageNet-normalised', async () => {
    const s = session(outputs(null, -10))
    ort.InferenceSession.create.mockResolvedValue(s)
    await mod.detect(photo)
    const [t] = s.inputs
    expect(t?.dims).toEqual([1, 224, 224, 3])
    expect(t?.data.length).toBe(224 * 224 * 3)
    // Pixel (255, 0, 128): each channel is (v / 255 - mean) / std.
    expect(t?.data[0]).toBeCloseTo((1 - 0.485) / 0.229, 5)
    expect(t?.data[1]).toBeCloseTo((0 - 0.456) / 0.224, 5)
    expect(t?.data[2]).toBeCloseTo((128 / 255 - 0.406) / 0.225, 5)
    expect(FakeCanvas.made[0]?.drawn).toEqual([0, 0, 2000, 1000, 0, 0, 224, 224])
  })

  it('returns null after one pass when the model is not confident', async () => {
    const s = session(outputs(CARD, -3))
    ort.InferenceSession.create.mockResolvedValue(s)
    expect(await mod.detect(photo)).toBeNull()
    expect(s.run).toHaveBeenCalledTimes(1)
  })

  it('looks again, closer, around what the first pass found, and maps the corners back to the photo', async () => {
    // First pass: card at 500–1500 × 250–750. The second look is that box plus 15 % on each side.
    const s = session(outputs(CARD, 4), outputs([0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9], 4))
    ort.InferenceSession.create.mockResolvedValue(s)
    const found = await mod.detect(photo)
    expect(s.run).toHaveBeenCalledTimes(2)
    expect(FakeCanvas.made[1]?.drawn).toEqual([350, 175, 1300, 650, 0, 0, 224, 224])
    expect(found?.source).toBe('model')
    // The outputs are 32-bit floats: 0.1 is not exact.
    const want = [[480, 240], [1520, 240], [1520, 760], [480, 760]]
    found?.quad.forEach((p, i) => {
      expect(p.x).toBeCloseTo(want[i]?.[0] ?? Number.NaN, 3)
      expect(p.y).toBeCloseTo(want[i]?.[1] ?? Number.NaN, 3)
    })
  })

  it('keeps the first answer when the closer look is not confident', async () => {
    const s = session(outputs(CARD, 4), outputs(CARD, -5))
    ort.InferenceSession.create.mockResolvedValue(s)
    const found = await mod.detect(photo)
    expect(found?.quad).toEqual([{ x: 500, y: 250 }, { x: 1500, y: 250 }, { x: 1500, y: 750 }, { x: 500, y: 750 }])
  })

  it('ignores outputs of other sizes and a missing corner output', async () => {
    const odd = { ...outputs(null, 4), extra: new ort.Tensor('float32', new Float32Array(5), [5]) }
    ort.InferenceSession.create.mockResolvedValue(session(odd))
    expect(await mod.detect(photo)).toBeNull()
  })

  it('releases the tensors and clears every copy of the photo, also when the run fails', async () => {
    const s = session(outputs(CARD, 4), new Error('run failed'))
    ort.InferenceSession.create.mockResolvedValue(s)
    await expect(mod.detect(photo)).rejects.toThrow('run failed')
    expect(s.outputs.length).toBeGreaterThan(0)
    for (const t of s.outputs) expect(t.disposed).toBe(true)
    for (const c of FakeCanvas.made) {
      expect([c.width, c.height]).toEqual([0, 0])
      for (const d of c.copies) expect(d.every((v) => v === 0)).toBe(true)
    }
  })

  it('clears the input tensor after the run', async () => {
    const s = session(outputs(null, -10))
    ort.InferenceSession.create.mockResolvedValue(s)
    await mod.detect(photo)
    expect(s.fed[0]?.disposed).toBe(true)
    expect(s.fed[0]?.data.every((v) => v === 0)).toBe(true)
  })
})
