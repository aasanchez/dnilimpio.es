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

export async function loadBoth (page: Page): Promise<void> {
  await openCapture(page)
  // Continue appears once both sides are loaded.
  await expect(page.locator('#capture-continue')).toHaveCount(0)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#capture-continue')).toHaveCount(0)
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await expect(page.locator('#capture-continue')).toBeEnabled()
}

/** From the photo step through the document picker to the corners of the front. */
export async function chooseDoc (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  await page.locator('#capture-continue').click()
  await expect(page.locator('h2')).toHaveText(/documento|document/)
  await page.locator(`[id="doc-${doc}"]`).check()
  await page.locator('#doc-continue').click()
}

/** Loads both fixtures and confirms the document, ending on the corners of the front. */
export async function toAlign (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  await loadBoth(page)
  await chooseDoc(page, doc)
}

/** Drags each corner handle from the start quad onto the card corners with the mouse. */
export async function snapCorners (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  const start = startQuad(doc)
  const canvas = page.locator('canvas.corner-editor')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas box')
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

/** Loads both fixtures and aligns both sides, ending in the editor. */
export async function toEditor (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  await toAlign(page, doc)
  await snapCorners(page, doc)
  await page.locator('#align-continue').click()
  await snapCorners(page, doc)
  await page.locator('#align-continue').click()
  await expect(page.locator('#preview')).toHaveJSProperty('width', DOC_PX[doc].w)
}
