// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const fixture = (name: string): string => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))

// Card corners in the 1600 × 1200 synthetic fixtures.
const CARD = [{ x: 200, y: 222 }, { x: 1400, y: 222 }, { x: 1400, y: 978 }, { x: 200, y: 978 }]
// Start quad from defaultQuad(1600, 1200): 70 % of the width, ID-1 aspect, centred.
const W = 1120
const H = W / (1712 / 1080)
const START = [{ x: 240, y: 600 - H / 2 }, { x: 1360, y: 600 - H / 2 }, { x: 1360, y: 600 + H / 2 }, { x: 240, y: 600 + H / 2 }]

test.use({ locale: 'es-ES' })

async function loadBoth (page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('#capture-continue')).toBeDisabled()
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#capture-continue')).toBeDisabled()
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await expect(page.locator('#capture-continue')).toBeEnabled()
}

/** Drags each corner handle from the start quad onto the card corners with the mouse. */
async function snapCorners (page: Page): Promise<void> {
  const canvas = page.locator('canvas.corner-editor')
  await expect(canvas).toBeVisible()
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

/** RGB of a pixel of the straightened card canvas. */
async function pixel (page: Page, id: string, x: number, y: number): Promise<number[]> {
  return await page.locator(id).evaluate((c, [px, py]) => {
    const d = (c as HTMLCanvasElement).getContext('2d')?.getImageData(px ?? 0, py ?? 0, 1, 1).data
    return d ? [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] : []
  }, [x, y])
}

test('continue from capture, mark corners on both sides, get two 1712 × 1080 cards', async ({ page }) => {
  await loadBoth(page)
  await page.locator('#capture-continue').click()
  await expect(page.locator('h2')).toHaveText('Paso 2 de 6: marca las esquinas del DNI')
  await expect(page.locator('h2')).toBeFocused()
  await expect(page.locator('h3')).toHaveText('Anverso (cara con la foto)')
  await snapCorners(page)
  await page.locator('#align-continue').click()
  await expect(page.locator('h3')).toHaveText('Reverso (cara con las líneas de texto de la parte inferior)')
  await snapCorners(page)
  await page.locator('#align-continue').click()

  for (const side of ['front', 'back']) {
    const id = `#warped-${side}`
    await expect(page.locator(id)).toHaveJSProperty('width', 1712)
    await expect(page.locator(id)).toHaveJSProperty('height', 1080)
  }
  // Corners snapped to the card: the straightened image's edges are card background (light), not the dark table.
  for (const [x, y] of [[8, 8], [1703, 8], [1703, 1071], [8, 1071]] as const) {
    const [r = 0] = await pixel(page, '#warped-front', x, y)
    expect(r).toBeGreaterThan(180)
  }
  // The photo block (dark blue) sits at the left: x 248–584 of 1200 card px → ~4–32 % of the width.
  const [r = 255, , b = 0] = await pixel(page, '#warped-front', Math.round(1712 * 0.18), 540)
  expect(r).toBeLessThan(80)
  expect(b).toBeGreaterThan(100)
})

test('crossed corners disable Continue; Back keeps the photos', async ({ page }) => {
  await loadBoth(page)
  await page.locator('#capture-continue').click()
  const canvas = page.locator('canvas.corner-editor')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas box')
  const k = box.width / 1600
  // Drag the top-left corner past the bottom-right one.
  await page.mouse.move(box.x + START[0]!.x * k, box.y + START[0]!.y * k)
  await page.mouse.down()
  await page.mouse.move(box.x + 1500 * k, box.y + 1100 * k, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('#align-continue')).toBeDisabled()
  await expect(page.locator('#align-status')).toHaveAttribute('role', 'alert')
  await page.locator('#align-back').click()
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#capture-continue')).toBeEnabled()
})

test('keyboard moves the selected corner', async ({ page }) => {
  await loadBoth(page)
  await page.locator('#capture-continue').click()
  const canvas = page.locator('canvas.corner-editor')
  await canvas.focus()
  // Push the top-left corner far right and down with Shift+arrows until the quad is invalid.
  for (let i = 0; i < 80; i++) await page.keyboard.press('Shift+ArrowRight')
  for (let i = 0; i < 80; i++) await page.keyboard.press('Shift+ArrowDown')
  await expect(page.locator('#align-continue')).toBeDisabled()
  for (let i = 0; i < 80; i++) await page.keyboard.press('Shift+ArrowUp')
  for (let i = 0; i < 80; i++) await page.keyboard.press('Shift+ArrowLeft')
  await expect(page.locator('#align-continue')).toBeEnabled()
})

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('a touch drag moves a corner and does not scroll the page', async ({ page }) => {
    await loadBoth(page)
    await page.locator('#capture-continue').tap()
    const canvas = page.locator('canvas.corner-editor')
    await expect(canvas).toHaveCSS('touch-action', 'none')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas box')
    const k = box.width / 1600
    // Synthetic touch pointer events, as a finger would produce, landing a bit off the handle.
    const at = (p: { x: number; y: number }): { clientX: number; clientY: number } => ({ clientX: box.x + p.x * k, clientY: box.y + p.y * k })
    const base = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true }
    await canvas.dispatchEvent('pointerdown', { ...base, ...at({ x: START[0]!.x + 40, y: START[0]!.y + 40 }) })
    await canvas.dispatchEvent('pointermove', { ...base, ...at({ x: 1500 + 40, y: 1100 + 40 }) })
    await canvas.dispatchEvent('pointerup', { ...base, ...at({ x: 1500 + 40, y: 1100 + 40 }) })
    await expect(page.locator('#align-continue')).toBeDisabled()
  })
})
