// SPDX-License-Identifier: AGPL-3.0-or-later
// The no-cookies notice on the start screen: it informs, needs no consent, and its dismissal is kept
// in memory only, so it stores nothing in the browser and comes back after a reload.
import { expect, test } from '@playwright/test'

test.use({ locale: 'es-ES' })

test('informs that there are no cookies, with no accept step', async ({ page }) => {
  await page.goto('/')
  const notice = page.locator('#privacy-notice')
  await expect(notice).toBeVisible()
  await expect(notice.getByRole('heading')).toHaveText('Aquí no hay cookies')
  await expect(notice).toContainText('Tus fotos no salen de tu dispositivo')
  // One button only, and it is not a consent choice.
  await expect(notice.getByRole('button')).toHaveCount(1)
  await expect(page.getByRole('complementary', { name: 'Aquí no hay cookies' })).toBeVisible()
  // The notice does not hide the main action.
  await expect(page.locator('#start')).toBeInViewport()
})

test('dismissal lasts for the visit, stores nothing and resets on reload', async ({ page }) => {
  await page.goto('/')
  await page.locator('#privacy-ok').click()
  await expect(page.locator('#privacy-notice')).toHaveCount(0)
  // Back to the start screen in the same visit: still dismissed.
  await page.locator('#start').click()
  await page.locator('#back').click()
  await expect(page.locator('#start')).toBeVisible()
  await expect(page.locator('#privacy-notice')).toHaveCount(0)

  const stored = await page.evaluate(async () => ({
    cookies: document.cookie, // eslint-disable-line no-restricted-properties
    local: localStorage.length, // eslint-disable-line no-restricted-properties
    session: sessionStorage.length, // eslint-disable-line no-restricted-properties
    databases: (await indexedDB.databases()).length, // eslint-disable-line no-restricted-properties
  }))
  expect(stored).toEqual({ cookies: '', local: 0, session: 0, databases: 0 })

  await page.reload()
  await expect(page.locator('#privacy-notice')).toBeVisible()
})

test('is translated and follows the page language', async ({ page }) => {
  await page.goto('/')
  await page.locator('.lang select').selectOption('en')
  await expect(page.locator('#privacy-notice h2')).toHaveText('No cookies here')
  await expect(page.locator('#privacy-ok')).toHaveText('Got it')
})
