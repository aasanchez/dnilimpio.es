// SPDX-License-Identifier: AGPL-3.0-or-later
// What the page and the OCR worker (worker.ts) share: the file names in ocr/ and the messages.
// No imports, so the page's OCR module does not pull the engine in.

/** Files in ocr/, written by the build (scripts/vite-plugins.ts). */
export const MODEL_FILES = {
  det: 'ppocrv6-tiny-det.onnx',
  rec: 'ppocrv6-tiny-rec.onnx',
  dict: 'ppocrv6-tiny-dict.json',
  ortGlue: 'ort-wasm-simd-threaded.mjs',
  ortWasm: 'ort-wasm-simd-threaded.wasm',
} as const

export type Request =
  | { readonly type: 'read'; readonly id: number; readonly width: number; readonly height: number; readonly data: ArrayBuffer }

/**
 * One recognised line and its box in the image's pixels. `spans`: where each word is, measured from the
 * ink (spans.ts), present only when the ink splits into exactly as many runs as the text has words.
 */
export interface WireLine {
  readonly text: string
  readonly confidence: number
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly spans?: ReadonlyArray<{ readonly x0: number; readonly x1: number }> | undefined
}

export type Reply =
  | { readonly type: 'lines'; readonly id: number; readonly lines: readonly WireLine[] }
  | { readonly type: 'error'; readonly id: number; readonly message: string }
