// SPDX-License-Identifier: AGPL-3.0-or-later
// Card guide: what each element of each supported card is, how it can be misused, and where that
// is written. Data only: meant to be reviewed by auditors.
//
// Each entry has two parts, each with its own citations:
//   what  what the element is (src/guide/locales/<lang>/<id>_what)
//   risk  how a copy of it can be misused (<id>_risk)
// The text in every language says only what the cited passages say. An entry whose `what` or
// `risk` list is empty shows "No official source found" instead of a claim; tests/unit/guide.test.ts
// keeps the list of those entries explicit, so a missing citation cannot slip in unnoticed.

import type { DocModel, ZoneId } from '../zones/types.ts'
import type { SourceId } from './sources.ts'

export interface Cite {
  readonly src: SourceId
  /** Pinpoint as the source numbers it: article, annex point, section or page. Not translated. */
  readonly at: string
}

export type Place = 'front' | 'back' | 'chip'

export type EntryId =
  | 'header' | 'name' | 'sex' | 'nationality' | 'dateOfBirth' | 'dniNumber' | 'nie' | 'supportNumber' | 'cardNumber'
  | 'issueDate' | 'expiryDate' | 'photo' | 'signature' | 'can' | 'permitType' | 'remarks'
  | 'cli' | 'window' | 'dovid' | 'ovi' | 'relief' | 'printing' | 'material'
  | 'address' | 'placeOfBirth' | 'parents' | 'team' | 'issuePlace' | 'mrz'
  | 'chip' | 'certificates'

export interface Entry {
  readonly id: EntryId
  readonly place: Place
  /** The editor field that hides this element, when there is one. */
  readonly field?: ZoneId
  /** Text key base in the guide locales, when the wording differs per card. Defaults to `id`. */
  readonly text?: string
  readonly what: readonly Cite[]
  readonly risk: readonly Cite[]
}

/** General risks of sending a copy of an identity document, shown above the entries. */
export const GENERAL_RISK: readonly Cite[] = [
  { src: 'aepdHotel', at: 'nota de prensa, 17/06/2025' },
  { src: 'incibeLoan', at: 'caso real' },
  { src: 'aepdCopy', at: 'FAQ-0116' },
]

// Shared citations.
const ICAO_ZONES: Cite = { src: 'icao5', at: '§3.1.1, §3.2' }
const ICAO_MRZ: Cite = { src: 'icao5', at: '§4.2.2' }
const SUPPORT_HIDE: Cite = { src: 'aepdCopy', at: 'FAQ-0116' }
const PIXELATE: Cite = { src: 'incibeLoan', at: 'recomendaciones' }
const PACE: Cite = { src: 'dnieDev', at: '§4.6, §5.1' }
const CHIP_DATA: Cite = { src: 'dnieBasics', at: 'punto 8' }
const PUBLISH_FOUR: Cite = { src: 'aepdDa7', at: 'nota de prensa, 04/03/2019' }

// DNI 4.0: issued under Real Decreto 255/2025 (and, before 2 April 2025, RD 1553/2005) in the EU
// format of Regulation (EU) 2019/1157, now 2025/1208.
const DNI_4_0: readonly Entry[] = [
  { id: 'header', place: 'front', what: [{ src: 'reg2025', at: 'Art. 3(3), 3(4)' }, { src: 'dnie40', at: 'DNI 4.0' }, ICAO_ZONES], risk: [] },
  { id: 'name', place: 'front', what: [{ src: 'rd255', at: 'art. 12.a)' }, ICAO_ZONES], risk: [] },
  { id: 'sex', place: 'front', what: [{ src: 'rd255', at: 'art. 12.a)' }, { src: 'reg2025', at: 'Art. 3(2)' }, { src: 'icao5', at: '§4.1.1.1, §4.2.2' }], risk: [] },
  { id: 'nationality', place: 'front', what: [{ src: 'rd255', at: 'art. 12.a)' }], risk: [] },
  { id: 'dateOfBirth', place: 'front', field: 'dateOfBirth', what: [{ src: 'rd255', at: 'art. 12.a)' }], risk: [] },
  { id: 'dniNumber', place: 'front', what: [{ src: 'rd255', at: 'art. 2.2, art. 12.a)' }, { src: 'rd1553', at: 'art. 11.1' }], risk: [PUBLISH_FOUR] },
  { id: 'supportNumber', place: 'front', field: 'supportNumber', what: [{ src: 'rd255', at: 'art. 12.a)' }, { src: 'dnie40', at: 'DNI 4.0' }], risk: [SUPPORT_HIDE] },
  { id: 'issueDate', place: 'front', field: 'issueDate', what: [{ src: 'rd255', at: 'art. 12.a)' }], risk: [{ src: 'rd255', at: 'art. 7.1' }] },
  { id: 'expiryDate', place: 'front', field: 'expiryDate', what: [{ src: 'rd255', at: 'art. 12.a), art. 7.1' }, { src: 'reg2025', at: 'Art. 4(1)' }], risk: [{ src: 'rd255', at: 'art. 7.1' }] },
  { id: 'photo', place: 'front', what: [{ src: 'rd255', at: 'art. 12.a), art. 6.2.d)' }, { src: 'icao5', at: '§3.2, Zone V' }, { src: 'dnie40', at: 'DNI 4.0' }], risk: [PIXELATE] },
  { id: 'signature', place: 'front', field: 'signature', what: [{ src: 'rd255', at: 'art. 12.a), art. 6.2.g)' }, { src: 'icao5', at: '§3.2, Zone IV' }], risk: [PIXELATE] },
  { id: 'can', place: 'front', field: 'can', what: [{ src: 'dnie40', at: 'DNI 4.0' }, { src: 'icaoTr', at: '§4.2, p. 20' }, PACE], risk: [PACE, CHIP_DATA] },
  { id: 'cli', place: 'front', field: 'issueDate', what: [{ src: 'dnie40', at: 'DNI 4.0' }, { src: 'dnieCard', at: 'elementos de seguridad' }, { src: 'prado30', at: 'Security features' }], risk: [] },
  { id: 'window', place: 'front', field: 'supportNumber', what: [{ src: 'dnie40', at: 'DNI 4.0' }, { src: 'dnieNfc', at: '§1.6' }], risk: [SUPPORT_HIDE] },
  { id: 'dovid', place: 'front', what: [{ src: 'dnie40', at: 'DNI 4.0' }], risk: [] },
  { id: 'ovi', place: 'front', what: [{ src: 'dnie40', at: 'DNI 4.0' }, { src: 'dnieCard', at: 'serigrafía' }], risk: [] },
  { id: 'relief', place: 'front', what: [{ src: 'dnie40', at: 'DNI 4.0' }, { src: 'dnieCard', at: 'elementos de seguridad' }], risk: [] },
  { id: 'printing', place: 'front', what: [{ src: 'dnie40', at: 'DNI 4.0' }, { src: 'dnieCard', at: 'impresión offset' }], risk: [] },
  { id: 'material', place: 'front', what: [{ src: 'dnieCard', at: 'características físicas' }, { src: 'reg2025', at: 'Art. 3(1)' }], risk: [] },
  { id: 'address', place: 'back', field: 'address', what: [{ src: 'rd255', at: 'art. 12.b), art. 6.2.a)' }], risk: [] },
  { id: 'placeOfBirth', place: 'back', field: 'placeOfBirth', what: [{ src: 'rd255', at: 'art. 12.b)' }], risk: [] },
  { id: 'parents', place: 'back', field: 'parents', what: [{ src: 'rd255', at: 'art. 12.b)' }], risk: [] },
  { id: 'team', place: 'back', what: [{ src: 'rd255', at: 'art. 12.b)' }, { src: 'dnieNfc', at: '§1.6' }], risk: [SUPPORT_HIDE] },
  { id: 'mrz', place: 'back', field: 'mrz', what: [{ src: 'rd255', at: 'art. 12.b)' }, { src: 'reg2025', at: 'Art. 3(1), 3(2)' }, ICAO_MRZ, { src: 'icao3', at: '§4.1, §4.8, §4.9' }], risk: [ICAO_MRZ, PACE] },
  { id: 'chip', place: 'chip', what: [{ src: 'rd255', at: 'art. 11.2' }, { src: 'reg2025', at: 'Art. 3(5), 3(6)' }, { src: 'dnie40', at: 'DNI 4.0' }, CHIP_DATA], risk: [PACE, { src: 'reg2025', at: 'recital 21' }] },
  { id: 'certificates', place: 'chip', what: [{ src: 'rd255', at: 'art. 11.2.a), art. 11.3' }], risk: [] },
]

// DNI 3.0: issued from 2015 under Real Decreto 1553/2005 (now repealed; the cards stay valid until
// they expire). Layout from the Policía Nacional NFC guide (§1.6) and PRADO ESP-BO-05001.
const DNI_3_0: readonly Entry[] = [
  { id: 'header', text: 'header30', place: 'front', what: [{ src: 'rd1553', at: 'art. 10.2' }, ICAO_ZONES], risk: [] },
  { id: 'name', place: 'front', what: [{ src: 'rd1553', at: 'art. 11.1' }, { src: 'dnieNfc', at: '§1.6' }], risk: [] },
  { id: 'sex', text: 'sex30', place: 'front', what: [{ src: 'rd1553', at: 'art. 11.1' }, { src: 'icao5', at: '§4.1.1.1, §4.2.2' }], risk: [] },
  { id: 'nationality', place: 'front', what: [{ src: 'rd1553', at: 'art. 11.1' }], risk: [] },
  { id: 'dateOfBirth', place: 'front', field: 'dateOfBirth', what: [{ src: 'rd1553', at: 'art. 11.1' }, { src: 'dnieNfc', at: '§1.6' }], risk: [] },
  { id: 'dniNumber', place: 'front', what: [{ src: 'rd1553', at: 'art. 1.3, art. 11.1' }, { src: 'dnieNfc', at: '§1.6' }], risk: [PUBLISH_FOUR] },
  { id: 'supportNumber', place: 'front', field: 'supportNumber', what: [{ src: 'rd1553', at: 'art. 11.2' }, { src: 'dnieNfc', at: '§1.6' }, { src: 'dnieChip3', at: 'datos de gestión' }], risk: [SUPPORT_HIDE] },
  { id: 'issueDate', text: 'issueDate30', place: 'front', field: 'issueDate', what: [{ src: 'dnieNfc', at: '§1.6' }], risk: [{ src: 'rd1553', at: 'art. 6.1' }] },
  { id: 'expiryDate', text: 'expiryDate30', place: 'front', field: 'expiryDate', what: [{ src: 'rd1553', at: 'art. 11.2, art. 6.1' }, { src: 'dnieNfc', at: '§1.6' }], risk: [{ src: 'rd1553', at: 'art. 6.1' }] },
  { id: 'photo', text: 'photo30', place: 'front', what: [{ src: 'rd1553', at: 'art. 11.1' }, { src: 'prado30', at: 'Facial image' }, { src: 'icao5', at: '§3.2, Zone V' }], risk: [PIXELATE] },
  { id: 'signature', place: 'front', field: 'signature', what: [{ src: 'rd1553', at: 'art. 11.1' }, { src: 'icao5', at: '§3.2, Zone IV' }], risk: [PIXELATE] },
  { id: 'can', place: 'front', field: 'can', what: [{ src: 'dnieNfc', at: '§1.6' }, { src: 'icaoTr', at: '§4.2, p. 20' }, PACE], risk: [PACE, CHIP_DATA] },
  { id: 'cli', place: 'front', field: 'issueDate', what: [{ src: 'dnieNfc', at: '§1.6' }, { src: 'dnieCard', at: 'elementos de seguridad' }, { src: 'prado30', at: 'Security features' }], risk: [] },
  { id: 'window', place: 'front', field: 'supportNumber', what: [{ src: 'dnieNfc', at: '§1.6' }], risk: [SUPPORT_HIDE] },
  { id: 'dovid', text: 'dovid30', place: 'front', what: [{ src: 'dnieCard', at: 'elementos de seguridad' }, { src: 'prado30', at: 'Security features' }], risk: [] },
  { id: 'ovi', place: 'front', what: [{ src: 'dnieCard', at: 'serigrafía' }], risk: [] },
  { id: 'relief', place: 'front', what: [{ src: 'dnieCard', at: 'elementos de seguridad' }], risk: [] },
  { id: 'printing', place: 'front', what: [{ src: 'dnieCard', at: 'impresión offset' }], risk: [] },
  { id: 'material', place: 'front', what: [{ src: 'dnieCard', at: 'características físicas' }, { src: 'prado30', at: 'Format' }], risk: [] },
  { id: 'address', place: 'back', field: 'address', what: [{ src: 'rd1553', at: 'art. 11.1' }, { src: 'dnieNfc', at: '§1.6' }], risk: [] },
  { id: 'placeOfBirth', place: 'back', field: 'placeOfBirth', what: [{ src: 'rd1553', at: 'art. 11.1' }, { src: 'dnieNfc', at: '§1.6' }], risk: [] },
  { id: 'parents', place: 'back', field: 'parents', what: [{ src: 'rd1553', at: 'art. 11.1' }, { src: 'dnieNfc', at: '§1.6' }], risk: [] },
  { id: 'team', place: 'back', what: [{ src: 'dnieNfc', at: '§1.6' }], risk: [SUPPORT_HIDE] },
  { id: 'mrz', place: 'back', field: 'mrz', what: [{ src: 'rd1553', at: 'art. 11.1' }, { src: 'dnieNfc', at: '§1.6' }, ICAO_MRZ, { src: 'icao3', at: '§4.1, §4.8, §4.9' }], risk: [ICAO_MRZ, PACE] },
  { id: 'chip', text: 'chip30', place: 'chip', what: [{ src: 'rd1553', at: 'art. 11.4' }, { src: 'dnieChip3', at: 'zonas' }, { src: 'dnieNfc', at: '§4.1' }, CHIP_DATA], risk: [PACE] },
  { id: 'certificates', text: 'certificates30', place: 'chip', what: [{ src: 'rd1553', at: 'art. 11.4' }, { src: 'dnieChip3', at: 'zona privada' }], risk: [] },
]

// TIE (2020 model): uniform EU residence permit format, Regulation (EC) 1030/2002 Annex. The card for
// family members of EU citizens is outside that regulation (Art. 5) and follows Regulation (EU)
// 2025/1208 instead; both use the same physical model.
const TIE: readonly Entry[] = [
  { id: 'header', text: 'headerTie', place: 'front', what: [{ src: 'reg1030', at: 'Annex, points 1, 3.1, 3.2' }, { src: 'reg1030', at: 'Art. 5' }, { src: 'reg2025', at: 'title' }], risk: [] },
  { id: 'cardNumber', place: 'front', field: 'supportNumber', what: [{ src: 'reg1030', at: 'Annex, points 4.1, 4.2, (e)' }], risk: [] },
  { id: 'nie', place: 'front', what: [{ src: 'moncloaNie', at: '¿Qué es el NIE?' }], risk: [PUBLISH_FOUR] },
  { id: 'name', text: 'nameTie', place: 'front', what: [{ src: 'reg1030', at: 'Annex, point 6' }, ICAO_ZONES], risk: [] },
  { id: 'sex', text: 'sexTie', place: 'front', what: [{ src: 'reg1030', at: 'Annex, point 7' }, { src: 'icao5', at: '§4.1.1.1, §4.2.2' }], risk: [] },
  { id: 'nationality', place: 'front', what: [{ src: 'reg1030', at: 'Annex, point 8' }], risk: [] },
  { id: 'dateOfBirth', place: 'front', field: 'dateOfBirth', what: [{ src: 'reg1030', at: 'Annex, point 9' }], risk: [] },
  { id: 'permitType', place: 'front', field: 'permitType', what: [{ src: 'reg1030', at: 'Annex, point 10' }], risk: [] },
  { id: 'remarks', place: 'front', what: [{ src: 'reg1030', at: 'Annex, points 12, 16' }], risk: [] },
  { id: 'expiryDate', text: 'expiryDateTie', place: 'front', field: 'expiryDate', what: [{ src: 'reg1030', at: 'Annex, point 11' }], risk: [] },
  { id: 'photo', text: 'photoTie', place: 'front', what: [{ src: 'reg1030', at: 'Annex, points 13, 15' }, { src: 'icao5', at: '§3.2, Zone V' }], risk: [PIXELATE] },
  { id: 'signature', text: 'signatureTie', place: 'front', field: 'signature', what: [{ src: 'reg1030', at: 'Annex, point 14' }], risk: [PIXELATE] },
  { id: 'can', text: 'canTie', place: 'front', field: 'can', what: [{ src: 'reg1030', at: 'Annex, point 5' }, { src: 'icaoTr', at: '§4.2, p. 20' }], risk: [] },
  { id: 'dovid', text: 'dovidTie', place: 'front', what: [{ src: 'reg1030', at: 'Annex, points 13, 15, (f)' }], risk: [] },
  { id: 'ovi', text: 'oviTie', place: 'front', what: [{ src: 'reg1030', at: 'Annex, point 2' }], risk: [] },
  { id: 'printing', text: 'printingTie', place: 'front', what: [{ src: 'reg1030', at: 'Annex, (d), (g)' }], risk: [] },
  { id: 'material', text: 'materialTie', place: 'front', what: [{ src: 'reg1030', at: 'Annex' }], risk: [] },
  { id: 'issueDate', text: 'issueDateTie', place: 'back', field: 'issueDate', what: [{ src: 'reg1030', at: 'Annex, point 16.1' }], risk: [] },
  { id: 'issuePlace', place: 'back', what: [{ src: 'reg1030', at: 'Annex, point 16.1' }], risk: [] },
  { id: 'placeOfBirth', text: 'placeOfBirthTie', place: 'back', field: 'placeOfBirth', what: [{ src: 'reg1030', at: 'Annex, point 16.2' }], risk: [] },
  { id: 'address', text: 'addressTie', place: 'back', field: 'address', what: [{ src: 'reg1030', at: 'Annex, footnote 9' }], risk: [] },
  { id: 'mrz', text: 'mrzTie', place: 'back', field: 'mrz', what: [{ src: 'reg1030', at: 'Annex, point 17' }, ICAO_MRZ, { src: 'icao3', at: '§4.1, §4.8, §4.9' }], risk: [ICAO_MRZ] },
  { id: 'chip', text: 'chipTie', place: 'chip', what: [{ src: 'reg1030', at: 'Art. 4a; Annex, point 20' }, { src: 'reg2025', at: 'Art. 3(5), 3(6)' }], risk: [] },
]

export const GUIDE: Readonly<Record<DocModel, readonly Entry[]>> = { 'dni-4.0': DNI_4_0, 'dni-3.0': DNI_3_0, tie: TIE }

/** Entries without an official source for what they are. Each shows "No official source found". */
export const UNSOURCED_WHAT: readonly EntryId[] = []

/** Text key base of an entry. */
export const textOf = (e: Entry): string => e.text ?? e.id

/** Place order on screen. */
export const PLACES: readonly Place[] = ['front', 'back', 'chip']
