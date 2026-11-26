# 0019. PP-OCRv6 tiny replaces Tesseract; the card's printed text helps detect the document

- Status: accepted
- Date: 2026-11-26
- Changes: [0009](0009-on-device-ocr.md) (engine), [0011](0011-document-detection.md) (method)
- Decided by: Alexis (asked for OCR "like runonweb.ai/models/ocr" that also tells the card type;
  chose "PP-OCRv6 tiny replaces Tesseract" over "small" and "keep Tesseract")

## Context

Detection read only the MRZ on the back ([ADR 0011](0011-document-detection.md)), with Tesseract.js
([ADR 0009](0009-on-device-ocr.md)). Tesseract is not trained on the MRZ font (OCR-B) and finds text
lines poorly on photos. When the MRZ dates fit both DNI versions, or no MRZ was read, the person had
to choose.

runonweb.ai runs PP-OCRv6 (PaddleOCR, Apache-2.0) in the browser through its `runonweb` package. That
package loads the models from huggingface.co and the runtime from cdn.jsdelivr.net at run time, which
breaks our CSP and the self-hosting rule, so it is not used. The same models run through
`paddleocr` (paddleocr.js, MIT) on `onnxruntime-web` (MIT), with every file served from our site.

PP-OCRv6 sizes (PaddlePaddle on Hugging Face, published June 2026): tiny 6.2 MB (detection 1.8 MB,
recognition 4.5 MB), small 31 MB, medium 139 MB. Tiny's dictionary includes Ñ, the accented capitals
and the MRZ filler `<`.

## Comparison

Synthetic photos of card fronts laid out like the specimens and backs with a valid TD1 MRZ, all with
fictional data, 12 per type: guilloche-like background, card 480 to 1100 px wide, blur, noise, a
lighting gradient and JPEG compression, then scaled back to 1712 × 1080 as the straightening does.
Tesseract with the app's settings (Spanish `best_int`, MRZ whitelist on the back), PP-OCRv6 tiny with
its defaults. Node, one thread.

| Task | Tesseract | PP-OCRv6 tiny |
|---|---|---|
| MRZ read with every check digit valid (DNI and TIE backs) | 7 / 24 | 24 / 24 |
| Document type from the front text (DNI 4.0, DNI 3.0, TIE) | 31 / 36 | 34 / 36 |
| Time per image | about 0.5 s | about 2 s |

Not yet measured on photos of real cards; the confirmation step and the manual picker stay.

## Decision

- **Engine.** PP-OCRv6 tiny (detection and recognition) through paddleocr.js on ONNX Runtime Web's
  WebAssembly build (SIMD, one thread: threads need cross-origin isolation, which GitHub Pages cannot
  set). Tesseract.js, its language data and `wasm-feature-detect` are removed.
- **Files**, all under `ocr/` and written by the build (`ocrAssets()` in `scripts/vite-plugins.ts`):
  `worker.min.js` (`src/ocr/worker.ts` bundled on its own, so it imports nothing from outside `ocr/`),
  `ort-wasm-simd-threaded.mjs` and `.wasm`, the two models and the dictionary as JSON. The models come
  from the npm package `@arcships/light-ocr-model-ppocrv6-tiny` 0.1.0 (Apache-2.0); the build fails
  unless each matches the SHA-256 that PaddlePaddle publishes on Hugging Face. About 9 MB compressed
  on first use (8 MB before). Everything else from ADR 0009 stays: on-demand files with SHA-384 in the
  service worker, the worker's own CSP (scripts and `fetch()` only from `ocr/`), the Trusted Types
  policy, `ocrStatus()`, `stopOcr()`.
- **Worker.** The page sends the pixels of one canvas (moved, not copied); the worker answers with the
  text lines and their boxes and zeroes the pixels. PP-OCR returns line boxes. Word boxes, which
  smart field finding turns into black boxes, are measured in the worker from the ink: gaps wider than
  30 % of the line height split words (`src/ocr/spans.ts`), used only when the count matches the
  recognised words. Otherwise they are estimated from character offsets and made conservative: from
  half the estimated start to one and a half times the estimated end, within the line
  (`src/ocr/lines.ts`), so a proportional font cannot leave part of a number uncovered. A browser
  without WebAssembly SIMD reports OCR as unavailable.
- **Detection** (`src/detect/doc-text.ts`, pure). After the MRZ, when it leaves the answer open, the
  straightened front is read (then the card turned 180°, then the back in case the photos were
  swapped), and the text is scored against markers taken from the specimens: "PERMISO DE RESIDENCIA",
  "TARJETA DE RESIDENCIA", "RESIDENCE PERMIT", "TITRE DE SEJOUR", "TIPO DE PERMISO", an NIE number →
  TIE; "DOCUMENTO NACIONAL DE IDENTIDAD" → DNI; "REINO DE ESPAÑA", "NATIONAL IDENTITY CARD",
  "EMISIÓN", "NUM SOPORTE" and the DNI number at the top → DNI 4.0; "NUM SOPORT" and the DNI number
  at the bottom → DNI 3.0. Phrases allow one misread per 7 characters. A model the MRZ names always
  wins; the text fills in the DNI version, or the whole guess when no MRZ was read. When they disagree
  on the kind, the MRZ stands.
- **Privacy.** The text read stays in memory, in the function that classifies it, and is neither
  stored nor logged. Only the guess (document type) is kept per photo.

## Consequences

- MRZ reads and detection are much more reliable; each read takes a few seconds on a phone.
- First OCR use downloads about 9 MB from our own site; the bundle-size budget for `ocr/` is raised.
- The front read costs one more OCR pass, only when the MRZ leaves the answer open.
- Not measured on real cards yet. A photo of a real card is never committed or quoted.
