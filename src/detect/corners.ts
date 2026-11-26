// SPDX-License-Identifier: AGPL-3.0-or-later
// Finds the card's corners in a photo so the corner editor can start on them (spec §4.2).
// Detectors are tried in order; the first confident answer wins, and its sides are then snapped
// onto the card's real edges nearby (refine.ts). Every failure is silent: the model
// may be unavailable (offline before first use, an old browser, no WebAssembly) and then the editor
// simply keeps its manual starting position. Nothing here ever throws to the caller.

import { detectCard, toWorkGrey } from './edges.ts'
import { refineQuad } from './refine.ts'
import { shrink, wipe } from '../engine/wipe.ts'
import type { Detection } from './result.ts'

export type { Detection } from './result.ts'

/** `aspect`: width / height of the document (landscape), for detectors that check the shape. */
type Detector = (bitmap: ImageBitmap, aspect: number) => Promise<Detection | null>

let model: Promise<typeof import('./model.ts')> | null = null

/** Loads the model module (and with it the runtime). Retries on the next call after a failure. */
function loadModel (): Promise<typeof import('./model.ts')> {
  model ??= import('./model.ts')
  model.catch(() => { model = null })
  return model
}

/** True when this browser can run the model at all. */
export function modelSupported (): boolean {
  return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
}

/**
 * How long the model may take (download of about 2.6 MB the first time, runtime start-up and the
 * detection itself) before edge detection answers instead. The download goes on in the background,
 * so the next photo can use it.
 */
export const MODEL_WAIT_MS = 10_000

const byModel: Detector = async (bitmap) => {
  if (!modelSupported()) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => { timer = setTimeout(() => { resolve(null) }, MODEL_WAIT_MS) })
  try {
    // The whole operation races the deadline: a stalled runtime start-up must also fall back.
    return await Promise.race([loadModel().then(async (m) => await m.detect(bitmap)), late])
  } finally {
    clearTimeout(timer)
  }
}

/** Long side of the copy the edge detector reads; it works at 400 px internally (edges.ts). */
const EDGES_PX = 800

/** Classic edge detection (no model, no download): works offline from the first visit. */
const byEdges: Detector = async (bitmap, aspect) => {
  await Promise.resolve() // let the corners step render before the (synchronous) detector runs
  const k = Math.min(1, EDGES_PX / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * k))
  const h = Math.max(1, Math.round(bitmap.height * k))
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Pick<CanvasRenderingContext2D, 'drawImage' | 'getImageData'> | null
  if (!ctx) return null
  let img: ImageData | undefined
  let found
  try {
    ctx.drawImage(bitmap, 0, 0, w, h)
    img = ctx.getImageData(0, 0, w, h)
    found = detectCard(img, { aspect })
  } finally {
    shrink(canvas)
    wipe(img?.data)
  }
  if (!found) return null
  const q = found.quad
  const up = (i: 0 | 1 | 2 | 3): { x: number; y: number } => ({ x: q[i].x / k, y: q[i].y / k })
  return { quad: [up(0), up(1), up(2), up(3)], score: found.confidence, source: 'edges' }
}

// The model first (best on cluttered backgrounds), then classic edges (always available), then the
// editor's manual start position.
const DETECTORS: readonly Detector[] = [byModel, byEdges]

/** Starts downloading the model in the background, e.g. as soon as a photo is chosen. */
export function prefetchCornerModel (): void {
  if (!modelSupported()) return
  void loadModel().then((m) => m.load()).catch(() => undefined)
}

/** Long side of the copy used to snap the corners onto the card's edges (refine.ts). */
const REFINE_PX = 1000

/** Moves each side of `found` onto the card's real edge nearby (refine.ts); unchanged if unsure. */
function refined (bitmap: ImageBitmap, found: Detection): Detection {
  const k = Math.min(1, REFINE_PX / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * k))
  const h = Math.max(1, Math.round(bitmap.height * k))
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Pick<CanvasRenderingContext2D, 'drawImage' | 'getImageData'> | null
  if (!ctx) return found
  let img: ImageData | undefined
  let grey: ReturnType<typeof toWorkGrey>['grey'] | undefined
  const small = found.quad.map((p) => ({ x: p.x * k, y: p.y * k })) as unknown as Detection['quad']
  let q: Detection['quad']
  try {
    ctx.drawImage(bitmap, 0, 0, w, h)
    img = ctx.getImageData(0, 0, w, h)
    grey = toWorkGrey(img, REFINE_PX).grey
    q = refineQuad(grey, small)
  } finally {
    // Also when it throws: the copies of the photo are cleared and the canvas freed.
    shrink(canvas)
    wipe(img?.data, grey?.v)
  }
  if (q === small) return found
  return { ...found, quad: q.map((p) => ({ x: p.x / k, y: p.y / k })) as unknown as Detection['quad'] }
}

/** The card's corners in `bitmap`, or null when no detector is available or confident. */
export async function findCorners (bitmap: ImageBitmap, aspect: number): Promise<Detection | null> {
  for (const detect of DETECTORS) {
    try {
      const found = await detect(bitmap, aspect)
      if (found) {
        try {
          return refined(bitmap, found)
        } catch {
          return found
        }
      }
    } catch {
      // Unavailable or failed: try the next detector, then fall back to manual corners.
    }
  }
  return null
}
