# 0001. PDF export with `@cantoo/pdf-lib`

- Status: accepted
- Date: 2026-11-25
- Decided by: Alexis (asked for "a third-party library, the best one"); library chosen by evaluation below.

## Context

PDF is the only export format (spec §16). The PDF must contain only new, sanitised rasters: no source
image, no text, no annotations, no metadata. The library runs in the browser, offline, under a CSP with
`connect-src 'none'`, and must be compatible with AGPL-3.0-or-later.

## Candidates (measured 2026-11-25)

Bundle sizes: esbuild, minified, browser ESM, code that embeds one JPEG on an A4 page.

| Library | Version | Last release | Licence | Size (min / gzip) | Notes |
|---|---|---|---|---|---|
| **@cantoo/pdf-lib** | 2.11.1 | 2026-09-15 | MIT | 597 kB / 252 kB | Maintained fork of pdf-lib. Can omit the Info dictionary. No network code in the bundle. |
| pdf-lib | 1.17.1 | 2021 (registry entry modified 2022) | MIT | 524 kB / 208 kB | Unmaintained: no security fixes. |
| jsPDF | 4.2.1 | 2026-03-17 | MIT | 821 kB / 249 kB | Bundle includes `fetch` and `XMLHttpRequest` file loaders; writes an Info dictionary (producer, creation date) and a file ID by default. |
| PDFKit | 0.21.0 | 2026-11-20 | MIT | not measured | Built on Node streams; needs a browser build and pulls in fontkit and crypto libraries. |

## Decision

Use `@cantoo/pdf-lib`, pinned to an exact version.

- `PDFDocument.create({ updateMetadata: false })`: no Info dictionary (no producer, creator or dates).
- `save({ useObjectStreams: false })`: every object stays readable as plain text for audits.
- The library embeds JPEG bytes unchanged, so `src/engine/jpeg.ts` first rebuilds each JPEG with only
  the segments a decoder needs (DQT, DHT, DRI, SOF0–2, SOS, EOI). EXIF, GPS, thumbnails, ICC, XMP and
  comments cannot reach the PDF, whatever the browser's encoder wrote.

## Consequences

- First runtime dependency (plus `tslib`, `fflate`, `culori`, `html-entities`, `node-html-better-parser`).
  It is loaded only by the export code.
- A fork has a smaller maintainer group than the original project. Mitigations: exact pin, lockfile,
  and `tests/unit/pdf.test.ts`, which inspects the produced file object by object (page count,
  only DCT images, embedded bytes equal the filtered JPEG, no metadata keys, no fonts, no
  annotations, no text operators, deterministic output). A library update that changes the output
  fails those tests.
- If the fork stops being maintained, jsPDF is the fallback; it would need its Info dictionary and file
  ID overwritten, and the same tests would apply.
