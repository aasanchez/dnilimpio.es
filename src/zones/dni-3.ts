// SPDX-License-Identifier: AGPL-3.0-or-later
// DNI 3.0 (issued 2015–2021) redaction zones. Data only: meant to be reviewed by auditors.
//
// Source: PRADO (Council of the EU public register of identity documents), ESP-BO-05001, compiled by
// Spanish document experts. Specimen "Carmen Española Española":
//   front  https://www.consilium.europa.eu/prado/images/ESP-BO-05001/226226.jpg (600 × 381 px)
//   back   https://www.consilium.europa.eu/prado/images/ESP-BO-05001/226227.jpg (600 × 379 px)
// Both images are cropped to the card edges. Fields were read against a 5 % grid; one source pixel
// ≈ 0.17 % of the card width. Method: docs/ZONES.md.

import { box, ID1_MM, type ModelZones } from './types.ts'

export const DNI_3_0: ModelZones = {
  model: 'dni-3.0',
  size: ID1_MM,
  source: {
    url: 'https://www.consilium.europa.eu/prado/images/ESP-BO-05001/226226.jpg',
    page: 'https://www.consilium.europa.eu/prado/en/ESP-BO-05001/index.html',
    pageVersion: 'images 21.10.2024',
    retrieved: '2026-11-25',
  },
  zones: [
    // Front
    { id: 'can', side: 'front', default: 'mandatory', rects: [box(0.785, 0.825, 0.98, 0.92)], note: 'CAN, 6 digits, bottom right ("987654")' },
    { id: 'signature', side: 'front', default: 'hidden', rects: [box(0.43, 0.78, 0.745, 0.955)], note: 'Holder signature, bottom centre' },
    {
      id: 'issueDate',
      side: 'front',
      default: 'hidden',
      rects: [box(0.775, 0.615, 0.945, 0.69)],
      note: 'Laser text beside the small ghost photo ("010115" = issue date ddmmyy; the front has no "EMISIÓN" field)',
    },
    { id: 'expiryDate', side: 'front', default: 'hidden', rects: [box(0.57, 0.705, 0.765, 0.775)], note: '"VALIDEZ 01 01 2025"' },
    {
      id: 'supportNumber',
      side: 'front',
      default: 'hidden',
      rects: [box(0.38, 0.705, 0.565, 0.775), box(0.755, 0.15, 0.88, 0.25)],
      note: '"NUM SOPORT BAA000431" and the same number in the clear window, top right',
    },
    { id: 'dateOfBirth', side: 'front', default: 'visible', rects: [box(0.38, 0.61, 0.585, 0.68)], note: '"FECHA DE NACIMIENTO 01 01 1980"' },
    // Back
    { id: 'mrz', side: 'back', default: 'hidden', rects: [box(0.03, 0.665, 0.97, 0.925)], note: 'Three MRZ lines (support number, DNI, birth and expiry dates, name)' },
    { id: 'supportNumber', side: 'back', default: 'hidden', rects: [box(0.115, 0.135, 0.245, 0.255)], note: 'Back of the clear window (mirror of the front)' },
    {
      id: 'address',
      side: 'back',
      default: 'visible',
      rects: [box(0.03, 0.045, 0.62, 0.225)],
      note: '"DOMICILIO" and three lines; widened to the right for long addresses',
    },
    { id: 'placeOfBirth', side: 'back', default: 'visible', rects: [box(0.27, 0.31, 0.62, 0.455)], note: '"LUGAR DE NACIMIENTO" and two lines; widened for long names' },
    { id: 'parents', side: 'back', default: 'visible', rects: [box(0.27, 0.495, 0.62, 0.59)], note: '"HIJO/A DE" and parents\' names' },
  ],
}
