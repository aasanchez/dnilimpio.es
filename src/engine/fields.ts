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

/**
 * The fields printed on the given sides, each listing only those sides. With the front alone (the
 * back is optional), fields printed only on the back are left out: there is nothing to hide.
 */
export function fieldsOn (model: ModelZones, sides: readonly Side[]): Field[] {
  return fieldsOf(model).flatMap((f) => {
    const on = f.sides.filter((s) => sides.includes(s))
    return on.length > 0 ? [{ ...f, sides: on }] : []
  })
}

export function defaultHidden (model: ModelZones): Set<ZoneId> {
  return new Set(fieldsOf(model).filter((f) => f.hiddenByDefault).map((f) => f.id))
}

/** Normalised rectangles to paint black on one side. */
export function masksFor (model: ModelZones, side: Side, hidden: ReadonlySet<ZoneId>): Rect[] {
  return model.zones.filter((z) => z.side === side && hidden.has(z.id)).flatMap((z) => z.rects)
}

/**
 * Template rectangles the user moved or resized, in normalised card coordinates. The key is
 * zoneKey(): the zone's index in `model.zones` and the rectangle's index in that zone. Memory only.
 */
export type Placement = Readonly<Record<string, Rect>>

export const zoneKey = (zone: number, rect: number): string => `${String(zone)}:${String(rect)}`

/** The document's zones with the user's placement applied. Returns `model` itself when nothing moved. */
export function placeZones (model: ModelZones, placement: Placement): ModelZones {
  if (Object.keys(placement).length === 0) return model
  return {
    ...model,
    zones: model.zones.map((z, zi) => ({ ...z, rects: z.rects.map((r, ri) => placement[zoneKey(zi, ri)] ?? r) })),
  }
}

export interface PlacedRect { readonly key: string; readonly id: ZoneId; readonly rect: Rect }

/** Every template rectangle on one side, in zone order, with its placement key. */
export function sideRects (model: ModelZones, side: Side): PlacedRect[] {
  return model.zones.flatMap((z, zi) => (z.side === side ? z.rects.map((rect, ri) => ({ key: zoneKey(zi, ri), id: z.id, rect })) : []))
}

/** Data the MRZ repeats (docs/ZONES.md). */
export const MRZ_REPEATS: readonly ZoneId[] = ['supportNumber', 'dateOfBirth', 'expiryDate', 'name', 'idNumber']

/**
 * True when the document has an MRZ on one of the given sides, it stays visible, and the user hides
 * data that it repeats. Without the back photo there is no MRZ to leak.
 */
export function mrzLeaks (model: ModelZones, hidden: ReadonlySet<ZoneId>, sides: readonly Side[] = ['front', 'back']): boolean {
  return hasField(model, 'mrz', sides) && !hidden.has('mrz') && MRZ_REPEATS.some((id) => hidden.has(id))
}

/** True when the document prints this field on one of the given sides (both by default). */
export function hasField (model: ModelZones, id: ZoneId, sides: readonly Side[] = ['front', 'back']): boolean {
  return model.zones.some((z) => z.id === id && sides.includes(z.side))
}
