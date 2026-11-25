// SPDX-License-Identifier: AGPL-3.0-or-later
// TIE (Tarjeta de Identidad de Extranjero, residence permit card, model issued since 2020) redaction
// zones. Data only: meant to be reviewed by auditors.
//
// Source: PRADO (Council of the EU public register of identity documents), ESP-HO-03001, compiled by
// Spanish document experts. Specimen "Muestra Sample Carmen":
//   front  https://www.consilium.europa.eu/prado/images/ESP-HO-03001/341835.jpg (600 × 386 px; card
//          x 5.5–587.5, y 9–376)
//   back   https://www.consilium.europa.eu/prado/images/ESP-HO-03001/341857.jpg (600 × 386 px; card
//          x 11–593, y 5–374)
// PRADO lists the format as 88 × 54 mm, but the card is ID-1 like the DNI (the measured ratio is 1.58).
// Fields were read against a 5 % grid; one source pixel ≈ 0.17 % of the card width. Method: docs/ZONES.md.
// The NIE stays visible by design, like the DNI number.

import { box, ID1_MM, type ModelZones } from './types.ts'

export const TIE: ModelZones = {
  model: 'tie',
  size: ID1_MM,
  source: {
    url: 'https://www.consilium.europa.eu/prado/images/ESP-HO-03001/341835.jpg',
    page: 'https://www.consilium.europa.eu/prado/en/ESP-HO-03001/index.html',
    pageVersion: '31.08.2021',
    retrieved: '2026-11-25',
  },
  zones: [
    // Front
    { id: 'can', side: 'front', default: 'mandatory', rects: [box(0.785, 0.8, 0.985, 0.9)], note: 'CAN, 6 digits, bottom right ("123456")' },
    { id: 'signature', side: 'front', default: 'hidden', rects: [box(0.39, 0.76, 0.725, 0.905)], note: 'Holder signature, below the NIE' },
    { id: 'expiryDate', side: 'front', default: 'hidden', rects: [box(0.765, 0.485, 0.985, 0.555)], note: '"VALIDEZ TARJETA 01 01 2020"' },
    {
      id: 'supportNumber',
      side: 'front',
      default: 'hidden',
      rects: [box(0.685, 0.01, 0.99, 0.105), box(0.03, 0.135, 0.215, 0.21)],
      note: 'Card number "E00000000", top right and again below the coat of arms',
    },
    { id: 'dateOfBirth', side: 'front', default: 'visible', rects: [box(0.765, 0.4, 0.985, 0.47)], note: '"FECHA NAC. 01 01 1980"' },
    {
      id: 'permitType',
      side: 'front',
      default: 'visible',
      rects: [box(0.405, 0.485, 0.75, 0.555), box(0.405, 0.555, 0.92, 0.645)],
      note: '"TIPO DE PERMISO": three lines (e.g. RESIDENCIA LARGA DURACION, AUTORIZA A TRABAJAR)',
    },
    // Back
    { id: 'mrz', side: 'back', default: 'hidden', rects: [box(0.03, 0.66, 0.97, 0.93)], note: 'Three MRZ lines (card number, NIE, birth and expiry dates, nationality, name)' },
    { id: 'issueDate', side: 'back', default: 'hidden', rects: [box(0.195, 0.18, 0.405, 0.26)], note: '"FECHA DE EMISIÓN 01 01 2019" (the place of issue stays visible)' },
    { id: 'placeOfBirth', side: 'back', default: 'visible', rects: [box(0.21, 0.265, 0.75, 0.34)], note: '"LUGAR DE NACIMIENTO", one line with the country code' },
    { id: 'address', side: 'back', default: 'visible', rects: [box(0.03, 0.35, 0.5, 0.545)], note: '"DOMICILIO" and three lines; widened for long addresses' },
  ],
}
