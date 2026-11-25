// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared e2e steps: load the synthetic fixtures and snap the corners onto the card.
import { expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

export const fixture = (name: string): string => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))

// Card corners in the 1600 × 1200 synthetic fixtures.
export const CARD = [{ x: 200, y: 222 }, { x: 1400, y: 222 }, { x: 1400, y: 978 }, { x: 200, y: 978 }]
/** Straightened size per document (src/zones/documents.ts). */
export const DOC_PX = { 'dni-4.0': { w: 1712, h: 1080 }, 'dni-3.0': { w: 1712, h: 1080 }, tie: { w: 1712, h: 1080 } } as const
export type Doc = keyof typeof DOC_PX

/** Start quad from defaultQuad(1600, 1200, aspect): 70 % of the width, the document's aspect, centred. */
export function startQuad (doc: Doc = 'dni-4.0'): Array<{ x: number; y: number }> {
  const W = 1120
  const H = W / (DOC_PX[doc].w / DOC_PX[doc].h)
  return [{ x: 240, y: 600 - H / 2 }, { x: 1360, y: 600 - H / 2 }, { x: 1360, y: 600 + H / 2 }, { x: 240, y: 600 + H / 2 }]
}
export const START = startQuad()

/** From the start screen to the photo step. */
export async function openCapture (page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('#start').click()
}

/** Makes the corner model unavailable, as when offline before its first use. */
export async function blockModel (page: Page): Promise<void> {
  await page.route('**/assets/ml/**', (route) => route.abort('internetdisconnected'))
}

/**
 * Opens the app and loads both fixtures. The corner model is blocked unless `model` is true: most
 * tests check the manual flow, and the model's 2.5 MB would only slow them down.
 */
export async function loadBoth (page: Page, { model = false } = {}): Promise<void> {
  if (!model) await blockModel(page)
  await openCapture(page)
  // Continue appears once both sides are loaded.
  await expect(page.locator('#capture-continue')).toHaveCount(0)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#capture-continue')).toHaveCount(0)
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await expect(page.locator('#capture-continue')).toBeEnabled()
}

/** From the photo step through the document picker; the photos are then straightened automatically. */
export async function chooseDoc (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  await page.locator('#capture-continue').click()
  await expect(page.locator('h2')).toHaveText(/documento|document/)
  await page.locator(`[id="doc-${doc}"]`).check()
  await page.locator('#doc-continue').click()
}

/**
 * Loads both fixtures and confirms the document. Both cards are then found and straightened
 * automatically (edge detection; the model is blocked unless `model` is true), ending in the editor.
 */
export async function toAuto (page: Page, doc: Doc = 'dni-4.0', opts: { model?: boolean } = {}): Promise<void> {
  await loadBoth(page, opts)
  await chooseDoc(page, doc)
  await expect(page.locator('#preview')).toHaveJSProperty('width', DOC_PX[doc].w)
}

/** Waits for the editor (straightening can take a while with the model), then opens the front's corners. */
export async function adjustFront (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  await expect(page.locator('#preview')).toHaveJSProperty('width', DOC_PX[doc].w, { timeout: 30_000 })
  await page.locator('#tab-front').click()
  await page.locator('#adjust-front').click()
  await expect(page.locator('canvas.corner-editor')).toBeVisible()
}

/** Like toAuto, then opens the corners of the front with "Adjust corners". */
export async function toAlign (page: Page, doc: Doc = 'dni-4.0', opts: { model?: boolean } = {}): Promise<void> {
  await toAuto(page, doc, opts)
  await adjustFront(page, doc)
}

/**
 * The corner editor's box once it has stopped moving. The page can still scroll or settle right
 * after the corner screen opens (focus moves to its heading), and a box read too early sends the
 * mouse next to the handles.
 */
export async function editorBox (page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const canvas = page.locator('canvas.corner-editor')
  await expect(canvas).toBeVisible()
  await canvas.scrollIntoViewIfNeeded()
  let last = ''
  for (let i = 0; i < 50; i++) {
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas box')
    const key = JSON.stringify(box)
    if (key === last) return box
    last = key
    await page.waitForTimeout(100)
  }
  throw new Error('the corner editor kept moving')
}

/**
 * Drags each corner handle from the start quad onto the card corners with the mouse. Reset first
 * puts the corners at the start quad even if a detector already moved them.
 */
export async function snapCorners (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  const start = startQuad(doc)
  await page.locator('#align-restart').click()
  const box = await editorBox(page)
  const k = box.width / 1600
  for (let i = 0; i < 4; i++) {
    const from = start[i]!
    const to = CARD[i]!
    await page.mouse.move(box.x + from.x * k, box.y + from.y * k)
    await page.mouse.down()
    await page.mouse.move(box.x + to.x * k, box.y + to.y * k, { steps: 5 })
    await page.mouse.up()
  }
}

/** RGB of one pixel of a canvas. */
export async function pixel (page: Page, id: string, x: number, y: number): Promise<number[]> {
  return await page.locator(id).evaluate((c, [px, py]) => {
    const d = (c as HTMLCanvasElement).getContext('2d')?.getImageData(px ?? 0, py ?? 0, 1, 1).data
    return d ? [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] : []
  }, [x, y])
}

/** Loads both fixtures, confirms the document and lets the app straighten both sides: ends in the editor. */
export async function toEditor (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  await toAuto(page, doc)
}
