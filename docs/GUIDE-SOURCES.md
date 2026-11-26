<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Card guide: source notes

What each official source was read for, with the short verbatim quotes the guide relies on. Read on
2026-11-25 for [ADR 0014](adr/0014-card-guide.md). Quotes are kept short; follow the links for the full
text. "Not read" marks what could not be retrieved, which is why some guide entries say that no
official source was found.


## RD 255/2025 (BOE-A-2025-6601) https://www.boe.es/buscar/act.php?id=BOE-A-2025-6601 — current DNI decree, in force 02/04/2025, repeals RD 1553/2005
- Art 12 intro: data "además de lo específicamente dispuesto por el Reglamento (UE) 2019/1157"
- Art 12.a anverso: "Número y carácter de verificación personal e intransferible del Documento Nacional de Identidad." "Apellidos y nombre." "Fecha de nacimiento." "Sexo." "Nacionalidad." "Emisión del documento." "Validez." "Número de soporte." "Fotografía digitalizada." "Firma manuscrita digitalizada."
- Art 12.b reverso: "Domicilio." "Lugar de nacimiento." "Nombre de los progenitores." "Número de Equipo de la Unidad de Documentación." "Tres líneas MRZ que contienen 30 caracteres OCR-B cada una." "Chip electrónico."
- Art 2.1 "emitido por el Ministerio del Interior, a través de la Dirección General de la Policía"; 2.2 "número personal que tendrá la consideración de identificador numérico personal de carácter general."
- Art 3.1 "es el único documento con suficiente valor por sí solo para la acreditación, a todos los efectos, de la identidad"
- Art 4.2 obligatorio >14 residentes en España; 4.3 "personal e intransferible, debiendo su titular mantenerlo en vigor, conservarlo y custodiarlo con la debida diligencia."; 4.5 exhibirlo when required by authority
- Art 6.2.a padrón certificate (address); 6.2.d.4 photo 32x26 mm white background; 6.2.f facial image + "dos impresiones dactilares ... a excepción de los menores de seis años"; 6.2.g signature
- Art 7.1 validity: 2y <5; 5y 5–30; 10y 30–70; "Más de diez años cuando la persona titular haya cumplido los setenta años, consignando una fecha."
- Art 11.1 material/design by orden del Ministerio del Interior, "máximas garantías para impedir su falsificación"
- Art 11.2 chip "medio de almacenamiento de alta seguridad" with separately: a) qualified certificates (Reg 910/2014 as amended by 2024/1183); b) "La fotografía, los datos personales del titular del documento y las dos impresiones dactilares en formatos digitales interoperables."
- Art 11.3 certificates valid two years
- Art 13 digital version (MiDNI) same validity

## RD 1553/2005 (BOE-A-2005-21163) historical, repealed 2 Apr 2025
- art 11.1 anverso incl "Número personal ... y carácter de verificación correspondiente al Número de Identificación Fiscal."; reverso "Lugar de nacimiento" "Provincia-Nación" "Nombre de los padres" "Domicilio"... "Caracteres OCR-B de lectura mecánica"; 11.2 "Fecha de caducidad" "Número de soporte"; 11.4 chip incl signature image, fingerprint template right index; 6.1.d "Permanente" over 70.

## Reg (EU) 2019/1157 OJ L 188 12.7.2019 (no longer in force 2025-07-09; replaced by 2025/1208)
- 3(1) ID-1, MRZ, ICAO 9303; 3(2) part 5 of 9303; doc number may be in zone I; gender optional
- 3(4) "two-letter country code ... printed in negative in a blue rectangle and encircled by 12 yellow stars."
- 3(5) storage medium facial image + two fingerprints; 3(6) contactless, secured per C(2018) 7767
- 4(1) validity 5–10y; 5(1) old cards cease by 3 Aug 2031; 5(2)(a) no MRZ/ICAO part 2 by 3 Aug 2026
- 11(6) biometric use only to verify authenticity / identity; 10(3) biometrics kept max 90 days at issuer
- CAN: not in text.

## ICAO TR "Additional TD1 and TD3 Size Layout Specifications" Release 2.1 Oct 2025 https://www.icao.int/sites/default/files/TRIP/Publications/TR-Additional_TD1_TD3_Size_Layout_Specs.pdf
- 4.2 p20 "The 'CAN' SHALL be a 6-digit number."; numerals only; font per MRZ (9303-3); landscape "SHOULD be placed in Zone III", not overlapping portrait (Zone V)
- 3.1 p9 Zone II name/sex/nationality/dob; Zone III document number, expiry
- Purpose of CAN not stated. Doc 9303 parts 1/3/5 PDFs: fetch failed (client_error).

## PRADO ESP-BO-05001 (DNI 3.0) https://www.consilium.europa.eu/prado/en/ESP-BO-05001/index.html
- first issued 02/01/2015; 86x54 mm; validity 10 years; bilingual text in some regions
- security: laminate; OVD; variable laser image CLI/MLI "alternates between ghost image of holder and date of issue"; facial image b&w laser engraving
- ESP-BO-06001, ESP-HO-03001 pages: fetch failed.

## Orden PRE/1490/2012 (BOE-A-2012-9218): art 4.4 non-EU family members "deberán solicitar la expedición de una tarjeta de residencia de familiar de ciudadano de la Unión, de acuerdo con lo previsto en el artículo 8 del Real Decreto 240/2007". No card spec.

## Reg (EU) 2025/1208 of 12 June 2025 (OJ L 20.6.2025) https://eur-lex.europa.eu/eli/reg/2025/1208/oj/eng
- Title: "on strengthening the security of identity cards of Union citizens and of residence documents issued to Union citizens and their family members exercising their right of free movement"
- Art 3(1) ID-1 + MRZ + ICAO 9303; 3(2) part 5; doc number may be in zone I; gender optional
- Art 3(4) two-letter country code, negative, blue rectangle, 12 yellow stars; Art 6(h) same for residence documents
- Art 3(5) "biometric data, namely a facial image of the holder of the card and two fingerprints, in interoperable digital formats"; 3(6) contactless, C(2018) 7767
- 3(7) fingerprint exemption <12 may, <6 shall
- 4(1) 5–10 y; 5(1) old cards by 3 Aug 2031; 5(2)(a) 3 Aug 2026; Art 8 residence cards same dates
- Recital 21 facial image access only authorised staff; recital 23 90 days
- Repeal of 2019/1157 not verified verbatim (EUR-Lex metadata of 2019/1157: no longer in force 2025-07-09)

## dnielectronico.es (page versions v.20260505)
- REF_110 DNI 4.0: "El DNIe 4.0 formato europeo nace ..." keeps 3.0 security; adds "Aparición de la bandera de la Unión Europea con las siglas en su interior del país que emite el documento." and "Indicación del título de Documento Nacional de Identidad en al menos otra lengua oficial de la Unión." Presented 2 June 2021. Image labels front: Parche holográfico (DOVID); tinta ópticamente variable; ventana transparente con grabado láser; embosados en alto relieve; fondos offset de seguridad; cli en bajo relieve; foto más grande; can; tinta uv. Back: tinta ópticamente variable; microtextos; chip de interfaz dual; tintas uv.
- REF_084 físicas: policarbonato; ID-1 85,6 x 53,98 mm; 760 micras; offset: Guilloches, Impresión en iris, Tintas invisibles con respuesta a la luz UV, Microtextos positivos y negativos, Imagen codificada; serigrafía: Tinta OVI con cambio de color según el ángulo de visión; Kinegrama anti-fotocopia; CLI imagen doble grabado láser; relieve al tacto en anverso.
- REF_1078 chip 3.0: chip in "parte central izquierda del reverso"; Dual Interface; zona pública (CA cert, DH keys, component cert); zona privada PIN (firma, autenticación certs); zona de seguridad (datos de filiación, fotografía, firma manuscrita); fingerprint template; "Número de serie del soporte"; CC EAL5+.
- Guia_de_Referencia_DNIe_con_NFC.pdf (27 Oct 2017) sec 1.6 DNI 3.0 layout: front central: Primer apellido, Segundo apellido, Nombre, Sexo, Nacionalidad, Fecha de nacimiento, Número de soporte físico, Fecha de validez del documento; lower-left: Número del DNI; CLI right: "La fecha de expedición en formato DDMMAA" + photo; lower-right: CAN; upper-right: "Ventana transparente con grabado láser del número de soporte físico". Back: Domicilio, Lugar de domicilio, Provincia-país del domicilio, Lugar de nacimiento, Provincia-País, Nombre de los padres; "Código del equipo de expedición del DNIe"; "Información impresa OCR-B para lectura mecanizada sobre la identidad del ciudadano según normativa OACI para documentos de viaje." Sec 4.1 "Contiene antena NFC"; ISO 14443.
- CAN purpose: NOT found yet.

## ICAO Doc 9303 Part 5, 7th ed 2015 https://www.icao.int/publications/Documents/9303_p5_cons_en.pdf
- 3.1.1/3.2: front Zone I "Mandatory header"; II "Mandatory and optional personal data elements"; III "Mandatory and optional document data elements"; IV "Mandatory holder's signature or usual mark"; V "Mandatory identification feature" (portrait); back VI "Optional data elements"; VII "Mandatory Machine Readable Zone (MRZ)"
- 4.2.2 MRZ: L1 1–2 doc code (first A, C or I), 3–5 issuing State, 6–14 doc number, 15 check, 16–30 optional; L2 1–6 DOB, 7 check, 8 sex "F = female; M = male; < = nonspecified.", 9–14 expiry, 15 check, 16–18 nationality, 19–29 optional, 30 composite check; L3 name 30
- Note j: doc number >9 chars → overflow into optional field
- 4.2.2.3 "The name consists of primary and secondary identifiers which shall be separated by two filler characters (<<)."
- 4.2.4 composite covers L1 6–30, L2 1–7, 9–15, 19–29
## ICAO Doc 9303 Part 3, 8th ed 2021 https://icao.int/publications/Documents/9303_p3_cons_en.pdf
- 4.1 "MRTDs produced in accordance with Doc 9303 incorporate an MRZ to facilitate inspection of travel documents."; 4.2 mandatory, global interchange
- 4.8 date YYMMDD; 4.9 "modulus 10 with a continuously repetitive weighting of 731 731 ..." A–Z 10–35, '<' = 0; 4.10 filler '<'; 4.3 no diacritics

## RD 557/2011 repealed 20 May 2025 by RD 1155/2024 (BOE-A-2024-24099), new Reglamento de extranjería; TIE/NIE in Título XIII (not yet read)
## CAN: size and placement from the ICAO TR (§4.2: 6 digits, Zone III); purpose from the Policía Nacional developer guide (below). ICAO Doc 9303 Part 11 could not be read.

## Reg (EC) 1030/2002 consolidated 2017-11-21 https://eur-lex.europa.eu/eli/reg/2002/1030 (ELI .../2017-11-21)
- Art 4: biometrics "shall only be used for verifying:" (a) authenticity (b) identity
- Art 4a storage medium "containing the facial image and two fingerprint images of the holder"
- Art 5: NOT applicable to family members of Union citizens exercising free movement (→ those cards fall under Reg 2025/1208 art 6)
- Annex front: 1 3-letter country code in background; 2 ICAO e-MRTD chip symbol OVI; 3.1 title "Residence Permit"; 3.2 repeated in other EU language; 4.1 doc number; 4.2 repetition with special security features; 5 Card access number (CAN); 6 name; 7 sex; 8 nationality; 9 dob; 10 type of permit ("family member"...); 11 expiry; 12 remarks; 13 photo secured by DOVID; 14 signature; 15 DOVID
- Annex back: 16 remarks incl. 16.1 date and place of issue/issuing authority; 16.2 place of birth; 16.3 production info; 17 MRZ; 18 national emblem; 19 background text in MRZ area; 20 RF chip; 21 optional transparent window; 22 transparent border. Optional address with sub-heading (fn 9). (e) "The document number shall appear in more than one position". Security: offset, UV, rainbow printing (d); DOVID (f); laser engraving (g).

## AEPD FAQ-0116 https://www.aepd.es/preguntas-frecuentes/1-tus-derechos/3-identificacion-con-dni/FAQ-0116-que-puedo-hacer-si-me-solicitan-una-copia-del-dni
- "puede ocultar o proteger los datos no necesarios para la identificación" "como el número de soporte o el equipo de expedición"; "debe evitar enviarla por correo electrónico."
## AEPD nota 17 jun 2025 https://www.aepd.es/prensa-y-comunicacion/notas-de-prensa/aepd-informa-de-que-no-esta-permitido-solicitar-copia-dni-o-pasaporte-en-hospedajes
- "Documentos como el DNI incluyen información adicional a la requerida por la norma" "cuyo tratamiento incrementa el riesgo de suplantación de identidad." "el envío de una copia del documento no permite verificar con certeza la identidad de la persona que lo remite."
## INCIBE caso préstamo https://www.incibe.es/linea-de-ayuda-en-ciberseguridad/casos-reales/doble-fraude-al-solicitar-un-prestamo-y-perder-el-dinero-manteniendo-la-deuda
- "habría sido víctima de una suplantación de identidad solicitando un préstamo a su nombre"; "Nunca facilitar una copia o fotografía del DNI, y en los casos que sea ineludible, hacerlo de forma ofuscada"; "Pixelar la foto, la firma y/o cualquier otra información que no sea relevante."; "Usar una marca de agua con un texto encima del documento que indique el fin para el que se está autorizando."; Phishing Alert DGOJ (betting)

## dnielectronico Manual_de_Comandos_para_Desarrolladores_102.pdf ("Guía operativa para desarrolladores de aplicaciones tarjeta DNIe-DSCF 3.0", v1.0 rev 2, 22/08/2016)
- §5.1 p45: CAN "conocido por el portador del documento (información secreta) o que puede estar impreso en el documento y ser accesible visualmente"; password may be "a partir de la información MRZ, accesible visualmente desde el documento"; "PACE establece un canal securizado..."; prevents access "sin el consentimiento del portador de la tarjeta"; contactless requires PACE channel first; §4.6 MRZ or CAN as PACE password; §5.4 PACE with MRZ.
## dnielectronico REF_1001 Conceptos básicos (v.20260505): item 7 NFC smartphone; item 8 chip "contiene los mismos datos que aparecen impresos en la tarjeta (filiación, fotografía y firma digitalizada...)"; no historical/health/tax/criminal data.
## La Moncloa, nota Interior 20/12/2024 https://www.lamoncloa.gob.es/serviciosdeprensa/notasprensa/interior/paginas/2024/201224-diferencias-dni-nie-nif.aspx
- "¿Qué es el NIE?": "El Número de Identidad de Extranjero (NIE) es un número personal, único y exclusivo que identifica a los extranjeros"; "Esta cifra figura en todos los documentos que se les expiden o tramitan".
## AEPD nota 4 mar 2019 (orientaciones DA 7ª LOPDGDD) https://www.aepd.es/prensa-y-comunicacion/notas-de-prensa/la-aepd-publica-unas-orientaciones-para-la-publicacion-de
- "Previamente, esta identificación incluía el nombre, apellidos y número íntegro del DNI o documento análogo; sin embargo, para minimizar el impacto en la privacidad de los ciudadanos" "se debe publicar el nombre, apellidos y cuatro cifras aleatorias del documento oficial de identidad." Full guidance: https://www.aepd.es/documento/orientaciones-da7.pdf (NIE example ****4567*).
## Not reachable: RD 1155/2024 Título XIII (NIE/TIE); interior.gob.es NIE page (fetch refused, 2026-11-26); ICAO 9303 Part 11.
