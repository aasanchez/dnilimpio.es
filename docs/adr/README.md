# Architecture decision records

One file per decision that is costly to reverse. Format: context, decision, alternatives, consequences.
Status is `accepted`, `superseded by NNNN` or `deviates from spec §N` (when a decision overrides the
project specification on purpose).

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-pdf-library.md) | PDF export with `@cantoo/pdf-lib` | accepted |
| [0002](0002-no-standalone-release.md) | No standalone offline release | accepted, deviates from spec §25 |
| [0003](0003-svelte-vite-pnpm.md) | Svelte 5 + Vite; Node.js and pnpm pinned to latest stable | accepted |
| [0004](0004-offline-service-worker.md) | Offline mode with a verified service worker; one Trusted Types policy for its URL | accepted |
| [0005](0005-guided-flow-and-visual-style.md) | Guided phone-first flow; openaggregator.io-style visuals with self-hosted fonts | accepted |
| [0006](0006-document-types.md) | Several document types (DNI 4.0, DNI 3.0, TIE), chosen by the user | accepted; screen order changed by 0011, picker by 0021 |
| [0007](0007-corner-model.md) | Find the card's corners with a small on-device model (DocCornerNet + minimal ONNX Runtime); CSP adds `'wasm-unsafe-eval'` | accepted |
| [0008](0008-capture-coach.md) | Capture coach: live tips and automatic shot from classical image metrics, no model | accepted |
| [0009](0009-on-device-ocr.md) | On-device OCR with Tesseract.js, self-hosted, on demand; Trusted Types policy `default` | accepted; engine replaced by 0019 |
| [0010](0010-smart-field-finding.md) | Smart field finding: OCR text patterns and checks; results become ordinary undoable boxes | accepted |
| [0011](0011-document-detection.md) | Document type detected from the MRZ after the photos; it only preselects the picker | accepted; screen order changed by 0012, DNI fallback by 0021 |
| [0012](0012-automatic-straightening.md) | Automatic straightening: find, turn (sideways, upside down) and straighten both photos; corner screen only on request | accepted |
| [0013](0013-ci-pipeline.md) | CI split into small single-purpose jobs in logical stages; one required check | accepted |
| [0014](0014-card-guide.md) | Card guide: every element explained with official citations; no source, no claim | accepted |
| [0015](0015-cookieless-analytics.md) | Cookieless visit counts with Cloudflare Web Analytics, public site only | superseded by 0023 |
| [0016](0016-source-maps-in-devtools.md) | Source maps readable in the developer tools: `connect-src 'self'`; the service worker serves only this build's maps | superseded by 0022 |
| [0017](0017-tailwind-css.md) | Styles with Tailwind CSS v4 (build time only, palette as theme); two-column layout on wide screens | accepted |
| [0018](0018-installable-app.md) | Installable app: relative manifest, maskable and Apple icons, install link only where the browser supports it | accepted |
| [0019](0019-ppocr-and-text-detection.md) | PP-OCRv6 tiny replaces Tesseract; the front's printed text helps detect the document | accepted |
| [0020](0020-fit-boxes-to-text.md) | Fit to the text: ticked field boxes grow to cover the words OCR finds; never shrink | accepted |
| [0021](0021-one-dni-choice.md) | One "DNI" choice: the version is detected, 4.0 as fallback, Older DNI (3.0) switch in the editor | accepted |
| [0022](0022-no-published-source-maps.md) | No published source maps; `connect-src` without `'self'` (PRIV-003) | accepted |
| [0023](0023-no-third-party-script-with-photos.md) | No third-party script in the page that holds the photos: beacon removed, `connect-src 'none'` | accepted |
