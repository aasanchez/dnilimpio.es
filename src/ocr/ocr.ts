// SPDX-License-Identifier: AGPL-3.0-or-later
// On-device OCR with PP-OCRv6 tiny (PaddleOCR) in a Web Worker (worker.ts). Nothing leaves the
// device: the pixels go to a worker on this page, and the engine, its runtime and the models come
// from our own site (ocr/), never from a CDN. The service worker downloads those files on first use,
// checks each against the build's SHA-384 and keeps them, so OCR also works offline afterwards.
//
// Rule (online first, offline optional): OCR is only offered when it can run. ocrStatus() says
// whether it is ready, needs a download, or is unavailable; callers then hide or disable it and
// the user does that step by hand. recognise() never runs without the service worker, because the
// worker is what checks the integrity of the OCR files.
//
// This module is loaded on demand (its own chunk): the first page load does not include the engine.

import { AskTimeout, askWorker, type AskMessage, type AskReply } from './ask.ts'
import { MIN_WORD_CONFIDENCE, findSensitive, namesFromText, type Found, type Rect } from './find.ts'
import { fromWire, type OcrLine } from './lines.ts'
import { parseMrz, type Mrz } from './mrz.ts'
import { MODEL_FILES, type Reply, type Request } from './protocol.ts'
import { markOcrRan } from './ran.ts'
import { ReadyMemo } from './ready-memo.ts'

export type { OcrBox, OcrLine, OcrWord } from './lines.ts'

/**
 * Approximate first download in MB, as sent compressed: the runtime's WebAssembly (13.5 MB, 3.4 MB
 * compressed), the two models (6.2 MB, 5.7 MB compressed) and the worker (0.1 MB).
 */
export const OCR_DOWNLOAD_MB = 9

export type OcrStatus =
  | { readonly state: 'ready' }
  | { readonly state: 'download'; readonly megabytes: number }
  | { readonly state: 'unavailable'; readonly reason: 'no-service-worker' | 'offline' | 'unsupported' }

const WORKER_FILE = 'worker.min.js'

/** Files OCR needs, relative to the site. */
const neededFiles = (): string[] => [WORKER_FILE, ...Object.values(MODEL_FILES)].map((p) => `ocr/${p}`)

/** The runtime is built with WebAssembly SIMD (every current browser has it). A 1-instruction test module. */
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])
const simd = (): boolean => {
  try {
    return WebAssembly.validate(SIMD_TEST)
  } catch {
    return false
  }
}

/** Sends one message to the controlling service worker and waits for its answer, within a time limit (ask.ts). */
async function ask (msg: AskMessage): Promise<AskReply> {
  const controller = navigator.serviceWorker.controller
  if (!controller) throw new Error('OCR unavailable: no-service-worker')
  return await askWorker(controller, msg)
}

/**
 * The last "ready" answer, per controlling service worker (ADR 0033). A new controller asks again;
 * a failed prepare or a failed OCR job drops it.
 */
const readyMemo = new ReadyMemo<ServiceWorker>()
let watching = false

/** Drops the kept "ready" answer when another service worker takes control (an update). */
function watchController (): void {
  if (watching) return
  watching = true
  navigator.serviceWorker.addEventListener('controllerchange', () => { readyMemo.forget() })
}

/**
 * Asks the service worker to download and check the files OCR needs, so a missing network or a file
 * that fails its integrity check is one clear error now instead of a stalled worker later.
 */
async function prepare (): Promise<void> {
  const controller = navigator.serviceWorker.controller
  const r = await ask({ type: 'prepare', paths: neededFiles() }).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
  if (!r.ok) {
    readyMemo.forget()
    throw new Error(`OCR files unavailable: ${r.error ?? 'unknown error'}`)
  }
  // Every file was just checked and is in this worker's cache: later status questions need no hashing.
  if (controller !== null && controller === navigator.serviceWorker.controller) readyMemo.remember(controller)
}

/** Whether OCR can run now, without starting it. */
export async function ocrStatus (): Promise<OcrStatus> {
  if (typeof WebAssembly !== 'object' || typeof Worker === 'undefined' || !simd()) return { state: 'unavailable', reason: 'unsupported' }
  const controller = 'serviceWorker' in navigator ? navigator.serviceWorker.controller : null
  if (controller === null) return { state: 'unavailable', reason: 'no-service-worker' }
  // Ask the controlling service worker: only its own build's cache counts. Its "ready" is kept for
  // this page until another worker takes control or using OCR fails (ADR 0033).
  watchController()
  let ready: boolean
  try {
    ready = await readyMemo.ready(controller, async () => {
      const reply = await ask({ type: 'status', paths: neededFiles() })
      return reply.cached === true
    })
  } catch (e) {
    // A worker that does not answer (stopped, or being replaced) cannot check the files: OCR is off
    // until a worker takes control again (the screens check again on 'controllerchange').
    if (e instanceof AskTimeout) return { state: 'unavailable', reason: 'no-service-worker' }
    ready = false
  }
  if (ready) return { state: 'ready' }
  return navigator.onLine ? { state: 'download', megabytes: OCR_DOWNLOAD_MB } : { state: 'unavailable', reason: 'offline' }
}

let pending: Promise<Worker> | null = null

/** Starts (once) the OCR worker. Throws when OCR cannot run; see ocrStatus(). */
async function worker (): Promise<Worker> {
  pending ??= (async () => {
    const status = await ocrStatus()
    if (status.state === 'unavailable') throw new Error(`OCR unavailable: ${status.reason}`)
    await prepare()
    // A string URL: the Trusted Types policy (src/security/trusted-types.ts) checks it.
    return new Worker(new URL(`ocr/${WORKER_FILE}`, document.baseURI).href)
  })().catch((e: unknown) => {
    pending = null
    throw e
  })
  return await pending
}

let nextId = 0

/** Sends the pixels of one image to the worker (they are moved, not copied) and waits for the lines. */
async function readPixels (w: Worker, img: ImageData): Promise<{ text: string; lines: OcrLine[] }> {
  const id = ++nextId
  const reply = new Promise<Reply>((resolve) => {
    const onMessage = (e: MessageEvent<Reply>): void => {
      if (e.data.id !== id) return
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      resolve(e.data)
    }
    const onError = (): void => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      resolve({ type: 'error', id, message: 'OCR worker failed' })
    }
    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
  })
  const msg: Request = { type: 'read', id, width: img.width, height: img.height, data: img.data.buffer }
  w.postMessage(msg, [img.data.buffer])
  const r = await reply
  if (r.type === 'error') throw new Error(r.message)
  return fromWire(r.lines)
}

/** The pixels of a canvas, on a copy the worker can take. */
function pixelsOf (image: HTMLCanvasElement | OffscreenCanvas): ImageData {
  const ctx: { getImageData: (x: number, y: number, w: number, h: number) => ImageData } | null = image.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas unavailable')
  return ctx.getImageData(0, 0, image.width, image.height)
}

/** Thrown by jobs that stopOcr() cancelled: their result, if any, is dropped. */
export class OcrStopped extends Error {
  constructor () { super('OCR stopped') }
}

/**
 * Cancel functions of the operations in progress. Each one is removed as soon as its operation
 * settles, so nothing keeps a reference to a finished result (unlike racing a shared, still-pending
 * stop promise, whose reactions would hold every result until the next stop).
 */
const inFlight = new Set<(e: OcrStopped) => void>()

/** Waits for `p`, or ends with OcrStopped as soon as stopOcr() runs. */
async function live<T> (p: Promise<T>): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    inFlight.add(reject)
    p.then(resolve, reject).finally(() => { inFlight.delete(reject) })
  })
}

/** Bumped by stopOcr(): a job started before that never returns its result. */
let generation = 0

/**
 * Jobs run one at a time: each sets its own parameters, then recognises, before the next starts.
 * The queue only records that the last job settled; it never holds a result (text read from a card).
 */
let queue: Promise<void> = Promise.resolve()

/** Reads text from a canvas. Coordinates are in the canvas's pixels. Throws OcrStopped if stopOcr() runs first. */
export async function recognise (image: HTMLCanvasElement | OffscreenCanvas): Promise<{ text: string; lines: OcrLine[] }> {
  const mine = generation
  const job = queue.then(async () => {
    if (mine !== generation) throw new OcrStopped()
    const w = await live(worker())
    const result = await live(readPixels(w, pixelsOf(image)))
    if (mine !== generation) throw new OcrStopped()
    markOcrRan()
    return result
  }).catch((e: unknown) => {
    // A file may be gone or rewritten since the last "ready": the next status question asks again.
    if (!(e instanceof OcrStopped)) readyMemo.forget()
    throw e
  })
  queue = job.then(() => undefined, () => undefined)
  return await job
}

/**
 * Reads the MRZ (TD1) of the back of a card. Pass the straightened card or just its bottom third.
 * Returns null when no valid-looking MRZ is found.
 */
export async function readMrz (image: HTMLCanvasElement | OffscreenCanvas): Promise<Mrz | null> {
  const { text } = await recognise(image)
  return parseMrz(text)
}

/**
 * Smart field finding: reads each straightened side and returns the personal data found on it, in
 * normalised card coordinates. Names read from the MRZ are also looked for on the other side.
 */
export async function findOnCard<S extends string> (sides: ReadonlyArray<readonly [S, HTMLCanvasElement | OffscreenCanvas]>): Promise<Array<{ side: S; found: Found[] }>> {
  const read = []
  for (const [side, image] of sides) {
    // Size taken before reading: the boxes are normalised to the image that was read.
    const size = { w: image.width, h: image.height }
    read.push({ side, size, ...(await recognise(image)) })
  }
  const names = namesFromText(read.map((r) => r.text).join('\n'))
  return read.map((r) => ({ side: r.side, found: findSensitive(r.lines, r.size, names) }))
}

/**
 * Where the text is on each straightened side, for fitting the field boxes (src/engine/snap.ts):
 * word boxes only, in normalised card coordinates. The text itself is dropped here.
 */
export async function wordBoxesOnCard<S extends string> (sides: ReadonlyArray<readonly [S, HTMLCanvasElement | OffscreenCanvas]>): Promise<Array<{ side: S; words: Rect[] }>> {
  const out = []
  for (const [side, image] of sides) {
    // Size taken before reading: the boxes are normalised to the image that was read.
    const w = image.width
    const h = image.height
    const { lines } = await recognise(image)
    const words = lines.flatMap((l) => l.words)
      .filter((x) => x.confidence >= MIN_WORD_CONFIDENCE)
      .map((x) => ({ x: x.bbox.x0 / w, y: x.bbox.y0 / h, w: (x.bbox.x1 - x.bbox.x0) / w, h: (x.bbox.y1 - x.bbox.y0) / h }))
    out.push({ side, words })
  }
  return out
}

/**
 * Stops the OCR worker and frees its memory (the engine keeps the last image it read). Jobs that are
 * queued or running end with OcrStopped and their results are dropped. The next recognise() starts
 * a new worker.
 */
export async function stopOcr (): Promise<void> {
  generation++
  for (const cancel of inFlight) cancel(new OcrStopped())
  inFlight.clear()
  queue = Promise.resolve()
  const p = pending
  pending = null
  const w = await p?.catch(() => null)
  w?.terminate()
}
