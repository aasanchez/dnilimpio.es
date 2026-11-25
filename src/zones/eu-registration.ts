// SPDX-License-Identifier: AGPL-3.0-or-later
// Certificado de registro de ciudadano de la Unión (EU citizen registration certificate, the green
// paper card with the NIE) redaction zones. Data only: meant to be reviewed by auditors.
//
// Source: PRADO (Council of the EU public register of identity documents), ESP-HP-01002, compiled by
// Spanish document experts. The certificate is printed on an A4 sheet with a micro-perforated card of
// 83 × 53 mm, which the holder detaches and carries. The tool works on that card; on an uncut sheet,
// mark the corners of the card.
//   front  https://www.consilium.europa.eu/prado/images/ESP-HP-01002/131058.JPG (A4 sheet, 426 × 600 px;
//          card ≈ x 128.7–297.3, y 325–432.6, placed from the sheet centre and the content block)
//   back   https://www.consilium.europa.eu/prado/images/ESP-HP-01002/131436.JPG (card, 300 × 201 px)
// The specimen card is only about 170 px wide (one pixel ≈ 0.6 %). Text lines were located from per-row
// dark-pixel profiles (line pitch ≈ 5 % of the card height) and each rectangle covers whole lines up to
// half the gap to the next line. The data is printed by an office printer, so on a real certificate the
// lines can sit up to about a millimetre (≈ 2 %) away from these positions: the user must check them.
// Method: docs/ZONES.md.
// The name and the NIE stay visible by design.

import { box, type ModelZones } from './types.ts'

export const EU_REGISTRATION: ModelZones = {
  model: 'eu-registration',
  size: { w: 83, h: 53 },
  source: {
    url: 'https://www.consilium.europa.eu/prado/images/ESP-HP-01002/131058.JPG',
    page: 'https://www.consilium.europa.eu/prado/en/ESP-HP-01002/index.html',
    pageVersion: '01.07.2021',
    retrieved: '2026-11-25',
  },
  zones: [
    // Front: printed lines below "El encargado del Registro Central de Extranjeros certifica que:"
    { id: 'dateOfBirth', side: 'front', default: 'visible', rects: [box(0.265, 0.39, 0.43, 0.445)], note: 'Date in "Fecha y lugar nac.: 06/06/1988"' },
    {
      id: 'placeOfBirth',
      side: 'front',
      default: 'visible',
      rects: [box(0.425, 0.39, 0.995, 0.445), box(0.005, 0.44, 0.995, 0.495)],
      note: 'Place after the birth date, and the country on the next line',
    },
    { id: 'parents', side: 'front', default: 'visible', rects: [box(0.005, 0.495, 0.995, 0.545)], note: '"Hijo/a de: … y de …"' },
    { id: 'address', side: 'front', default: 'visible', rects: [box(0.005, 0.59, 0.995, 0.69)], note: '"Domicilio:" and the next line (town and province)' },
    { id: 'issueDate', side: 'front', default: 'hidden', rects: [box(0.25, 0.74, 0.8, 0.8)], note: 'Place and date of issue ("Madrid 7 de abril de 2011"), centred above the official\'s signature' },
    // Back: legal notice and the serial number of the card substrate
    { id: 'supportNumber', side: 'back', default: 'hidden', rects: [box(0.66, 0.84, 0.97, 0.985)], note: 'Serial number of the card, bottom right ("2900940")' },
  ],
}
