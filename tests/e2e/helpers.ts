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
 * The corner editor's box once its layout has settled: the same box on two reads one animation
 * frame apart. A box read during a late layout change (scroll, resize) makes a drag miss its handle.
 */
export async function editorBox (page: Page): Promise<{ x: number; y: number; k: number }> {
  const canvas = page.locator('canvas.corner-editor')
  await expect(canvas).toBeVisible()
  let last = ''
  await expect.poll(async () => {
    const box = await canvas.evaluate(async (c) => {
      await new Promise(requestAnimationFrame)
      const r = c.getBoundingClientRect()
      return `${String(r.x)},${String(r.y)},${String(r.width)}`
    })
    const stable = box === last
    last = box
    return stable
  }).toBe(true)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas box')
  return { x: box.x, y: box.y, k: box.width / 1600 }
}

/**
 * Drags a corner handle with the mouse, in 1600 × 1200 photo coordinates. Waits until the pointer is
 * over a handle before pressing, so a drag that would miss fails here, with a clear message.
 */
export async function dragCorner (page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const { x, y, k } = await editorBox(page)
  await page.mouse.move(x + from.x * k, y + from.y * k)
  await expect(page.locator('canvas.corner-editor'), 'pointer over a corner handle').toHaveClass(/is-over-handle/)
  await page.mouse.down()
  await page.mouse.move(x + to.x * k, y + to.y * k, { steps: 5 })
  await page.mouse.up()
}

/**
 * Drags each corner handle from the start quad onto the card corners with the mouse. Reset first
 * puts the corners at the start quad even if a detector already moved them.
 */
export async function snapCorners (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  const start = startQuad(doc)
  const canvas = page.locator('canvas.corner-editor')
  await expect(canvas).toBeVisible()
  await page.locator('#align-restart').click()
  for (let i = 0; i < 4; i++) await dragCorner(page, start[i]!, CARD[i]!)
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
