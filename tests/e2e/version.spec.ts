// SPDX-License-Identifier: AGPL-3.0-or-later
// The footer shows the running build: the release version linked to its GitHub Release (when the build
// has one, ADR 0032), the short commit SHA linked to GitHub, and the deploy time as relative time in
// the page's language. All are part of the bundle, so they also work offline.
import { expect, test, type Page } from '@playwright/test'

test.use({ locale: 'es-ES' })

const version = (page: Page) => page.locator('#build-version')
const shaLink = (page: Page) => version(page).locator('a[data-sha]')

// CI builds with RELEASE_VERSION (scripts/release-version.ts) and passes the same value to this test;
// a local build without it shows no version.
const RELEASE_VERSION = process.env['RELEASE_VERSION'] ?? ''

test('shows the release version, linked to its GitHub Release, or none when the build has none', async ({ page }) => {
  await page.goto('/')
  const link = version(page).locator('a[data-version]')
  if (RELEASE_VERSION === '') {
    await expect(link).toHaveCount(0)
    return
  }
  await expect(link).toHaveText(RELEASE_VERSION)
  await expect(link).toHaveAttribute('href', `https://github.com/aasanchez/dnilimpio.es/releases/tag/v${RELEASE_VERSION}`)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  // Version first, then the commit: "Versión 1.4.8 · 2a07023 · desplegado hace …".
  const text = (await version(page).innerText()).replace(/\s+/g, ' ').trim()
  expect(text.startsWith(`Versión ${RELEASE_VERSION} · ${await shaLink(page).innerText()} · desplegado `)).toBe(true)
})

test('shows the short commit SHA, linked to the commit on GitHub', async ({ page }) => {
  await page.goto('/')
  const link = shaLink(page)
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
    const online = await shaLink(page).getAttribute('data-sha')
    await context.setOffline(true)
    await page.reload()
    await expect(shaLink(page)).toHaveAttribute('data-sha', online ?? 'missing')
  })
})
