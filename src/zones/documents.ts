// SPDX-License-Identifier: AGPL-3.0-or-later
// Supported documents. Internally each layout is its own document (DNI 4.0, DNI 3.0, TIE): its own
// zones and source. The person only chooses "DNI" or "TIE": the DNI version is detected from the
// photos, and falls back to the most common one (4.0) with a switch in the editor (ADR 0021).

import { DNI_4_0 } from './dni.ts'
import { DNI_3_0 } from './dni-3.ts'
import { TIE } from './tie.ts'
import type { DocModel, ModelZones, SizeMm } from './types.ts'

/** Every layout, newest DNI first. */
export const DOCUMENTS: readonly ModelZones[] = [DNI_4_0, DNI_3_0, TIE]

export const DEFAULT_DOC: DocModel = 'dni-4.0'

/** What the picker offers. The ids are stable: translations (`doc_<id>`) and e2e ids use them. */
export type DocChoice = 'dni' | 'tie'

/** Picker options, in order. */
export const CHOICES: readonly DocChoice[] = ['dni', 'tie']

/** DNI layouts, newest first. The first one is used when the version cannot be detected. */
export const DNI_VERSIONS = ['dni-4.0', 'dni-3.0'] as const satisfies readonly DocModel[]
export type DniVersion = (typeof DNI_VERSIONS)[number]

/** The most common DNI today, used when the version cannot be detected. */
export const DEFAULT_DNI: DniVersion = 'dni-4.0'

export const isDni = (model: DocModel): model is DniVersion => (DNI_VERSIONS as readonly DocModel[]).includes(model)

/** The picker option a layout belongs to. */
export const choiceOf = (model: DocModel): DocChoice => (isDni(model) ? 'dni' : 'tie')

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
