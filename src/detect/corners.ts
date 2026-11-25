// SPDX-License-Identifier: AGPL-3.0-or-later
// Finds the card's corners in a photo so the corner editor can start on them (spec §4.2).
// Detectors are tried in order; the first confident answer wins. Every failure is silent: the model
// may be unavailable (offline before first use, an old browser, no WebAssembly) and then the editor
// simply keeps its manual starting position. Nothing here ever throws to the caller.

import type { Detection } from './result.ts'

export type { Detection } from './result.ts'

type Detector = (bitmap: ImageBitmap) => Promise<Detection | null>

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

const byModel: Detector = async (bitmap) => {
  if (!modelSupported()) return null
  return await (await loadModel()).detect(bitmap)
}

// The model first; the classical edge detector joins this list when it lands.
const DETECTORS: readonly Detector[] = [byModel]

/** Starts downloading the model in the background, e.g. as soon as a photo is chosen. */
export function prefetchCornerModel (): void {
  if (!modelSupported()) return
  void loadModel().then((m) => m.load()).catch(() => undefined)
}

/** The card's corners in `bitmap`, or null when no detector is available or confident. */
export async function findCorners (bitmap: ImageBitmap): Promise<Detection | null> {
  for (const detect of DETECTORS) {
    try {
      const found = await detect(bitmap)
      if (found) return found
    } catch {
      // Unavailable or failed: try the next detector, then fall back to manual corners.
    }
  }
  return null
}
