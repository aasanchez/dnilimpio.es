// SPDX-License-Identifier: AGPL-3.0-or-later
// The no-cookies notice on the start screen: it informs, needs no consent, and its dismissal is kept
// in memory only, so it stores nothing in the browser and comes back after a reload.
import { expect, test } from '@playwright/test'

test.use({ locale: 'es-ES' })

test('informs that there are no cookies, with no accept step', async ({ page }) => {
  await page.goto('/')
  const notice = page.locator('#privacy-notice')
  await expect(notice).toBeVisible()
  await expect(notice.getByRole('heading')).toHaveText('Bruselas estaría orgullosa')
  await expect(notice).toContainText('Tus fotos no salen de tu dispositivo')
  // No consent choice: one button closes it, the other opens the audit prompt.
  await expect(notice.getByRole('button')).toHaveText(['Compruébalo con tu IA →', 'Me lo creo'])
  await expect(page.getByRole('complementary', { name: 'Bruselas estaría orgullosa' })).toBeVisible()
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
  await expect(page.locator('#privacy-title')).toHaveText('Brussels would be proud')
  await expect(page.locator('#privacy-ok')).toHaveText('I believe you')
})

test('offers an audit prompt to copy into an AI coding agent, from the notice and the footer', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.locator('#audit-notice').click()
  const dialog = page.getByRole('dialog', { name: 'Audita el código tú mismo' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('textarea')).toHaveValue(/^Perform a deep security and privacy audit of the codebase at https:\/\/github\.com\/aasanchez\/dnilimpio\.es/)
  await page.locator('#audit-notice-copy').click()
  await expect(dialog.getByRole('status')).toHaveText('Copiado')
  expect(await page.evaluate(async () => await navigator.clipboard.readText())).toContain('connect-src \'none\'')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Still reachable once the notice is dismissed.
  await page.locator('#privacy-ok').click()
  await page.locator('#audit-footer').click()
  await expect(page.getByRole('dialog', { name: 'Audita el código tú mismo' })).toBeVisible()
  await page.locator('#audit-footer-close').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
