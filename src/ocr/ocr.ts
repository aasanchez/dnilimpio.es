// SPDX-License-Identifier: AGPL-3.0-or-later
// On-device OCR with Tesseract.js. Nothing leaves the device: the image goes to a Web Worker on this
// page, and the engine and language data come from our own site (ocr/), never from a CDN.
// The service worker downloads those files on first use, checks each against the build's SHA-384
// and keeps them, so OCR also works offline afterwards.
//
// Rule (online first, offline optional): OCR is only offered when it can run. ocrStatus() says
// whether it is ready, needs a download, or is unavailable; callers then hide or disable it and
// the user does that step by hand. recognise() never runs without the service worker, because the
// worker is what checks the integrity of the OCR files.
//
// This module is loaded on demand (its own chunk): the first page load does not include Tesseract.js.

import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import { relaxedSimd, simd } from 'wasm-feature-detect'
import { MRZ_CHARS, parseMrz, type Mrz } from './mrz.ts'

/** Approximate first download in MB: worker (0.1), one WebAssembly build (3.9) and the Spanish data (3.4). */
export const OCR_DOWNLOAD_MB = 8

export type OcrStatus =
  | { readonly state: 'ready' }
  | { readonly state: 'download'; readonly megabytes: number }
  | { readonly state: 'unavailable'; readonly reason: 'no-service-worker' | 'offline' | 'unsupported' }

const base = (): string => new URL('ocr/', document.baseURI).href
const LANG_FILE = 'spa.traineddata'

/** The WebAssembly build for this browser (LSTM only), as the Tesseract.js worker would pick it. */
async function coreFile (): Promise<string> {
  if (await relaxedSimd()) return 'tesseract-core-relaxedsimd-lstm.wasm.js'
  if (await simd()) return 'tesseract-core-simd-lstm.wasm.js'
  return 'tesseract-core-lstm.wasm.js'
}

/**
 * Asks the service worker to download and check the files OCR needs, so a missing network or a file
 * that fails its integrity check is one clear error now instead of a stalled worker later.
 */
async function prepare (paths: readonly string[]): Promise<void> {
  const controller = navigator.serviceWorker.controller
  if (!controller) throw new Error('OCR unavailable: no-service-worker')
  const { port1, port2 } = new MessageChannel()
  const reply = new Promise<{ ok: boolean; error?: string }>((resolve) => { port1.onmessage = (e) => { resolve(e.data as { ok: boolean; error?: string }) } })
  controller.postMessage({ type: 'prepare', paths: paths.map((p) => `ocr/${p}`) }, [port2])
  const r = await reply
  port1.close()
  if (!r.ok) throw new Error(`OCR files unavailable: ${r.error ?? 'unknown error'}`)
}

/** Whether OCR can run now, without starting it. */
export async function ocrStatus (): Promise<OcrStatus> {
  if (typeof WebAssembly !== 'object' || typeof Worker === 'undefined') return { state: 'unavailable', reason: 'unsupported' }
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return { state: 'unavailable', reason: 'no-service-worker' }
  const cached = await caches.match(`${base()}${LANG_FILE}`).catch(() => undefined)
  if (cached) return { state: 'ready' }
  return navigator.onLine ? { state: 'download', megabytes: OCR_DOWNLOAD_MB } : { state: 'unavailable', reason: 'offline' }
}

let pending: Promise<Worker> | null = null

/** Starts (once) the OCR worker. Throws when OCR cannot run; see ocrStatus(). */
async function worker (): Promise<Worker> {
  pending ??= (async () => {
    const status = await ocrStatus()
    if (status.state === 'unavailable') throw new Error(`OCR unavailable: ${status.reason}`)
    const core = await coreFile()
    await prepare(['worker.min.js', core, LANG_FILE])
    return await createWorker('spa', OEM.LSTM_ONLY, {
      workerPath: `${base()}worker.min.js`,
      corePath: `${base()}${core}`,
      langPath: base().replace(/\/$/, ''),
      // No blob: worker (it would need connect-src) and no IndexedDB copy: the service worker caches.
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: false,
    })
  })().catch((e: unknown) => {
    pending = null
    throw e
  })
  return await pending
}

export interface OcrLine { readonly text: string; readonly confidence: number; readonly bbox: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number } }

/** Reads text from a canvas. Coordinates are in the canvas's pixels. */
export async function recognise (image: HTMLCanvasElement | OffscreenCanvas, opts: { whitelist?: string; singleBlock?: boolean } = {}): Promise<{ text: string; lines: OcrLine[] }> {
  const w = await worker()
  await w.setParameters({
    tessedit_char_whitelist: opts.whitelist ?? '',
    tessedit_pageseg_mode: opts.singleBlock === true ? PSM.SINGLE_BLOCK : PSM.AUTO,
  })
  const { data } = await w.recognize(image, {}, { text: true, blocks: true })
  const lines: OcrLine[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text.trim(), confidence: l.confidence / 100, bbox: l.bbox }))))
  return { text: data.text, lines }
}

/**
 * Reads the MRZ (TD1) of the back of a card. Pass the straightened card or just its bottom third.
 * Returns null when no valid-looking MRZ is found.
 */
export async function readMrz (image: HTMLCanvasElement | OffscreenCanvas): Promise<Mrz | null> {
  const { text } = await recognise(image, { whitelist: MRZ_CHARS, singleBlock: true })
  return parseMrz(text)
}

/** Stops the OCR worker and frees its memory. */
export async function stopOcr (): Promise<void> {
  const p = pending
  pending = null
  if (p) await (await p).terminate().catch(() => undefined)
}
