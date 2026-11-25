// SPDX-License-Identifier: AGPL-3.0-or-later
// Smart field finding: on-device OCR reads the straightened card and adds black boxes over the data
// the user picks. When OCR cannot run, the button is disabled with a reason and nothing fails.
import { expect, test, type Page } from '@playwright/test'
import { SANS, controlled, pixel, toEditorWithText } from './helpers.ts'

test.use({ locale: 'es-ES' })

/** Photo x of the centre of `token` in a line drawn at `x` (the text baseline is at y, glyphs sit above it). */
async function centreX (page: Page, line: string, token: string, x: number): Promise<number> {
  return await page.evaluate(([l, tk, font]) => {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d')
    if (!ctx) throw new Error('no 2d')
    ctx.font = font
    return ctx.measureText(l.slice(0, l.indexOf(tk))).width + ctx.measureText(tk).width / 2
  }, [line, token, SANS] as const) + x
}

/** Card pixels (1600 × 1200 photo) → straightened card (1712 × 1080). */
const onCard = (x: number, y: number): [number, number] => [Math.round((x - 200) * 1712 / 1200), Math.round((y - 222) * 1080 / 756)]

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('finds the chosen data on both sides and covers it with boxes, in one undoable step', async ({ page }) => {
    test.setTimeout(180_000)
    await controlled(page)
    await toEditorWithText(page)
    // Document detection on the document screen already fetched the OCR files: no download left.
    await expect(page.locator('#find-status')).not.toContainText('MB')
    await expect(page.locator('#find-run')).toBeEnabled()
    // Default kinds: dates, support number, CAN and MRZ. Add the DNI number; leave the name visible.
    await expect(page.locator('#find-kind-name')).not.toBeChecked()
    await expect(page.locator('#find-kind-date')).toBeChecked()
    await page.locator('#find-kind-idNumber').check({ force: true })
    // Hide nothing through the fields list, so every black pixel comes from smart find.
    await page.locator('#restore-all').click()
    await page.locator('#find-run').click()
    await expect(page.locator('#find-status')).toContainText(/Se han añadido \d+ recuadros/, { timeout: 150_000 })

    const black = async (x: number, y: number): Promise<boolean> => {
      const [px, py] = onCard(x, y)
      return (await pixel(page, '#preview', px, py)).every((v) => v < 10)
    }
    await page.locator('#final-preview').check({ force: true })
    // Points in the middle of each value, 14 px above the baseline (inside 40 px glyphs).
    expect(await black(await centreX(page, 'DNI 99999999R', '99999999R', 640), 286)).toBe(true)
    expect(await black(await centreX(page, 'EMISION 02 06 2021', '06', 640), 646)).toBe(true)
    expect(await black(await centreX(page, 'NUM SOPORTE CAA000000', 'CAA000000', 640), 746)).toBe(true)
    expect(await black(await centreX(page, '987654', '987654', 1180), 916)).toBe(true)
    expect(await black(await centreX(page, 'CARMEN', 'CARMEN', 640), 546)).toBe(false) // name not chosen
    expect(await black(await centreX(page, 'DNI 99999999R', 'DNI', 640), 286)).toBe(false) // labels stay visible
    await page.locator('#tab-back').click()
    expect(await black(400, 846)).toBe(true) // MRZ line 2
    expect(await black(600, 356)).toBe(false) // address: not a kind smart find covers

    // One undo removes every box smart find added.
    await page.locator('#tool-boxes').click()
    await expect(page.locator('#panel-boxes .count')).not.toHaveText('0 recuadros en esta cara')
    await page.locator('#undo').click()
    await expect(page.locator('#panel-boxes .count')).toHaveText('0 recuadros en esta cara')
    await page.locator('#tab-front').click()
    await expect(page.locator('#panel-boxes .count')).toHaveText('0 recuadros en esta cara')

    // Clearing everything also stops the OCR worker, which keeps the last card it read.
    const ocrWorkers = (): number => page.workers().filter((w) => w.url().endsWith('/ocr/worker.min.js')).length
    expect(ocrWorkers()).toBe(1)
    await page.locator('#reset').click()
    await expect.poll(ocrWorkers).toBe(0)
  })

  test('offline before the first download, the button is disabled and says to hide the data by hand', async ({ page, context }) => {
    await controlled(page)
    await context.setOffline(true)
    await toEditorWithText(page)
    await expect(page.locator('#find-status')).toContainText('no tienes conexión')
    await expect(page.locator('#find-run')).toBeDisabled()
    // The manual path still works.
    await page.locator('#hide-all').click()
    await expect(page.locator('#hidden-count')).toContainText('de')
  })
})

test('without a service worker, the button is disabled with a short reason', async ({ page }) => {
  await page.goto('/')
  await toEditorWithText(page)
  await expect(page.locator('#find-status')).toContainText('no está disponible')
  await expect(page.locator('#find-run')).toBeDisabled()
})
