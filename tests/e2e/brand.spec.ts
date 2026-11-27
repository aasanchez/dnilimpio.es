// SPDX-License-Identifier: AGPL-3.0-or-later
// The header logo: the brand name in every language, and a link back to the start screen that keeps
// the photos (no reload, so pagehide does not clear them).
import { expect, test } from '@playwright/test'
import { loadBoth } from './helpers.ts'

test.use({ locale: 'es-ES' })

test('logo shows the brand, not a translation, and the page title ends with it', async ({ page }) => {
  await page.goto('/')
  const brand = page.locator('#brand')
  await expect(brand).toHaveAccessibleName('DNI Tapado.es')
  await expect(brand.locator('.brand-mark')).toHaveText('DT.es')
  await expect(brand).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveTitle(/ · DNI Tapado\.es$/)
})

test('logo returns to the start screen without a reload and keeps the photos', async ({ page }) => {
  await loadBoth(page)
  await page.evaluate(() => { (window as unknown as { marker: number }).marker = 1 })
  await page.locator('#brand').click()
  await expect(page.locator('#start')).toBeVisible()
  await expect(page.locator('#brand')).toHaveAttribute('aria-current', 'page')
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1)
  await page.locator('#start').click()
  await expect(page.locator('#capture-continue')).toBeEnabled()
})
