// SPDX-License-Identifier: AGPL-3.0-or-later
// Responsive layout (ADR 0017): one column on phones, picture beside the controls on wide screens.
import { expect, test, type Page } from '@playwright/test'
import { toAuto } from './helpers.ts'

test.use({ locale: 'es-ES' })

const noSidewaysScroll = async (page: Page): Promise<void> => {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }))
  expect(scroll).toBe(width)
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the editor is one column with the main button in a sticky bar at the bottom', async ({ page }) => {
    await toAuto(page)
    await noSidewaysScroll(page)
    const card = await page.locator('#preview').boundingBox()
    const tabs = await page.locator('#tool-fields').boundingBox()
    // The tools come under the card.
    expect((tabs?.y ?? 0)).toBeGreaterThan((card?.y ?? 0) + (card?.height ?? 0))
    const review = await page.locator('#review').boundingBox()
    expect((review?.y ?? 0) + (review?.height ?? 0)).toBeLessThanOrEqual(844)
    expect((review?.y ?? 0)).toBeGreaterThan(844 - 120)
  })
})

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the start screen has no sideways scroll and the progress is hidden', async ({ page }) => {
    await page.goto('/')
    await noSidewaysScroll(page)
    await expect(page.locator('.progress')).toHaveCount(0)
  })

  test('the card is on the left, the tools and the main button on the right, the steps in the top bar', async ({ page }) => {
    await toAuto(page)
    await noSidewaysScroll(page)
    const card = await page.locator('#preview').boundingBox()
    const tabs = await page.locator('#tool-fields').boundingBox()
    const review = await page.locator('#review').boundingBox()
    expect(card).not.toBeNull()
    expect((tabs?.x ?? 0)).toBeGreaterThan((card?.x ?? 0) + (card?.width ?? 0))
    expect((review?.x ?? 0)).toBeGreaterThan((card?.x ?? 0) + (card?.width ?? 0))
    // The progress steps sit in the top bar, between the logo and the language.
    const bar = await page.locator('header').boundingBox()
    const steps = await page.locator('.progress').boundingBox()
    expect((steps?.y ?? 0)).toBeGreaterThanOrEqual((bar?.y ?? 0) - 1)
    expect((steps?.y ?? 0) + (steps?.height ?? 0)).toBeLessThanOrEqual((bar?.y ?? 0) + (bar?.height ?? 0) + 1)
    // The card stays in view while the controls scroll.
    await page.mouse.wheel(0, 600)
    await expect.poll(async () => (await page.locator('#preview').boundingBox())?.y ?? -1).toBeGreaterThan(0)
  })
})
