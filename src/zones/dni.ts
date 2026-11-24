// SPDX-License-Identifier: AGPL-3.0-or-later
// Redaction zones in normalised card coordinates (0–1, origin top-left), per model and side (spec §4.3).
//
// PENDING: coordinates are intentionally empty until the specimen source is confirmed.
// Each zone will cite the specimen it was measured on (URL, publication date, retrieval date).

export type Side = 'front' | 'back'
export type DniModel = 'dni-4.0'

export type ZoneId =
  | 'signature' | 'issueDate' | 'expiryDate' | 'supportNumber' | 'can' // front, hidden by default
  | 'mrz' // back, hidden by default
  | 'address' | 'placeOfBirth' | 'parents' | 'dateOfBirth' // optional

export interface Zone {
  readonly id: ZoneId;
  readonly side: Side;
  /** Hidden unless the user turns it off. `mandatory` zones cannot be turned off (e.g. CAN). */
  readonly default: 'hidden' | 'visible' | 'mandatory';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ModelZones {
  readonly model: DniModel;
  readonly source: { readonly url: string; readonly published: string; readonly retrieved: string };
  readonly zones: readonly Zone[];
}

export const DNI_ZONES: Readonly<Record<DniModel, ModelZones | null>> = {
  'dni-4.0': null,
}
