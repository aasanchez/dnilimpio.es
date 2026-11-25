# 0007. Find the card's corners with a small on-device model

- Status: accepted
- Date: 2026-11-25

## Context

On step 2 the user drags four circles onto the card's corners. On a cluttered photo (a desk, a
patterned tablecloth, papers around the card) this takes time, especially on a phone. The project
wants AI features where they help, under three rules: photos never leave the device, the app works
online and offline, and a feature that cannot run is switched off quietly in favour of the manual
path, never shown as an error. The first load must stay small (about 64 kB of JavaScript, gzipped).

The page's CSP blocks every connection (`connect-src 'none'`) and allows scripts only from its own
origin. WebAssembly needs `'wasm-unsafe-eval'` in `script-src`.

Alexis chose this option on 2026-11-25, out of three proposed (see Alternatives).

## Decision

- Model: **DocCornerNet LEAN**, from the npm package `scanic-ml` 0.2.0 (MIT, by the author of
  [scanic](https://github.com/marquaye/scanic), based on
  [DocCornerNet](https://github.com/mapo80/DocCornerNet-CoordClass), MIT). A 456 K-parameter
  MobileNetV2 corner detector: input 224 × 224 RGB, output four corners and a "document present"
  score. Published accuracy: median corner error 2.3 px at 224 px, IoU 0.89.
- Runtime: `onnxruntime-web` 1.27.0 (MIT), its build without embedded WebAssembly, with
  `scanic-ml`'s minimal WebAssembly build (only this model's ~18 operators, 1.5 MB instead of 13 MB).
  One thread: more threads need cross-origin isolation, which GitHub Pages cannot set.
- Two passes per photo: the whole photo, then a closer look at the area around the first answer.
  The second pass is free (about 15 ms) and in our tests cut the worst corner error on cluttered
  photos from 67 px to under 15 px (1600 × 1200 photos).
- Every answer is checked before use (`src/detect/result.ts`): score of at least 0.5, convex, at
  least 4 % of the photo, inside the photo. Otherwise it is dropped.
- **Loading.** Nothing is in the first load. Choosing a photo starts loading the model in the
  background, so it is usually ready on the corners step. The model and the WebAssembly binary are
  embedded as base64 in a script module (`?base64` imports, `scripts/vite-plugins.ts`), because the
  page cannot `fetch()` (`connect-src 'none'` stays). That module and the runtime's loader are listed
  in the import map with their SHA-384, like the PDF chunk. Everything goes to `assets/ml/`.
- **Offline.** The service worker does not download `assets/ml/` at install. The first time the page
  loads one of those files, the worker fetches it checked against its build-time hash and keeps it.
  A new build copies the kept files whose names (content hashes) did not change.
- **Fallback.** Any failure (offline before first use, no WebAssembly, a refused file, a low score)
  leaves the corners at their manual start position, with no message. The detector list in
  `src/detect/corners.ts` is ordered, so the classical edge detector can follow the model.
- The model never overrides the user: once a corner is moved, rotated or reset, a late answer is
  ignored. When the model places the corners, a status line says so and asks the user to check.
- **CSP change:** `script-src 'self'` becomes `script-src 'self' 'wasm-unsafe-eval'`.

## Alternatives

- **Same model with a small runtime written in TypeScript.** No CSP change and about 1.7 MB, but
  roughly 0.3 to 1 s per photo on a phone instead of about 15 to 60 ms, and an inference engine for us
  to maintain.
- **No model, classical edge detection only.** No download, but weak on cluttered backgrounds,
  which is the case this feature is for.
- **Stock `onnxruntime-web` or TensorFlow.js.** 10+ MB of runtime for one small model.
- **Fetch the files** (`connect-src 'self'`). Smaller (raw bytes instead of base64), but it would let
  the page send requests to its own origin. Keeping `connect-src 'none'` is worth the 15 % size.
- **A segmentation model (mask, then corners).** Larger and needs its own corner fitting; a direct
  corner model gives the editor exactly what it needs.

## Consequences

- About 2.6 MB (gzipped) loaded once per device on first use, then from the cache. The first load
  grows by about 1.2 kB.
- `'wasm-unsafe-eval'` allows the page to compile WebAssembly. It does not allow `eval()` or
  `new Function()`, and the only WebAssembly the page has comes from a script checked by its hash.
- Known weak spot: a light card whose corner lies on white paper can get one corner wrong. The user
  sees and fixes it on the same screen.
- Training data is DocCornerDataset (documents in general, not only Spanish IDs). Accuracy on real
  DNI photos should be checked on devices; the threshold lives in `src/detect/result.ts`.
- Tests: `tests/unit/detect.test.ts` (answer checks), `tests/e2e/corners.spec.ts` (real model under
  the real CSP; three generated cluttered photos, each corner within 32 px; manual fallback; the user
  is never overridden), and `tests/e2e/offline.spec.ts` (not downloaded at install, kept after first
  use and then working offline, silent fallback offline before first use, a tampered model refused).
