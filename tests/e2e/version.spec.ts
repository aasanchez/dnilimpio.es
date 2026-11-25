// SPDX-License-Identifier: AGPL-3.0-or-later
// The footer shows the running build: short commit SHA linked to GitHub, and the deploy time as
// relative time in the page's language. Both are part of the bundle, so they also work offline.
import { expect, test, type Page } from '@playwright/test'

test.use({ locale: 'es-ES' })

const version = (page: Page) => page.locator('#build-version')

test('shows the short commit SHA, linked to the commit on GitHub', async ({ page }) => {
  await page.goto('/')
  const link = version(page).locator('a')
  await expect(link).toHaveText(/^[0-9a-f]{7}$/)
  const sha = await link.getAttribute('data-sha') ?? ''
  expect(sha).toMatch(/^[0-9a-f]{40}$/)
  expect(sha.startsWith(await link.innerText())).toBe(true)
  await expect(link).toHaveAttribute('href', `https://github.com/aasanchez/dnilimpio.es/commit/${sha}`)
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

test('shows the deploy time as relative time, kept up to date and localized', async ({ browser, page }) => {
  await page.goto('/')
  const built = Date.parse(await version(page).locator('time').getAttribute('datetime') ?? '')
  expect(Number.isFinite(built)).toBe(true)

  const context = await browser.newContext({ locale: 'es-ES' })
  const later = await context.newPage()
  await later.clock.install({ time: built + 5 * 60_000 })
  await later.goto('/')
  const time = version(later).locator('time')
  await expect(time).toHaveText('desplegado hace 5 minutos')
  await later.clock.runFor(55 * 60_000)
  await expect(time).toHaveText('desplegado hace 1 hora')
  await later.locator('#lang').selectOption('en')
  await expect(version(later)).toContainText('Version')
  await expect(time).toHaveText('deployed 1 hour ago')
  await context.close()
})

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' })
  test('the same version shows after an offline reload', async ({ page, context }) => {
    await page.goto('/')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    const online = await version(page).locator('a').getAttribute('data-sha')
    await context.setOffline(true)
    await page.reload()
    await expect(version(page).locator('a')).toHaveAttribute('data-sha', online ?? 'missing')
  })
})
