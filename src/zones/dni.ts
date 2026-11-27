// SPDX-License-Identifier: AGPL-3.0-or-later
// DNI 4.0 (issued since 2021) redaction zones in normalised card coordinates (0–1, origin top-left of the straightened card), per
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

import { box, ID1_MM, type ModelZones } from './types.ts'

export type { DocModel, ModelZones, Rect, Side, Zone, ZoneDefault, ZoneId } from './types.ts'

export const DNI_4_0: ModelZones = {
  model: 'dni-4.0',
  size: ID1_MM,
  // Holder's photo, front left (inner part, for orientation only; see types.ts).
  portrait: box(0.06, 0.32, 0.28, 0.78),
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
    {
      id: 'name',
      side: 'front',
      default: 'visible',
      rects: [box(0.395, 0.3, 0.78, 0.41), box(0.395, 0.435, 0.78, 0.5)],
      note: 'Surnames ("ESPAÑOLA ESPAÑOLA", two lines) and name ("CARMEN"), below their labels; widened for long names',
    },
    {
      id: 'idNumber',
      side: 'front',
      default: 'visible',
      rects: [box(0.395, 0.18, 0.77, 0.265), box(0.02, 0.195, 0.16, 0.245)],
      note: '"DNI 99999999R" and the small copy of the number top left',
    },
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
