// SPDX-License-Identifier: AGPL-3.0-or-later
// Detects the document type from the photos, on the device: find the card (edge detection),
// straighten it, read the MRZ with OCR, then classify (doc-type.ts). When the MRZ leaves the answer
// open (no MRZ read, or a DNI whose version the dates cannot tell), the printed text of the front is
// read too (doc-text.ts). The text read stays in memory and is dropped once classified.
//
// Rule (online first, offline optional): this never throws to the screen. When OCR cannot run, the
// status says why and the person picks the document by hand, as before.

import { loadOcr } from '../ocr/load-ocr.ts'
import type { Mrz } from '../ocr/mrz.ts'
import type { OcrLine, OcrStatus } from '../ocr/ocr.ts'
import { CARD_PX } from '../geometry/warp.ts'
import type { Quad } from '../geometry/homography.ts'
import { landscape } from '../geometry/quad-edit.ts'
import { warpBitmap } from '../ui/warp-bitmap.ts'
import { detectCard, ID1_ASPECT } from './edges.ts'
import { classify, type DocGuess } from './doc-type.ts'
import { classifyText, combine } from './doc-text.ts'

/** Long side of the copy given to edge detection (it works at 400 px itself). */
const FIND_PX = 800
/** Long side of the whole photo given to OCR when the card's edges are not found. */
const WHOLE_PX = 1600
/** Share of the card's height, from the bottom, that holds the MRZ (it starts at about 66 %). */
const MRZ_SHARE = 0.4
/** Sizes of the straightened card (share of 1712 px) at which the MRZ strip is read. */
const STRIP_SCALES = [0.6, 1] as const

/** Whether OCR can run now. Never throws: a failure to load the OCR module counts as unavailable. */
export async function detectStatus (): Promise<OcrStatus> {
  try {
    return await (await loadOcr()).ocrStatus()
  } catch {
    return { state: 'unavailable', reason: 'unsupported' }
  }
}

function canvas (w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas unavailable')
  return { c, ctx }
}

/** Frees a canvas's pixels right away (§4.8). */
function drop (c: HTMLCanvasElement): void {
  c.width = 0
  c.height = 0
}

/** The card's corners in the photo's pixels, or null when no card outline is found. */
function findCard (bitmap: ImageBitmap): Quad | null {
  const s = Math.min(1, FIND_PX / Math.max(bitmap.width, bitmap.height))
  const { c, ctx } = canvas(Math.max(1, Math.round(bitmap.width * s)), Math.max(1, Math.round(bitmap.height * s)))
  ctx.drawImage(bitmap, 0, 0, c.width, c.height)
  const img = ctx.getImageData(0, 0, c.width, c.height)
  drop(c)
  const found = detectCard(img, { aspect: ID1_ASPECT })
  img.data.fill(0)
  if (!found) return null
  const k = bitmap.width / img.width
  // A sideways card is found short edge first: relabel it so it straightens to landscape.
  return landscape(found.quad.map((p) => ({ x: p.x * k, y: p.y * k })) as unknown as Quad)
}

/** A strip of `src` (rows y0–y1), optionally turned 180°, on its own canvas. */
function strip (src: CanvasImageSource & { width: number; height: number }, y0: number, y1: number, turn: boolean, scale = 1): HTMLCanvasElement {
  const w = Math.max(1, Math.round(src.width * scale))
  const h = Math.max(1, Math.round((y1 - y0) * scale))
  const { c, ctx } = canvas(w, h)
  if (turn) {
    ctx.translate(w, h)
    ctx.rotate(Math.PI)
  }
  ctx.drawImage(src, 0, y0, src.width, y1 - y0, 0, 0, w, h)
  return c
}

/** How many of the four MRZ check digits passed. */
const score = (m: Mrz): number => Object.values(m.checks).filter(Boolean).length

/**
 * Reads the MRZ of one photo: the bottom of the card, then the card upside down, each at two sizes
 * (OCR misreads differ with the text size). Stops at the first read whose check digits all pass;
 * otherwise returns the read with the most passing check digits. Without a card outline, the whole
 * photo is read instead.
 */
async function mrzOf (bitmap: ImageBitmap, readMrz: (c: HTMLCanvasElement) => Promise<Mrz | null>): Promise<Mrz | null> {
  const tries: Array<() => HTMLCanvasElement> = []
  const quad = findCard(bitmap)
  let card: HTMLCanvasElement | null = null
  if (quad) {
    card = warpBitmap(bitmap, quad, CARD_PX)
    const c = card
    const h = c.height
    for (const turn of [false, true]) {
      for (const scale of STRIP_SCALES) tries.push(() => (turn ? strip(c, 0, h * MRZ_SHARE, true, scale) : strip(c, h * (1 - MRZ_SHARE), h, false, scale)))
    }
  } else {
    const s = Math.min(1, WHOLE_PX / Math.max(bitmap.width, bitmap.height))
    tries.push(() => strip(bitmap, 0, bitmap.height, false, s))
    tries.push(() => strip(bitmap, 0, bitmap.height, true, s))
  }
  let best: Mrz | null = null
  try {
    for (const make of tries) {
      const c = make()
      try {
        const m = await readMrz(c)
        if (m?.valid === true) return m
        if (m && (!best || score(m) > score(best))) best = m
      } finally {
        drop(c)
      }
    }
    return best
  } finally {
    if (card) drop(card)
  }
}

type Recognise = (image: HTMLCanvasElement) => Promise<{ lines: OcrLine[] }>

/**
 * Reads the printed text of one photo and guesses the document from it: the straightened card, then
 * the card upside down. Without a card outline, the whole photo is read, and the layout (where the
 * number sits) is not used.
 */
async function textOf (bitmap: ImageBitmap, recognise: Recognise): Promise<DocGuess | null> {
  const quad = findCard(bitmap)
  const src: CanvasImageSource & { width: number; height: number } = quad ? warpBitmap(bitmap, quad, CARD_PX) : bitmap
  const s = quad ? 1 : Math.min(1, WHOLE_PX / Math.max(bitmap.width, bitmap.height))
  try {
    for (const turn of [false, true]) {
      const c = strip(src, 0, src.height, turn, s)
      try {
        const { lines } = await recognise(c)
        const h = c.height
        const guess = classifyText(lines.map((l) => ({ text: l.text, y: quad ? (l.bbox.y0 + l.bbox.y1) / 2 / h : undefined })))
        if (guess) return guess
      } finally {
        drop(c)
      }
    }
    return null
  } finally {
    if (src instanceof HTMLCanvasElement) drop(src)
  }
}

const cache = new WeakMap<ImageBitmap, Promise<Mrz | null>>()
const textCache = new WeakMap<ImageBitmap, Promise<DocGuess | null>>()

/** Runs `read` once per photo, keeping the promise (never the text) until the photo is dropped. */
function once<T> (map: WeakMap<ImageBitmap, Promise<T>>, bitmap: ImageBitmap, read: () => Promise<T>): Promise<T> {
  let pending = map.get(bitmap)
  if (!pending) {
    pending = read()
    map.set(bitmap, pending)
    pending.catch(() => { map.delete(bitmap) })
  }
  return pending
}

/** Today in the device's time zone, as YYYY-MM-DD. */
const today = (): string => {
  const d = new Date()
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Guesses the document from the photos: the MRZ of the back first, then of the front (in case the
 * photos were swapped). When that leaves the answer open, the printed text of the front, then of
 * the back, fills it in. Returns null when nothing was recognised. Results are kept per photo, so
 * going back and forth does not read the same photo twice. Throws only if OCR itself fails to start.
 */
export async function detectDocument (photos: { readonly front: ImageBitmap | null; readonly back: ImageBitmap | null }): Promise<DocGuess | null> {
  const { readMrz, recognise } = await loadOcr()
  let fromMrz: DocGuess | null = null
  for (const bitmap of [photos.back, photos.front]) {
    if (!bitmap) continue
    const m = await once(cache, bitmap, async () => await mrzOf(bitmap, readMrz))
    if (m) {
      fromMrz = classify(m, today())
      break
    }
  }
  if (fromMrz?.model) return fromMrz
  for (const bitmap of [photos.front, photos.back]) {
    if (!bitmap) continue
    const t = await once(textCache, bitmap, async () => await textOf(bitmap, recognise))
    if (t) return combine(fromMrz, t)
  }
  return fromMrz
}
