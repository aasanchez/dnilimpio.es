# dni-redactor v1: implementation plan

Status: scaffold done. Redaction work blocked on zone-coordinate source (step 3).

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

## Open decisions

1. **Zone-coordinate source** (blocks step 3). See thread.
2. **SRI vs "dist zip works from disk"** (§5.2 vs §7). Verified in Chromium 1.63: from `file://`, module scripts and `crossorigin` assets are blocked by CORS (origin `null`), and any `integrity` attribute blocks the asset ("requires the request to be CORS enabled"). A classic `<script defer>` with no `crossorigin` and no `integrity` works, and the CSP still applies. Proposal: two outputs from one commit. `dist/` (Pages, module + SRI) and `dist-local/` (classic script, single bundle, no SRI; integrity comes from the release checksums and provenance attestation). Both reproducible and both covered by the e2e suite.
3. **PDF library**: proposal is no library. A ~150-line PDF writer that embeds one raw RGB image per side with `FlateDecode` (via the browser's `CompressionStream('deflate')`) at exact mm size on A4. Lossless, so the redaction pixel test needs no JPEG tolerance, and "exactly one image per side" is obvious from the code. Fallback if rejected: `pdf-lib` vs `jsPDF` size comparison.
4. **Service worker vs `connect-src 'none'`**: to be tested at step 9. Will report before changing the CSP.
5. **Repository**: none linked yet. `REPO_URL` env var feeds the "Código fuente" link; placeholder until chosen.

## Dev dependencies (all named in the spec, versions pinned exactly)

vite 8.3.8, typescript 6.0.3 (typescript-eslint does not support TS 7 yet), vitest 5.1.1, @playwright/test 1.63.0 (matches the installed browser), eslint 10.15.0, @eslint/js 10.0.1, typescript-eslint 8.74.0, @types/node 22. No runtime dependencies.
