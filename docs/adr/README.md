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
| [0010](0010-smart-field-finding.md) | Smart field finding: OCR text patterns and checks; results become ordinary undoable boxes | accepted, choice of kinds replaced by 0043 |
| [0011](0011-document-detection.md) | Document type detected from the MRZ after the photos; it only preselects the picker | accepted; screen order changed by 0012, DNI fallback by 0021, TIE fallback by 0028 |
| [0012](0012-automatic-straightening.md) | Automatic straightening: find, turn (sideways, upside down) and straighten both photos; corner screen only on request | accepted |
| [0013](0013-ci-pipeline.md) | CI split into small single-purpose jobs in logical stages; one required check | accepted; release job added by 0032; Rebase and merge by default (2026-11-27) |
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
| [0024](0024-visit-counter-in-isolated-frame.md) | Visit counts from a sandboxed frame on another site, start screen only; `frame-src` for that page only | superseded by 0027 |
| [0025](0025-intake-lockdown.md) | Intake lockdown: a stricter CSP while photos are in the page (exact build scripts, images from memory only, no connection); service worker check | accepted, completed by 0034, `sw.js` source added by 0037 |
| [0026](0026-recheck-cache-hits.md) | The service worker hashes every cache hit again; a rewritten entry is deleted and downloaded again | accepted, status answer amended by 0033 |
| [0027](0027-security-headers-from-the-host.md) | Security headers from the host: dnitapado.es on Cloudflare Workers with a generated `_headers`; the only host, GitHub Pages no longer deployed; no COEP; no analytics code, the host counts requests | accepted, amended by 0035 |
| [0028](0028-tie-fallback.md) | TIE preselected when detection reads the photos but cannot tell the document; nothing preselected without detection | accepted |
| [0029](0029-opt-in-usage-stats.md) | Opt-in usage stats from a photo-free thanks page: fixed list, sent only on a tap, Worker on `/stats` only, no IP stored; the app page keeps `connect-src 'none'` | accepted |
| [0030](0030-update-with-other-windows-open.md) | A new version takes over when every window is idle, or when the person presses Update now | accepted |
| [0031](0031-photo-file-checks.md) | Photo files checked by content (JPEG, PNG, WebP, HEIC), at most 25 MB and 50 MP from the header, before decoding | accepted |
| [0032](0032-semver-releases.md) | Automatic patch releases: version from the latest tag, tag and GitHub Release after the deploy, version in the footer | accepted |
| [0033](0033-ocr-ready-once-per-worker.md) | The page keeps the service worker's "OCR is ready" answer per worker; a new worker or a failed OCR job asks again; files are still hashed when served | accepted |
| [0034](0034-no-frames-no-fresh-webrtc.md) | No frames, no pop-ups: no new window brings back WebRTC; a frame that appears anyway is locked and removed; `webrtc 'block'` waits for browser support | accepted, fails closed since audit F-14 |
| [0035](0035-no-network-error-logging.md) | No Network Error Logging: `NEL: {"max_age":0}` on every file, NEL off in the zone settings, no `Report-To`; the post-deploy check fails otherwise | accepted |
| [0036](0036-visual-regression-in-pinned-container.md) | Screenshot tests (12 phone screens, Spanish and Arabic) run only in the Playwright Docker image pinned by digest, in CI and with `pnpm test:visual` | accepted |
| [0037](0037-firefox-service-worker-script-source.md) | `sw.js` by its exact address in the photo step's `script-src` and the OCR worker's `script-src` and `connect-src`, because Firefox checks responses the service worker builds as if they came from `sw.js` | proposed |
| [0038](0038-one-address-per-language.md) | One address per language: `/` is Spanish, `/<tag>` (such as `/en`) for the others; canonical per language; hreflang in the HTML and the sitemap (not for Valencian) | proposed |
| [0039](0039-articles.md) | Articles: Markdown per language, written by the build into static pages with no script; clean addresses sent as HTML; saved by the service worker on first visit; text under CC BY-SA 4.0 | proposed |
| [0040](0040-card-guide-pages.md) | Card guide pages: one static page per document, written by the build from the guide data, Spanish, `script-src 'none'`, served and precached by the service worker | proposed |
| [0041](0041-prerendered-start-screen.md) | Prerendered start screen: the Spanish start screen rendered from `App.svelte` into `index.html` at build time, inert until the app replaces it; no font preload | accepted |
| [0042](0042-axe-accessibility-scan.md) | Automatic accessibility scan: axe-core (dev dependency) on every screen, Spanish and Arabic, phone and wide screen; serious and critical findings fail | accepted |
| [0043](0043-one-field-list.md) | One field list: **Find automatically** covers what the field switches hide, with no list of its own; name and DNI/NIE number become fields (visible by default); the MRZ tells the dates apart | accepted |
| [0044](0044-language-pages.md) | Language pages: the build writes `<tag>.html` per language from the final `index.html` (own `lang`, head, canonical and prerendered start screen); host and service worker show it at `/<tag>` | proposed |
| [0045](0045-not-found-pages.md) | Not-found pages: a static `404.html` with no script in every folder people reach, in its language; host and service worker send the nearest one with status 404 | proposed |
| [0046](0046-structured-data.md) | Structured data: one JSON-LD data block (`WebApplication`, language-neutral) in the head of the start pages, written by the build; never run, so no CSP change; the one exception to "no inline scripts" | accepted |
