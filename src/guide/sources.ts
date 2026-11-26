// SPDX-License-Identifier: AGPL-3.0-or-later
// Official sources cited by the card guide. Data only: meant to be reviewed by auditors.
//
// Rule (Alexis, 2026-11-25): no claim without a source. Every source here was read on the date in
// `checked`, and every citation in entries.ts points to the article, section or page that says it.
// Titles stay in the language they were published in, whatever the interface language: a
// translation must never change what a source is called.
//
// Links open in a new tab. The guide itself never fetches anything, so it works offline.

export type SourceId =
  | 'rd255' | 'rd1553' | 'reg2025' | 'reg1030'
  | 'icao5' | 'icao3' | 'icaoTr'
  | 'dnie40' | 'dnieCard' | 'dnieChip3' | 'dnieNfc' | 'dnieDev' | 'dnieBasics' | 'prado30'
  | 'aepdCopy' | 'aepdHotel' | 'incibeLoan'

export interface Source {
  readonly title: string
  readonly publisher: string
  /** Publication date or version, as the source states it. */
  readonly edition: string
  readonly url: string
  /** Language the title and text are published in (BCP 47). */
  readonly lang: string
  /** Date this source was read for the guide (YYYY-MM-DD). */
  readonly checked: string
  /** True when the source is no longer in force: cited only for documents issued under it. */
  readonly repealed?: boolean
}

export const SOURCES: Readonly<Record<SourceId, Source>> = {
  rd255: {
    title: 'Real Decreto 255/2025, de 1 de abril, por el que se regula el Documento Nacional de Identidad',
    publisher: 'Boletín Oficial del Estado (BOE-A-2025-6601)',
    edition: 'BOE núm. 80, 02/04/2025',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2025-6601',
    lang: 'es',
    checked: '2026-11-25',
  },
  rd1553: {
    title: 'Real Decreto 1553/2005, de 23 de diciembre, por el que se regula la expedición del documento nacional de identidad y sus certificados de firma electrónica',
    publisher: 'Boletín Oficial del Estado (BOE-A-2005-21163)',
    edition: 'Texto consolidado; derogado con efectos de 02/04/2025 por el Real Decreto 255/2025',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2005-21163',
    lang: 'es',
    checked: '2026-11-25',
    repealed: true,
  },
  reg2025: {
    title: 'Council Regulation (EU) 2025/1208 of 12 June 2025 on strengthening the security of identity cards of Union citizens and of residence documents issued to Union citizens and their family members exercising their right of free movement',
    publisher: 'Official Journal of the European Union (EUR-Lex)',
    edition: 'OJ L, 20.6.2025',
    url: 'https://eur-lex.europa.eu/eli/reg/2025/1208/oj/eng',
    lang: 'en',
    checked: '2026-11-25',
  },
  reg1030: {
    title: 'Council Regulation (EC) No 1030/2002 of 13 June 2002 laying down a uniform format for residence permits for third-country nationals',
    publisher: 'EUR-Lex (consolidated text 02002R1030-20171121)',
    edition: 'Consolidated version of 21.11.2017',
    url: 'https://eur-lex.europa.eu/eli/reg/2002/1030',
    lang: 'en',
    checked: '2026-11-25',
  },
  icao5: {
    title: 'Doc 9303 Machine Readable Travel Documents, Part 5: Specifications for TD1 Size Machine Readable Official Travel Documents (MROTDs)',
    publisher: 'International Civil Aviation Organization (ICAO)',
    edition: 'Seventh Edition, 2015',
    url: 'https://www.icao.int/publications/Documents/9303_p5_cons_en.pdf',
    lang: 'en',
    checked: '2026-11-25',
  },
  icao3: {
    title: 'Doc 9303 Machine Readable Travel Documents, Part 3: Specifications Common to all MRTDs',
    publisher: 'International Civil Aviation Organization (ICAO)',
    edition: 'Eighth Edition, 2021',
    url: 'https://icao.int/publications/Documents/9303_p3_cons_en.pdf',
    lang: 'en',
    checked: '2026-11-25',
  },
  icaoTr: {
    title: 'Additional TD1 and TD3 Size Layout Specifications for Machine Readable Travel Documents (MRTDs), Technical Report',
    publisher: 'International Civil Aviation Organization (ICAO)',
    edition: 'Release 2.1, October 2025',
    url: 'https://www.icao.int/sites/default/files/TRIP/Publications/TR-Additional_TD1_TD3_Size_Layout_Specs.pdf',
    lang: 'en',
    checked: '2026-11-25',
  },
  dnie40: {
    title: 'Descripción DNI 4.0',
    publisher: 'Policía Nacional, Portal oficial del DNI electrónico',
    edition: 'Página v.20260505',
    url: 'https://www.dnielectronico.es/PortalDNIe/PRF1_Cons02.action?pag=REF_110',
    lang: 'es',
    checked: '2026-11-25',
  },
  dnieCard: {
    title: 'Características físicas de la tarjeta',
    publisher: 'Policía Nacional, Portal oficial del DNI electrónico',
    edition: 'Página v.20260505',
    url: 'https://www.dnielectronico.es/PortalDNIe/PRF1_Cons02.action?pag=REF_084',
    lang: 'es',
    checked: '2026-11-25',
  },
  dnieChip3: {
    title: 'Descripción del Chip DNIe 3.0',
    publisher: 'Policía Nacional, Portal oficial del DNI electrónico',
    edition: 'Página v.20260505',
    url: 'https://www.dnielectronico.es/PortalDNIe/PRF1_Cons02.action?pag=REF_1078',
    lang: 'es',
    checked: '2026-11-25',
  },
  dnieNfc: {
    title: 'Guía de referencia DNIe con NFC',
    publisher: 'Policía Nacional, Portal oficial del DNI electrónico',
    edition: 'Madrid, 27 de octubre de 2017',
    url: 'https://www.dnielectronico.es/PDFs/Guia_de_Referencia_DNIe_con_NFC.pdf',
    lang: 'es',
    checked: '2026-11-25',
  },
  dnieDev: {
    title: 'Guía operativa para desarrolladores de aplicaciones tarjeta DNIe-DSCF 3.0',
    publisher: 'Policía Nacional, Portal oficial del DNI electrónico',
    edition: 'v1.0 rev. 2, 22/08/2016',
    url: 'https://www.dnielectronico.es/PDFs/Manual_de_Comandos_para_Desarrolladores_102.pdf',
    lang: 'es',
    checked: '2026-11-25',
  },
  dnieBasics: {
    title: 'Conceptos Básicos',
    publisher: 'Policía Nacional, Portal oficial del DNI electrónico',
    edition: 'Página v.20260505',
    url: 'https://www.dnielectronico.es/PortalDNIe/PRF1_Cons02.action?pag=REF_1001',
    lang: 'es',
    checked: '2026-11-25',
  },
  prado30: {
    title: 'PRADO ESP-BO-05001: Documento Nacional de Identidad',
    publisher: 'Council of the European Union, Public Register of Authentic travel and identity Documents Online (PRADO)',
    edition: 'Document generated on 21.10.2024',
    url: 'https://www.consilium.europa.eu/prado/en/ESP-BO-05001/index.html',
    lang: 'en',
    checked: '2026-11-25',
  },
  aepdCopy: {
    title: '¿Qué puedo hacer si me solicitan una copia del DNI?',
    publisher: 'Agencia Española de Protección de Datos (AEPD), preguntas frecuentes',
    edition: 'FAQ-0116',
    url: 'https://www.aepd.es/preguntas-frecuentes/1-tus-derechos/3-identificacion-con-dni/FAQ-0116-que-puedo-hacer-si-me-solicitan-una-copia-del-dni',
    lang: 'es',
    checked: '2026-11-25',
  },
  aepdHotel: {
    title: 'La AEPD informa de que no está permitido solicitar una copia del DNI o pasaporte en los hospedajes',
    publisher: 'Agencia Española de Protección de Datos (AEPD), nota de prensa',
    edition: '17 de junio de 2025',
    url: 'https://www.aepd.es/prensa-y-comunicacion/notas-de-prensa/aepd-informa-de-que-no-esta-permitido-solicitar-copia-dni-o-pasaporte-en-hospedajes',
    lang: 'es',
    checked: '2026-11-25',
  },
  incibeLoan: {
    title: 'Doble fraude al solicitar un préstamo y perder el dinero manteniendo la deuda',
    publisher: 'INCIBE, Tu Ayuda en Ciberseguridad (casos reales)',
    edition: 'Caso real publicado por INCIBE',
    url: 'https://www.incibe.es/linea-de-ayuda-en-ciberseguridad/casos-reales/doble-fraude-al-solicitar-un-prestamo-y-perder-el-dinero-manteniendo-la-deuda',
    lang: 'es',
    checked: '2026-11-25',
  },
}
