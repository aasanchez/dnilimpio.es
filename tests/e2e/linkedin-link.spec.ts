// SPDX-License-Identifier: AGPL-3.0-or-later
// The footer's LinkedIn link: an inline mark (no request to LinkedIn), a translated accessible name
// that contains the visible text, and a new tab so following it does not clear the photos.
import { expect, test } from '@playwright/test'

test.use({ locale: 'es-ES' })

test('LinkedIn link shows the inline mark and opens the author profile in a new tab', async ({ page }) => {
  const outside: string[] = []
  page.on('request', (r) => { if (r.url().includes('linkedin')) outside.push(r.url()) })
  await page.goto('/')
  const link = page.locator('#linkedin-link')
  await expect(link).toHaveAccessibleName('El autor en LinkedIn')
  await expect(link).toHaveText('LinkedIn')
  await expect(link).toHaveAttribute('href', 'https://www.linkedin.com/in/aasanchezo/')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  const mark = link.locator('svg.linkedin-mark')
  await expect(mark).toBeVisible()
  await expect(mark).toHaveAttribute('aria-hidden', 'true')
  await expect(link.locator('img')).toHaveCount(0)
  expect(outside).toEqual([])
})
