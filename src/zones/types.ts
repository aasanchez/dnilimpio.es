// SPDX-License-Identifier: AGPL-3.0-or-later
// Types shared by every document's zone data. Zones are in normalised document coordinates (0–1,
// origin top-left of the straightened document), per model and side (spec §4.3).

export type Side = 'front' | 'back'

/** Supported documents. The ids are stable: tests, translations (`doc_<id>`) and e2e ids use them. */
export type DocModel = 'dni-4.0' | 'dni-3.0' | 'tie'

export type ZoneId =
  | 'signature' | 'issueDate' | 'expiryDate' | 'supportNumber' | 'can' // hidden by default
  | 'mrz' // back, hidden by default
  | 'address' | 'placeOfBirth' | 'parents' | 'dateOfBirth' | 'permitType' // optional, visible by default

/** `mandatory` marks the CAN (it gives NFC access to the chip): hidden by default, with a warning if shown. */
export type ZoneDefault = 'mandatory' | 'hidden' | 'visible'

export interface Rect { readonly x: number, readonly y: number, readonly w: number, readonly h: number }

export interface Zone {
  readonly id: ZoneId
  readonly side: Side
  readonly default: ZoneDefault
  /** One field can be printed in more than one place (e.g. the issue date also appears in the CLI). */
  readonly rects: readonly Rect[]
  /** What the rectangles cover on the specimen, for reviewers. */
  readonly note: string
}

/** Physical size of the document in millimetres. It sets the aspect ratio of the straightened image. */
export interface SizeMm { readonly w: number, readonly h: number }

export interface ModelZones {
  readonly model: DocModel
  readonly size: SizeMm
  readonly source: { readonly url: string, readonly page: string, readonly pageVersion: string, readonly retrieved: string }
  readonly zones: readonly Zone[]
  /**
   * Inner part of the holder's photo on the front: the largest dark block on the card. Used only to
   * tell an upside-down photo from an upright one (src/detect/upright.ts), never to hide anything.
   * Deliberately smaller than the photo, so small measurement errors keep it inside.
   */
  readonly portrait: Rect
}

/** ID-1 card (ISO/IEC 7810): DNI and TIE. */
export const ID1_MM: SizeMm = { w: 85.6, h: 53.98 }

/** Builds a rect from its edges, which is how the values were read off the grid. */
export const box = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
