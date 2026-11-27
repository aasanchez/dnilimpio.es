# 0009. On-device OCR with Tesseract.js

- Status: accepted; engine replaced by [0019](0019-ppocr-and-text-detection.md) (the rest stands)
- Date: 2026-11-25
- Decided by: Alexis ("Detection now, OCR as next PR"; AI libraries acceptable if images never leave the device)

## Context

The spec asks for OCR (reading the MRZ and printed fields). Alexis's rules: online first, offline
optional; every feature works in both modes, and when one cannot run it is disabled and the user
falls back to the manual path, never a random error. Images must never leave the device.

## Decision

- Use Tesseract.js 7 (Apache-2.0), with the LSTM engine only and the Spanish `best_int` model.
- Self-host every OCR file under `ocr/` on our own origin, never a CDN: the worker script, three
  WebAssembly builds (the browser uses the one it supports) and the language data, about 8 MB on first
  use. The language data is shipped uncompressed, so no server can change its bytes with
  `Content-Encoding`.
- The files are not part of the first page load and are not saved at install. The service worker
  lists them as on-demand files with their SHA-384. On first use the page asks the service worker to
  `prepare` them; it downloads each with `fetch({ integrity })` and keeps it. After that, OCR works
  offline. A later build keeps files whose bytes did not change.
- OCR runs only when a service worker controls the page, because the service worker is what checks
  the files. `ocrStatus()` returns `ready`, `download` (with the size) or `unavailable` (`offline`,
  `no-service-worker`, `unsupported`), so the interface can disable OCR and keep the manual path.
- Trusted Types: Tesseract.js starts its worker with `new Worker(url)`, a string. The CSP now allows one
  policy named `default` (it was `dnilimpio-sw`, [ADR 0004](0004-offline-service-worker.md)). It
  accepts exactly two URLs, `sw.js` and `ocr/worker.min.js`, and defines nothing for HTML or script
  strings. The page creates it first thing at start-up, so no other code can create it.
- `connect-src 'none'` and `script-src 'self'` do not change. The OCR worker is a same-origin script
  file, not a `blob:` URL; its own requests are answered by the service worker. Tesseract's
  IndexedDB cache is off (`cacheMethod: 'none'`).
- The OCR worker has its own CSP (added after the security audit of 2026-11-25, finding SEC-003). A
  Web Worker does not inherit the page's CSP: it takes the policy of its script's response, and
  GitHub Pages sends no headers, so the worker had no policy at all. The service worker now adds a
  `Content-Security-Policy` header when it serves `ocr/worker.min.js` (`workerCsp()` in
  `src/offline/precache.ts`): `default-src 'none'`, scripts and `fetch()` only from `ocr/`, and
  `'wasm-unsafe-eval'` for the engine's WebAssembly. Since OCR never runs without the service worker,
  the policy always applies. An e2e test runs `fetch()` inside the worker and checks that only `ocr/`
  is reachable.
- Memory (added after the security audit of 2026-11-25, finding SEC-005): the job queue only records
  that the last job settled and never holds a result. `stopOcr()` ends the worker, which keeps the
  last image it read, and makes queued or running jobs end with `OcrStopped`, so a late result is
  dropped. Clearing everything (Start over, Download and clear, Share and clear) calls it (`stopOcrIfLoaded()`, which never loads OCR just to stop it).
- MRZ reading (`src/ocr/mrz.ts`, ICAO 9303 TD1) is plain TypeScript and fully unit tested: check
  digits, document code (`ID` for DNI, `IR` for TIE), and correction of one common OCR confusion in
  the document number when exactly one fix passes both the number and the composite check digits.

## Consequences

- First OCR use downloads about 8 MB from our own site. Users who never use OCR never download it.
- OCR is unavailable in browsers or modes without a service worker (for example some private windows).
  The manual path always remains.
- The interface does not call OCR yet. The redesign and the smart field finding PR will use
  `loadOcr()` from `src/ocr/load-ocr.ts`.
