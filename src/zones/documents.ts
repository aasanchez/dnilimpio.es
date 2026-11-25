// SPDX-License-Identifier: AGPL-3.0-or-later
// Supported documents, in the order the picker shows them (newest DNI first).

import { DNI_4_0 } from './dni.ts'
import { DNI_3_0 } from './dni-3.ts'
import { TIE } from './tie.ts'
import type { DocModel, ModelZones, SizeMm } from './types.ts'

export const DOCUMENTS: readonly ModelZones[] = [DNI_4_0, DNI_3_0, TIE]

export const DEFAULT_DOC: DocModel = 'dni-4.0'

export function documentOf (model: DocModel): ModelZones {
  const d = DOCUMENTS.find((x) => x.model === model)
  if (!d) throw new Error(`Unknown document: ${model}`)
  return d
}

/** Straightened image size: 20 px per mm, like the original 1712 × 1080 ID-1 raster. */
export const PX_PER_MM = 20

export function pixelSize (size: SizeMm): { w: number, h: number } {
  return { w: Math.round(size.w * PX_PER_MM), h: Math.round(size.h * PX_PER_MM) }
}
