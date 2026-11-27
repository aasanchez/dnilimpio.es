// SPDX-License-Identifier: AGPL-3.0-or-later
// Fit to the text: on-device OCR finds where the text is and the boxes of the ticked fields grow to
// cover it. Boxes never shrink; Back to original position undoes the fit. Without OCR, the button
// is disabled with a reason and the manual adjustment still works.
import { expect, test, type Page } from '@playwright/test'
import { SANS, controlled, toEditorWithText } from './helpers.ts'

test.use({ locale: 'es-ES' })

/** DNI 4.0 support number box on the front, from the template (src/zones/dni.ts). */
const SUPPORT = { x0: 0.385, y0: 0.695, x1: 0.575, y1: 0.785 }
/** A fictional support number printed longer than the template box: it starts inside and runs past its right edge. */
const VALUE = 'CAA000000000'
const START = { x: 200 + 0.4 * 1200, y: 222 + 0.77 * 756 } // photo pixels: card at (200, 222), 1200 × 756

/** The support number box on the front, read from the Adjust boxes position line, as shares of the card. */
async function supportBox (page: Page): Promise<{ x0: number; y0: number; x1: number; y1: number }> {
  const pos = page.locator('#zone-position')
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('n')
    const text = await pos.textContent() ?? ''
    if (!text.startsWith('Número de soporte')) continue
    const [x, y, w, h] = [...text.matchAll(/(\d+(?:,\d+)?)\s%/g)].map((m) => Number((m[1] ?? '').replace(',', '.')) / 100)
    if (x === undefined || y === undefined || w === undefined || h === undefined) throw new Error(`unreadable: ${text}`)
    if (x > 0.5) continue // the support number's second box, top right
    return { x0: x, y0: y, x1: x + w, y1: y + h }
  }
  throw new Error('support number box not found')
}

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('grows a ticked field box to cover text that runs past it, and Back to original position undoes it', async ({ page }) => {
    test.setTimeout(180_000)
    await controlled(page)
    await toEditorWithText(page, { frontLines: [[VALUE, START.x, START.y, SANS]] })
    // Document detection already fetched the OCR files: no download left.
    await expect(page.locator('#fit-status')).not.toContainText('MB')
    await expect(page.locator('#fit-zones')).toBeEnabled()
    await expect(page.locator('#field-supportNumber')).toBeChecked()
    const end = await page.evaluate(([s, font]) => {
      const ctx = new OffscreenCanvas(1, 1).getContext('2d')
      if (!ctx) throw new Error('no 2d')
      ctx.font = font
      return ctx.measureText(s).width
    }, [VALUE, SANS] as const)
    const valueEnd = (START.x + end - 200) / 1200
    expect(valueEnd).toBeGreaterThan(SUPPORT.x1 + 0.02) // the template alone leaves the end uncovered

    await page.locator('#fit-zones').click()
    await expect(page.locator('#fit-status')).toContainText(/Se han agrandado \d+ recuadros/, { timeout: 150_000 })
    await expect(page.locator('#reset-zones')).toBeEnabled()
    await page.locator('#adjust-zones').click()
    const fitted = await supportBox(page)
    // Covers the whole value, and still everything the template covers.
    expect(fitted.x1).toBeGreaterThanOrEqual(valueEnd)
    expect(fitted.x0).toBeLessThanOrEqual(SUPPORT.x0 + 0.001)
    expect(fitted.y0).toBeLessThanOrEqual(SUPPORT.y0 + 0.001)
    expect(fitted.y1).toBeGreaterThanOrEqual(SUPPORT.y1 - 0.001)

    await page.locator('#reset-zones').click()
    await expect(page.locator('#reset-zones')).toBeDisabled()
    const back = await supportBox(page)
    expect(back.x1).toBeCloseTo(SUPPORT.x1, 3)
  })

  test('a box placed by Fit to the text is not a hand-moved box: the opt-in stats leave it out (ADR 0047)', async ({ page }) => {
    test.setTimeout(180_000)
    await controlled(page)
    await toEditorWithText(page, { frontLines: [[VALUE, START.x, START.y, SANS]] })
    await expect(page.locator('#fit-zones')).toBeEnabled()
    await page.locator('#fit-zones').click()
    await expect(page.locator('#fit-status')).toContainText(/Se han agrandado \d+ recuadros/, { timeout: 150_000 })
    await page.locator('#review').click()
    await page.locator('#review-confirm').check()
    await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
    await page.locator('#stats-link').click()
    const shown = (await page.locator('#stats-payload').textContent() ?? '').split('\n')
    expect(shown).toContain('moved=')
  })

  test('offline before the first download, the button is disabled and says to adjust by hand', async ({ page, context }) => {
    await controlled(page)
    await context.setOffline(true)
    await toEditorWithText(page)
    await expect(page.locator('#fit-status')).toContainText('Ajusta los recuadros a mano')
    await expect(page.locator('#fit-zones')).toBeDisabled()
    await page.locator('#adjust-zones').click()
    await expect(page.locator('#adjust-hint')).toBeVisible()
  })
})

test('with no field ticked, the button is disabled', async ({ page }) => {
  await page.goto('/')
  await toEditorWithText(page)
  await page.locator('#restore-all').click()
  await expect(page.locator('#fit-zones')).toBeDisabled()
})
