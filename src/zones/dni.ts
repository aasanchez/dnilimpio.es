// SPDX-License-Identifier: AGPL-3.0-or-later
// Redaction zones in normalised card coordinates (0–1, origin top-left of the straightened card), per
// model and side (spec §4.3). Data only: this file is meant to be reviewed by auditors.
//
// Source: official DNI 4.0 specimen ("Carmen Española Española") published by the Policía Nacional:
//   image   https://www.dnielectronico.es/img/Imagen_DNI_4.0.JPG (823 × 580 px)
//   page    https://www.dnielectronico.es/PortalDNIe/PRF1_Cons02.action?pag=REF_110 ("Descripción DNI 4.0",
//           page version v.20260505), retrieved 2026-11-24.
// Method: in that image each side measures about 256 × 161.5 px (front: x 74–330, y 211–372.5; back:
// x 495.5–751.5, y 212–373.5). Edges were found from pixel saturation profiles, then fields were read
// against a 5 % grid. One source pixel ≈ 0.4 % of card width, so every rectangle has at least 1 %
// margin around the printed text. Users can adjust zones in the manual editor.
// To re-measure: docs/ZONES.md.

export type Side = 'front' | 'back'
export type DniModel = 'dni-4.0'

export type ZoneId =
  | 'signature' | 'issueDate' | 'expiryDate' | 'supportNumber' | 'can' // front, hidden by default
  | 'mrz' // back, hidden by default
  | 'address' | 'placeOfBirth' | 'parents' | 'dateOfBirth' // optional, visible by default

/** `mandatory` zones cannot be turned off (CAN gives NFC access to the chip). */
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

export interface ModelZones {
  readonly model: DniModel
  readonly source: { readonly url: string, readonly page: string, readonly pageVersion: string, readonly retrieved: string }
  readonly zones: readonly Zone[]
}

/** Builds a rect from its edges, which is how the values were read off the grid. */
const box = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 })

export const DNI_4_0: ModelZones = {
  model: 'dni-4.0',
  source: {
    url: 'https://www.dnielectronico.es/img/Imagen_DNI_4.0.JPG',
    page: 'https://www.dnielectronico.es/PortalDNIe/PRF1_Cons02.action?pag=REF_110',
    pageVersion: 'v.20260505',
    retrieved: '2026-11-24',
  },
  zones: [
    // Front
    { id: 'can', side: 'front', default: 'mandatory', rects: [box(0.78, 0.82, 0.985, 0.93)], note: 'CAN, 6 digits, bottom right ("987654")' },
    { id: 'signature', side: 'front', default: 'hidden', rects: [box(0.43, 0.775, 0.765, 0.93)], note: 'Holder signature, below the support number' },
    {
      id: 'issueDate',
      side: 'front',
      default: 'hidden',
      rects: [box(0.385, 0.585, 0.588, 0.69), box(0.82, 0.665, 0.955, 0.745)],
      note: '"EMISIÓN 02 06 2021" and the CLI laser image ("020621" = issue date ddmmyy)',
    },
    { id: 'expiryDate', side: 'front', default: 'hidden', rects: [box(0.585, 0.585, 0.785, 0.69)], note: '"VALIDEZ 02 06 2031"' },
    {
      id: 'supportNumber',
      side: 'front',
      default: 'hidden',
      rects: [box(0.385, 0.695, 0.575, 0.785), box(0.785, 0.165, 0.905, 0.26)],
      note: '"NUM SOPORTE CAA000000" and the laser-engraved clear window (illegible on the specimen; hidden as a precaution)',
    },
    { id: 'dateOfBirth', side: 'front', default: 'visible', rects: [box(0.785, 0.505, 0.985, 0.6)], note: '"NACIMIENTO 01 01 1980"' },
    // Back
    { id: 'mrz', side: 'back', default: 'hidden', rects: [box(0.03, 0.665, 0.97, 0.935)], note: 'Three MRZ lines (support number, DNI, birth and expiry dates, name)' },
    {
      id: 'supportNumber',
      side: 'back',
      default: 'hidden',
      rects: [box(0.095, 0.13, 0.235, 0.255)],
      note: 'Back of the clear window (mirror of the front window)',
    },
    { id: 'address', side: 'back', default: 'visible', rects: [box(0.27, 0.035, 0.62, 0.225)], note: '"DOMICILIO" and three address lines' },
    { id: 'placeOfBirth', side: 'back', default: 'visible', rects: [box(0.27, 0.315, 0.47, 0.465)], note: '"LUGAR DE NACIMIENTO" and two lines' },
    { id: 'parents', side: 'back', default: 'visible', rects: [box(0.27, 0.49, 0.54, 0.6)], note: '"HIJO/A DE" and parents\' names' },
  ],
}

export const DNI_ZONES: Readonly<Record<DniModel, ModelZones>> = { 'dni-4.0': DNI_4_0 }
