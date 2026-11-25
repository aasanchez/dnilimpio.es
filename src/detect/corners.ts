// SPDX-License-Identifier: AGPL-3.0-or-later
// Finds the card's corners in a photo so the corner editor can start on them (spec §4.2).
// Detectors are tried in order; the first confident answer wins. Every failure is silent: the model
// may be unavailable (offline before first use, an old browser, no WebAssembly) and then the editor
// simply keeps its manual starting position. Nothing here ever throws to the caller.

import { detectCard } from './edges.ts'
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
 * How long the first use waits for the model to download (about 2.6 MB) before edge detection
 * answers instead. The download goes on in the background, so the next photo can use it.
 */
export const MODEL_WAIT_MS = 10_000

const byModel: Detector = async (bitmap) => {
  if (!modelSupported()) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => { timer = setTimeout(() => { resolve(null) }, MODEL_WAIT_MS) })
  try {
    const m = await Promise.race([loadModel(), late])
    return m ? await m.detect(bitmap) : null
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
  ctx.drawImage(bitmap, 0, 0, w, h)
  const found = detectCard(ctx.getImageData(0, 0, w, h), { aspect })
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

/** The card's corners in `bitmap`, or null when no detector is available or confident. */
export async function findCorners (bitmap: ImageBitmap, aspect: number): Promise<Detection | null> {
  for (const detect of DETECTORS) {
    try {
      const found = await detect(bitmap, aspect)
      if (found) return found
    } catch {
      // Unavailable or failed: try the next detector, then fall back to manual corners.
    }
  }
  return null
}
