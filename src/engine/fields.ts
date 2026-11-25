// SPDX-License-Identifier: AGPL-3.0-or-later
// "Fields to hide" model (spec §10, §12): one entry per field, whatever side(s) it is printed on.
// A field in the `hidden` set is masked on every side and position where it appears.

import type { ModelZones, Rect, Side, ZoneId } from '../zones/dni.ts'

export interface Field {
  readonly id: ZoneId
  readonly sides: readonly Side[]
  /** Recommended initial state. Every field can still be changed by the user. */
  readonly hiddenByDefault: boolean
}

/** Fields in the order they first appear in the zone data. */
export function fieldsOf (model: ModelZones): Field[] {
  const out = new Map<ZoneId, { sides: Side[]; hidden: boolean }>()
  for (const z of model.zones) {
    const f = out.get(z.id) ?? { sides: [], hidden: false }
    if (!f.sides.includes(z.side)) f.sides.push(z.side)
    f.hidden ||= z.default !== 'visible'
    out.set(z.id, f)
  }
  return [...out].map(([id, f]) => ({ id, sides: f.sides, hiddenByDefault: f.hidden }))
}

export function defaultHidden (model: ModelZones): Set<ZoneId> {
  return new Set(fieldsOf(model).filter((f) => f.hiddenByDefault).map((f) => f.id))
}

/** Normalised rectangles to paint black on one side. */
export function masksFor (model: ModelZones, side: Side, hidden: ReadonlySet<ZoneId>): Rect[] {
  return model.zones.filter((z) => z.side === side && hidden.has(z.id)).flatMap((z) => z.rects)
}

/** Data the MRZ repeats (docs/ZONES.md). Name and DNI number are also there but are not fields yet. */
export const MRZ_REPEATS: readonly ZoneId[] = ['supportNumber', 'dateOfBirth', 'expiryDate']

/** True when the document has an MRZ, it stays visible, and the user hides data that it repeats. */
export function mrzLeaks (model: ModelZones, hidden: ReadonlySet<ZoneId>): boolean {
  return hasField(model, 'mrz') && !hidden.has('mrz') && MRZ_REPEATS.some((id) => hidden.has(id))
}

export function hasField (model: ModelZones, id: ZoneId): boolean {
  return model.zones.some((z) => z.id === id)
}
