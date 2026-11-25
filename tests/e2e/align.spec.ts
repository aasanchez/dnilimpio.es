// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from '@playwright/test'
import { CARD, fixture, pixel, snapCorners, toAlign } from './helpers.ts'

test.use({ locale: 'es-ES' })

test('Adjust corners from the editor: mark them by hand, Continue straightens again and returns', async ({ page }) => {
  await toAlign(page)
  await expect(page.locator('h2')).toHaveText('Encuadra el anverso')
  await expect(page.locator('h2')).toBeFocused()
  // Both sides are already straightened, so Continue finishes.
  await expect(page.locator('#align-tab-back')).toContainText('✓')
  await expect(page.locator('#align-continue')).toContainText('Listo')
  await snapCorners(page)
  await page.locator('#align-continue').click()

  // The editor shows the sanitised front, 1712 × 1080.
  await expect(page.locator('h2')).toHaveText('Elige qué tapar')
  await expect(page.locator('#preview')).toHaveJSProperty('width', 1712)
  await expect(page.locator('#preview')).toHaveJSProperty('height', 1080)
  // Corners snapped to the card: the straightened image's edges are card background (light), not the dark table.
  for (const [x, y] of [[8, 8], [1703, 8], [1703, 1071], [8, 1071]] as const) {
    const [r = 0] = await pixel(page, '#preview', x, y)
    expect(r).toBeGreaterThan(180)
  }
  // The photo block (dark blue) sits at the left: x 248–584 of 1200 card px → ~4–32 % of the width.
  const [r = 255, , b = 0] = await pixel(page, '#preview', Math.round(1712 * 0.18), 540)
  expect(r).toBeLessThan(80)
  expect(b).toBeGreaterThan(100)
})

test('crossed corners disable Continue; Back returns to the editor, then the document and the photos', async ({ page }) => {
  await toAlign(page)
  const canvas = page.locator('canvas.corner-editor')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas box')
  const k = box.width / 1600
  // Drag the top-left corner past the bottom-right one.
  // The corners start where the card was found.
  await page.mouse.move(box.x + CARD[0]!.x * k, box.y + CARD[0]!.y * k)
  await page.mouse.down()
  await page.mouse.move(box.x + 1500 * k, box.y + 1100 * k, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('#align-continue')).toBeDisabled()
  await expect(page.locator('#align-status')).toHaveAttribute('role', 'alert')
  await page.locator('#back').click()
  await expect(page.locator('h2')).toHaveText('Elige qué tapar')
  await page.locator('#back').click()
  await expect(page.locator('h2')).toHaveText('¿Qué documento vas a copiar?')
  await page.locator('#back').click()
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#capture-continue')).toBeEnabled()
})

test('keyboard moves the selected corner', async ({ page }) => {
  await toAlign(page)
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
    await toAlign(page)
    const canvas = page.locator('canvas.corner-editor')
    await expect(canvas).toHaveCSS('touch-action', 'none')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas box')
    const k = box.width / 1600
    // Synthetic touch pointer events, as a finger would produce, landing a bit off the handle.
    const at = (p: { x: number; y: number }): { clientX: number; clientY: number } => ({ clientX: box.x + p.x * k, clientY: box.y + p.y * k })
    const base = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true }
    await canvas.dispatchEvent('pointerdown', { ...base, ...at({ x: CARD[0]!.x + 40, y: CARD[0]!.y + 40 }) })
    await canvas.dispatchEvent('pointermove', { ...base, ...at({ x: 1500 + 40, y: 1100 + 40 }) })
    await canvas.dispatchEvent('pointerup', { ...base, ...at({ x: 1500 + 40, y: 1100 + 40 }) })
    await expect(page.locator('#align-continue')).toBeDisabled()
  })
})

test('corners confirmed by hand survive replacing only the other photo', async ({ page }) => {
  await toAlign(page)
  // Move the top-left corner (selected first) out onto the dark table with the keyboard: the
  // straightened front then starts dark there.
  await page.locator('canvas.corner-editor').focus()
  const topLeft = async (): Promise<number[]> => ((await page.locator('[data-corners]').getAttribute('data-corners')) ?? '').split(' ')[0]!.split(',').map(Number)
  for (let i = 0; i < 40; i++) {
    const [x = 0, y = 0] = await topLeft()
    if (x < CARD[0]!.x - 80 && y < CARD[0]!.y - 80) break
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowUp')
  }
  const [x = 0, y = 0] = await topLeft()
  expect(x).toBeLessThan(CARD[0]!.x - 80)
  expect(y).toBeLessThan(CARD[0]!.y - 80)
  await page.locator('#align-continue').click()
  await expect(page.locator('#preview')).toHaveJSProperty('width', 1712)
  const dark = async (): Promise<number> => (await pixel(page, '#preview', 8, 8))[0] ?? 255
  await expect.poll(dark).toBeLessThan(100)
  // Back to the photos, replace the back only, continue with the same document.
  await page.locator('#back').click()
  await page.locator('#back').click()
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await page.locator('#capture-continue').click()
  await page.locator('#doc-continue').click()
  await expect(page.locator('h2')).toHaveText('Elige qué tapar')
  await page.locator('#tab-front').click()
  await expect.poll(dark).toBeLessThan(100)
})
