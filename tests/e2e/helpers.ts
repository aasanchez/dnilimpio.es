// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared e2e steps: load the synthetic fixtures and snap the corners onto the card.
import { expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

export const fixture = (name: string): string => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))

// Card corners in the 1600 × 1200 synthetic fixtures.
export const CARD = [{ x: 200, y: 222 }, { x: 1400, y: 222 }, { x: 1400, y: 978 }, { x: 200, y: 978 }]
// Start quad from defaultQuad(1600, 1200): 70 % of the width, ID-1 aspect, centred.
const W = 1120
const H = W / (1712 / 1080)
export const START = [{ x: 240, y: 600 - H / 2 }, { x: 1360, y: 600 - H / 2 }, { x: 1360, y: 600 + H / 2 }, { x: 240, y: 600 + H / 2 }]

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
  await page.goto('/')
  await page.locator('#start').click()
  // Continue appears once both sides are loaded.
  await expect(page.locator('#capture-continue')).toHaveCount(0)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#capture-continue')).toHaveCount(0)
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await expect(page.locator('#capture-continue')).toBeEnabled()
}

/**
 * Drags each corner handle from the start quad onto the card corners with the mouse. Reset first
 * puts the corners at the start quad even if a detector already moved them.
 */
export async function snapCorners (page: Page): Promise<void> {
  const canvas = page.locator('canvas.corner-editor')
  await expect(canvas).toBeVisible()
  await page.locator('#align-restart').click()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas box')
  const k = box.width / 1600
  for (let i = 0; i < 4; i++) {
    const from = START[i]!
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
export async function toEditor (page: Page): Promise<void> {
  await loadBoth(page)
  await page.locator('#capture-continue').click()
  await snapCorners(page)
  await page.locator('#align-continue').click()
  await snapCorners(page)
  await page.locator('#align-continue').click()
  await expect(page.locator('#preview')).toHaveJSProperty('width', 1712)
}
