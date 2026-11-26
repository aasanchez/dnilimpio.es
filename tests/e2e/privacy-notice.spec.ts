// SPDX-License-Identifier: AGPL-3.0-or-later
// The no-cookies notice on the start screen: it informs and needs no consent. Closing it stores only
// the date, so it shows at most once every 4 days.
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

test('once closed, it stays away for 4 days; only the closing date is stored', async ({ page }) => {
  const t0 = Date.parse('2026-11-25T12:00:00Z')
  await page.clock.install({ time: t0 })
  await page.goto('/')
  await page.locator('#privacy-ok').click()
  await expect(page.locator('#privacy-notice')).toHaveCount(0)
  // Back to the start screen in the same visit: still closed.
  await page.locator('#start').click()
  await page.locator('#back').click()
  await expect(page.locator('#start')).toBeVisible()
  await expect(page.locator('#privacy-notice')).toHaveCount(0)

  const stored = await page.evaluate(async () => ({
    cookies: document.cookie, // eslint-disable-line no-restricted-properties
    local: Object.entries(localStorage),
    session: sessionStorage.length, // eslint-disable-line no-restricted-properties
    databases: (await indexedDB.databases()).length, // eslint-disable-line no-restricted-properties
  }))
  expect(stored).toEqual({ cookies: '', local: [['dnilimpio.noticeDismissedAt', expect.stringMatching(/^2026-11-25T12:00:00\.\d{3}Z$/)]], session: 0, databases: 0 })

  // Three days and 23 hours later: still closed.
  await page.clock.setSystemTime(t0 + (4 * 24 - 1) * 3600_000)
  await page.reload()
  await expect(page.locator('#start')).toBeVisible()
  await expect(page.locator('#privacy-notice')).toHaveCount(0)
  // Four days (and a minute) later: it shows again.
  await page.clock.setSystemTime(t0 + 4 * 24 * 3600_000 + 60_000)
  await page.reload()
  await expect(page.locator('#privacy-notice')).toBeVisible()
})

test('still works when the browser blocks storage: it shows on every visit', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get () { throw new DOMException('blocked', 'SecurityError') } })
  })
  await page.goto('/')
  await page.locator('#privacy-ok').click()
  await expect(page.locator('#privacy-notice')).toHaveCount(0)
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
  expect(await page.evaluate(async () => await navigator.clipboard.readText())).toContain("connect-src 'self' https://cloudflareinsights.com only")
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Still reachable once the notice is dismissed.
  await page.locator('#privacy-ok').click()
  await page.locator('#audit-footer').click()
  await expect(page.getByRole('dialog', { name: 'Audita el código tú mismo' })).toBeVisible()
  await page.locator('#audit-footer-close').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]] as const) {
  test(`takes 80 % of the screen width, centred, at ${String(width)} px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    const box = await page.locator('#privacy-notice').boundingBox()
    expect(box).not.toBeNull()
    expect(Math.abs((box?.width ?? 0) - width * 0.8)).toBeLessThanOrEqual(1)
    expect(Math.abs((box?.x ?? 0) - width * 0.1)).toBeLessThanOrEqual(1)
    // No sideways scrolling.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  })
}
