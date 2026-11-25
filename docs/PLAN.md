# dni-redactor v1: implementation plan

Status: scaffold, capture, homography, corner editor (step 2), i18n and DNI 4.0 zone data done. CI (`pnpm verify`) and GitHub Pages deploy from `master` done (`.github/workflows/ci.yml`, first part of step 11). Secure raster and PDF engines done (`src/engine/`, not wired to the UI yet). UI on Svelte 5, pnpm 12, Node 26 ([ADR 0003](adr/0003-svelte-vite-pnpm.md)). Editor done: fields to hide (DNI 4.0), live preview through the secure render path, watermark, greyscale, review, PDF download, reset. Next: manual boxes with undo/redo, zoom, one-page layout.

Target specification since 2026-11-25: the identity-privacy master prompt (Svelte 5, pnpm, 31 locales, offline, OCR, PDF only). Where it differs from this plan, the specification wins, except where an ADR in `docs/adr/` records a deviation.

## Order (spec §12)

| # | Step | Main modules | Tests written with it |
|---|------|--------------|-----------------------|
| 1 | Capture: file input (front/back), drag-and-drop, paste, decode via `createImageBitmap`, clear error for undecodable HEIC | `src/capture/` | unit: MIME/decode error mapping; e2e: load synthetic fixture |
| 2 | Align: 4-corner quad editor, homography (DLT, 8×8 Gaussian elimination) in plain TS, warp to 1712 × 1080 | `src/geometry/`, `src/ui/` | unit: homography round-trip, known squares, degenerate quads |
| 3 | Zones + redaction: `src/zones/dni.ts` data, solid opaque fills on the warped canvas | `src/zones/`, `src/redact/` | unit: normalised → pixel conversion; redaction pixel test |
| 4 | Manual editor: move/resize/add/delete, pointer events, keyboard | `src/ui/editor` | unit: rect maths; e2e: keyboard + pointer |
| 5 | Watermark: mandatory purpose text, optional date, diagonal tiled, optional B/W | `src/redact/watermark` | unit: tile layout covers every 1/4-card crop |
| 6 | Export: PNG/JPEG per side, PDF (A4, 85.60 × 53.98 mm per side), EXIF stripped via canvas re-encode | `src/export/` | redaction, PDF-image-count, EXIF tests |
| 7 | Share: Web Share API with files, download fallback | `src/export/share` | e2e with stubbed `navigator.share` |
| 8 | Cleanup: Clear button, after export, `pagehide` | `src/state` | unit: all canvases 0×0, URLs revoked |
| 9 | PWA: manifest, versioned app-shell SW | `src/sw.ts` | e2e: offline reload |
| 10 | Hardening: CSP / SRI / TT (already in scaffold), lint bans | `scripts/` | e2e: network test over full flow |
| 11 | CI/CD: CI, release, Pages, attestations, checksums, Scorecard, CodeQL, Dependabot, DCO | `.github/` | |
| 12 | Docs: README (es/en), PRIVACY, SECURITY, VERIFY, CONTRIBUTING, THIRD_PARTY_NOTICES | | |

## What the scaffold already enforces

- TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- Vite: `minify: false`, `sourcemap: true`, `base: './'`, no module-preload polyfill (it is an inline script).
- Build plugin injects the §5.1 CSP and `referrer=no-referrer` right after `<meta charset>`; CSP lives in one file (`scripts/csp.ts`) shared with the e2e test.
- Build plugin adds `integrity="sha384-…"` to every local script and stylesheet.
- ESLint bans `eval`, `new Function`, `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`, and `localStorage`/`sessionStorage`/`indexedDB`.
- Playwright runs against `vite preview` (production build) and checks: exact CSP, referrer, SRI on all assets, no inline script/style, no CSP/TT violations, no non-self requests.
- `.npmrc`: `ignore-scripts=true`, `save-exact=true`.

## Decisions

1. **Zone-coordinate source** (blocks step 3): official DNI 4.0 specimen on dnielectronico.es, read in Alexis's browser.
2. **Run-from-disk zip**: dropped (2026-11-24, confirmed 2026-11-25, Alexis). One build, with SRI. Offline use = load once, then disable the network. See [ADR 0002](adr/0002-no-standalone-release.md).
3. **PDF library**: `@cantoo/pdf-lib` (2026-11-25), see [ADR 0001](adr/0001-pdf-library.md).
4. **Service worker vs `connect-src 'none'`**: to be tested at step 9. Will report before changing the CSP.
5. **Repository**: github.com/aasanchez/dnilimpio.es (from the local git origin). Default branch stays `master`; branch protection goes on `master`.
6. **Languages**: es (source), ca, ca-ES-valencia, gl, eu, en, fr, nl, sv, fi, uk, ro, ar. Arabic is Modern Standard Arabic (Darija has no standard written form); `dir="rtl"` is set from the language. JSON per language in `src/i18n/locales/`, managed with Crowdin through its GitHub integration (`crowdin.yml`). All languages are bundled; the app makes no request to Crowdin and the CSP is unchanged. All non-Spanish strings except English are drafts for native review in Crowdin.

7. **Code style**: neostandard 0.14.1 (the maintained successor of standard / ts-standard: ESLint flat config, typescript-eslint, @stylistic). Layered with typescript-eslint `strictTypeChecked` and the project bans. `pnpm format` formats.

## Dev dependencies (all named in the spec, versions pinned exactly)

vite 8.3.8, typescript 6.0.3 (typescript-eslint does not support TS 7 yet), vitest 5.1.1, @playwright/test 1.63.0 (matches the installed browser), eslint 10.15.0, neostandard 0.14.1, typescript-eslint 8.74.0, @types/node 22. No runtime dependencies.

## NIE / TIE (added to scope 2026-11-24, overrides spec §10)

- **TIE** (Tarjeta de Identidad de Extranjero) is an ID-1 card: same capture, alignment and redaction pipeline as the DNI. Needs its own zone file measured on an official specimen (Policía Nacional / PRADO), with CAN and MRZ like the DNI.
- **NIE for EU citizens** is usually the *Certificado de Registro de Ciudadano de la Unión* (green paper, A4 or folded card size), not an ID-1 card. Needs a document-type step and a second working size/aspect ratio for alignment.
- The NIE number itself appears on both; it stays visible (like the DNI number).

Order of work, changed:
1. Finish the DNI flow end to end (corner editor, redaction, manual editor, watermark, export) so the pipeline is proven once.
2. Generalise: document-type selector (DNI 4.0, TIE, EU registration certificate), per-document size, zone files under `src/zones/` (one per document), and document-neutral UI strings.
3. Measure TIE zones, then EU certificate zones, each from an official specimen, with the same method as `docs/ZONES.md`.
4. Continue with share, cleanup, PWA, hardening, CI/CD (branch protection on `master`), docs.
