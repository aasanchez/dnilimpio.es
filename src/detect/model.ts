// SPDX-License-Identifier: AGPL-3.0-or-later
// The corner model, loaded on demand (spec: "better edges"). Everything this module imports ends up
// in assets/ml/, about 2.3 MB compressed, which the page loads only when a photo needs corners and
// the service worker keeps after the first use.
//
// Model: DocCornerNet LEAN from scanic-ml 0.2.0 (MIT): a 456 K-parameter corner detector, input
// 224 × 224 RGB, output 4 corners (0 to 1) and a "document present" logit. Runtime: onnxruntime-web
// 1.27.0 (MIT) with scanic-ml's minimal WebAssembly build, which holds only this model's operators.
//
// Privacy: the photo is scaled to 224 × 224 in memory and given to WebAssembly in this page. Nothing
// is sent anywhere: the app never calls fetch(), and the service worker refuses every request that is
// not a file of this build. The model and runtime arrive as script modules checked by the import
// map's integrity hashes.

import * as ort from 'onnxruntime-web/wasm'
import loaderUrl from 'scanic-ml/dist/ort-wasm-simd-threaded.mjs?url'
import wasmBase64 from 'scanic-ml/dist/ort-wasm-simd-threaded.wasm?base64'
import modelBase64 from 'scanic-ml/dist/doccornernet_lean.ort?base64'
import { modelDetection, type Detection } from './result.ts'

const SIZE = 224
const MEAN = [0.485, 0.456, 0.406] as const
const STD = [0.229, 0.224, 0.225] as const

function decodeBase64 (s: string): Uint8Array<ArrayBuffer> {
  const native = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array<ArrayBuffer> }).fromBase64
  if (native) return native(s)
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

let session: Promise<ort.InferenceSession> | null = null

/** Compiles the runtime and the model once per page. */
export function load (): Promise<ort.InferenceSession> {
  session ??= (async () => {
    ort.env.logLevel = 'error'
    ort.env.wasm.numThreads = 1 // threads need cross-origin isolation, which GitHub Pages cannot set
    ort.env.wasm.proxy = false
    ort.env.wasm.wasmPaths = { mjs: new URL(loaderUrl, import.meta.url).href }
    ort.env.wasm.wasmBinary = decodeBase64(wasmBase64)
    return await ort.InferenceSession.create(decodeBase64(modelBase64), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
  })()
  session.catch(() => { session = null })
  return session
}

type Ctx2D = Pick<CanvasRenderingContext2D, 'drawImage' | 'getImageData' | 'imageSmoothingEnabled' | 'imageSmoothingQuality'>

interface Rect { x: number; y: number; w: number; h: number }

/** One region of the photo as the model's input: 224 × 224, RGB, NHWC, ImageNet-normalised. */
function input (bitmap: ImageBitmap, r: Rect): Float32Array<ArrayBuffer> {
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(SIZE, SIZE) : Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE })
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null
  if (!ctx) throw new Error('No 2D context')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'medium'
  ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, SIZE, SIZE)
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE)
  try {
    const out = new Float32Array(SIZE * SIZE * 3)
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      out[j] = (data[i]! / 255 - MEAN[0]) / STD[0]
      out[j + 1] = (data[i + 1]! / 255 - MEAN[1]) / STD[1]
      out[j + 2] = (data[i + 2]! / 255 - MEAN[2]) / STD[2]
    }
    return out
  } finally {
    // The scaled copy of the photo is not needed any more: clear its pixels and free the canvas.
    data.fill(0)
    canvas.width = 0
    canvas.height = 0
  }
}

/** Runs the model on one region of the photo; corners come back in photo pixels. */
async function run (s: ort.InferenceSession, bitmap: ImageBitmap, r: Rect): Promise<Detection | null> {
  const pixels = input(bitmap, r)
  const tensor = new ort.Tensor('float32', pixels, [1, SIZE, SIZE, 3])
  let out: ort.InferenceSession.ReturnType | undefined
  let coords: ArrayLike<number> | null = null
  let logit = Number.NaN
  try {
    out = await s.run({ [s.inputNames[0]!]: tensor })
    // Only the eight corner coordinates and the score are kept.
    for (const t of Object.values(out)) {
      const d = t.data as Float32Array
      if (d.length === 8) coords = Array.from(d)
      else if (d.length === 1) logit = d[0]!
    }
  } finally {
    // Also on failure: release the model's buffers and clear the photo-derived input.
    for (const t of Object.values(out ?? {})) t.dispose()
    tensor.dispose()
    pixels.fill(0)
  }
  const found = coords ? modelDetection(coords, logit, r.w, r.h) : null
  return found && { ...found, quad: found.quad.map((p) => ({ x: p.x + r.x, y: p.y + r.y })) as unknown as Detection['quad'] }
}

/** Share of the card's size added around it for the second, closer look. */
const PAD = 0.15

/**
 * Runs the model on one photo. Null when it finds no card it is confident about.
 * Two passes: the whole photo, then a closer look at the region around what the first pass found,
 * where the card fills more of the model's 224 × 224 input and its corners are placed more precisely.
 */
export async function detect (bitmap: ImageBitmap): Promise<Detection | null> {
  const s = await load()
  const full = { x: 0, y: 0, w: bitmap.width, h: bitmap.height }
  const first = await run(s, bitmap, full)
  if (!first) return null
  const xs = first.quad.map((p) => p.x)
  const ys = first.quad.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const [px, py] = [(x1 - x0) * PAD, (y1 - y0) * PAD]
  const x = Math.max(0, Math.floor(x0 - px))
  const y = Math.max(0, Math.floor(y0 - py))
  const crop = { x, y, w: Math.min(bitmap.width, Math.ceil(x1 + px)) - x, h: Math.min(bitmap.height, Math.ceil(y1 + py)) - y }
  return (await run(s, bitmap, crop)) ?? first
}
