// SPDX-License-Identifier: AGPL-3.0-or-later
// The footer's source code link: an inline GitHub mark (no request), readable text, and a new tab
// so following it does not clear the photos the user is working on.
import { expect, test } from '@playwright/test'

test.use({ locale: 'es-ES' })

test('source code link shows the inline GitHub mark and opens the repository in a new tab', async ({ page }) => {
  await page.goto('/')
  const link = page.locator('#source-link')
  await expect(link).toHaveAccessibleName('Código fuente')
  await expect(link).toHaveAttribute('href', 'https://github.com/aasanchez/dnitapado.es')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  const mark = link.locator('svg.github-mark')
  await expect(mark).toBeVisible()
  await expect(mark).toHaveAttribute('aria-hidden', 'true')
  await expect(link.locator('img')).toHaveCount(0)
})
