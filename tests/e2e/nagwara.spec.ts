// SPDX-License-Identifier: AGPL-3.0-or-later
// The start screen footer says this is a NagWara product: inline mark (no request), translated
// claim, and a link to nagwara.com in a new tab so following it does not clear the photos.
import { expect, test } from '@playwright/test'

test.use({ locale: 'es-ES' })

test('footer shows the NagWara attribution next to the source link and the build version', async ({ page }) => {
  const nagwaraRequests: string[] = []
  page.on('request', (r) => { if (/nagwara|thelobby/i.test(new URL(r.url()).hostname)) nagwaraRequests.push(r.url()) })
  await page.goto('/')
  const footer = page.locator('footer')
  await expect(footer.locator('#source-link')).toBeVisible()
  await expect(footer.locator('.build-version')).toBeVisible()

  const link = footer.locator('#nagwara-link')
  await expect(link).toHaveAccessibleName('Visitar NagWara')
  await expect(link).toHaveAttribute('href', 'https://www.nagwara.com/')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  const mark = link.locator('svg.nagwara-mark')
  await expect(mark).toBeVisible()
  await expect(mark).toHaveAttribute('aria-hidden', 'true')
  await expect(footer.locator('img')).toHaveCount(0)

  await expect(footer.locator('.nagwara-product')).toHaveText('Esto es un producto NagWara,')
  await expect(footer.locator('.nagwara-tagline')).toHaveText('Las máquinas ejecutan, las personas lideran.')
  expect(nagwaraRequests).toEqual([])
})

test.describe('English', () => {
  test.use({ locale: 'en-GB' })
  test('the claim follows the language', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('footer .nagwara-tagline')).toHaveText('Machines execute, People lead.')
  })
})
