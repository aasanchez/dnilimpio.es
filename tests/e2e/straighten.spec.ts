// SPDX-License-Identifier: AGPL-3.0-or-later
// Automatic straightening (ADR 0012): after the document choice, both photos are found, turned the
// right way up and straightened with no corner screen; manual corners stay one tap away.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { blockModel, chooseDoc, fixture, openCapture, pixel } from './helpers.ts'

test.use({ locale: 'es-ES' })

/** A fixture turned by `quarter` × 90° clockwise, as PNG bytes (drawn in a blank page, no app). */
async function turned (page: Page, name: string, quarter: number): Promise<Buffer> {
  const b64 = readFileSync(fixture(name)).toString('base64')
  const blank = await page.context().newPage()
  const out = await blank.evaluate(async ([s, q]) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0))]))
    const side = q % 2 === 1
    const c = new OffscreenCanvas(side ? bmp.height : bmp.width, side ? bmp.width : bmp.height)
    const g = c.getContext('2d')
    if (!g) throw new Error('no 2d')
    g.translate(c.width / 2, c.height / 2)
    g.rotate((q * Math.PI) / 2)
    g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2)
    const u8 = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let bin = ''
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000))
    return btoa(bin)
  }, [b64, quarter] as const)
  await blank.close()
  return Buffer.from(out, 'base64')
}

/** The straightened front is upright: card background at the corners, the dark-blue photo on the left. */
async function expectUprightFront (page: Page): Promise<void> {
  await page.locator('#tab-front').click()
  for (const [x, y] of [[30, 30], [1681, 30], [1681, 1049], [30, 1049]] as const) {
    const [r = 0] = await pixel(page, '#preview', x, y)
    expect(r).toBeGreaterThan(180)
  }
  const [r = 255, , b = 0] = await pixel(page, '#preview', Math.round(1712 * 0.18), 540)
  expect(r).toBeLessThan(80)
  expect(b).toBeGreaterThan(100)
}

/**
 * The straightened back is upright: light card at the top, and the last dark machine-readable line
 * at the bottom, just below the black mask that hides the zone (y 66.5–93.5 %).
 */
async function expectUprightBack (page: Page): Promise<void> {
  await page.locator('#tab-back').click()
  await expect.poll(async () => (await pixel(page, '#preview', 856, 200))[0] ?? 0).toBeGreaterThan(180)
  const [r = 255, , b = 0] = await pixel(page, '#preview', 856, Math.round(1080 * 0.95))
  expect(r).toBeLessThan(80)
  expect(b).toBeGreaterThan(100)
}

for (const [quarter, label] of [[0, 'upright'], [1, 'sideways (90°)'], [2, 'upside down'], [3, 'sideways (270°)']] as const) {
  test(`a ${label} photo is found, turned and straightened with no corner screen`, async ({ page }) => {
    await blockModel(page)
    await openCapture(page)
    await page.locator('#file-front').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: await turned(page, 'synthetic-front.png', quarter) })
    await page.locator('#file-back').setInputFiles({ name: 'back.png', mimeType: 'image/png', buffer: await turned(page, 'synthetic-back.png', quarter) })
    await chooseDoc(page)
    await expect(page.locator('h2')).toHaveText('Elige qué tapar')
    await expect(page.locator('#preview')).toHaveJSProperty('width', 1712)
    await expectUprightFront(page)
    await expectUprightBack(page)
  })
}
