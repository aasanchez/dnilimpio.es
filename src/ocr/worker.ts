// SPDX-License-Identifier: AGPL-3.0-or-later
// OCR Web Worker: PP-OCRv6 tiny (PaddleOCR, Apache-2.0) run by paddleocr.js (MIT) on ONNX Runtime
// Web (MIT), all from our own site (ocr/). The build bundles this file to ocr/worker.min.js.
//
// The page sends the pixels of one image; the worker finds the text lines (detection model), reads
// each line (recognition model) and answers with the lines and their boxes. Nothing is stored: the
// pixels are zeroed after each read and the text goes back only to the page.
//
// The service worker serves this script with its own CSP (workerCsp() in src/offline/precache.ts):
// it may load scripts and data only from ocr/ (and sw.js, for Firefox: ADR 0037), so it can send nothing anywhere.

import * as ort from 'onnxruntime-web/wasm'
import { PaddleOcrService } from 'paddleocr'
import { MODEL_FILES, type Reply, type Request } from './protocol.ts'
import { wordSpans } from './spans.ts'

interface Scope { postMessage: (m: Reply) => void; onmessage: ((e: MessageEvent<Request>) => void) | null; location: { href: string } }
const scope = self as unknown as Scope

let service: Promise<PaddleOcrService> | null = null

async function bytes (url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OCR file missing: ${url}`)
  return await res.arrayBuffer()
}

function load (): Promise<PaddleOcrService> {
  service ??= (async () => {
    const base = new URL('./', scope.location.href).href
    ort.env.logLevel = 'error'
    ort.env.wasm.numThreads = 1 // threads need cross-origin isolation, which the site does not turn on (no COEP, ADR 0027)
    ort.env.wasm.proxy = false
    ort.env.wasm.wasmPaths = { mjs: `${base}${MODEL_FILES.ortGlue}`, wasm: `${base}${MODEL_FILES.ortWasm}` }
    const [det, rec, dict] = await Promise.all([
      bytes(`${base}${MODEL_FILES.det}`),
      bytes(`${base}${MODEL_FILES.rec}`),
      fetch(`${base}${MODEL_FILES.dict}`).then(async (r) => (r.ok ? await r.json() as unknown : null)),
    ])
    if (!Array.isArray(dict) || !dict.every((c) => typeof c === 'string')) throw new Error('OCR dictionary unreadable')
    return await PaddleOcrService.createInstance({
      ort: ort as never,
      modelPreset: 'PP-OCRv6_tiny',
      detection: { modelBuffer: det },
      recognition: { modelBuffer: rec, charactersDictionary: dict },
    })
  })().catch((e: unknown) => {
    service = null
    throw e
  })
  return service
}

scope.onmessage = (e) => {
  const msg = e.data as Partial<Request>
  if (msg.type !== 'read' || !(msg.data instanceof ArrayBuffer) || typeof msg.id !== 'number' || typeof msg.width !== 'number' || typeof msg.height !== 'number') return
  const { id, width, height } = msg
  const pixels = new Uint8Array(msg.data)
  void (async () => {
    try {
      const ocr = await load()
      const raw = await ocr.recognize({ width, height, data: pixels })
      const lines = raw.map((r) => {
        const box = { x: r.box.x, y: r.box.y, w: r.box.width, h: r.box.height }
        const words = r.text.trim().split(/\s+/).filter((t) => t !== '').length
        return { text: r.text, confidence: r.confidence, ...box, spans: wordSpans(pixels, width, height, box, words) ?? undefined }
      })
      scope.postMessage({ type: 'lines', id, lines })
    } catch (err) {
      scope.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
    } finally {
      pixels.fill(0)
    }
  })()
}
