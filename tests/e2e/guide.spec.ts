// SPDX-License-Identifier: AGPL-3.0-or-later
// Card guide: opens from the start screen and from each editor field, shows its sources as text
// with links that open in a new tab, says so when a source is missing, and requests nothing outside
// the app.
import { expect, test } from '@playwright/test'
import { toAuto } from './helpers.ts'

test.use({ locale: 'es-ES' })

test('opens from the start screen, cites sources and makes no outside requests', async ({ page }) => {
  const outside: string[] = []
  page.on('request', (r) => { if (new URL(r.url()).hostname !== 'localhost') outside.push(r.url()) })
  await page.goto('/')
  await page.locator('#guide-open').click()
  const dialog = page.locator('dialog.guide')
  await expect(dialog).toBeVisible()
  await expect(page.locator('#guide-title')).toHaveText('¿Qué hay en tu tarjeta?')
  await expect(page.locator('#guide-tab-dni-4\\.0')).toHaveAttribute('aria-selected', 'true')

  // Every statement carries a citation; every source link opens in a new tab.
  await page.locator('#guide-mrz summary').click()
  await expect(page.locator('#guide-mrz .guide-cites').first()).toContainText('art. 12.b)')
  const links = dialog.locator('.guide-sources a')
  expect(await links.count()).toBeGreaterThan(5)
  for (const a of await links.all()) {
    await expect(a).toHaveAttribute('target', '_blank')
    await expect(a).toHaveAttribute('rel', 'noopener noreferrer')
    expect(await a.getAttribute('href')).toMatch(/^https:\/\//)
  }

  // An element without an official source says so instead of guessing.
  await page.locator('#guide-tab-tie').click()
  await page.locator('#guide-nie summary').click()
  await expect(page.locator('#guide-nie .guide-none').first()).toHaveText(/No hemos encontrado una fuente oficial/)

  await page.locator('#guide-close').click()
  await expect(dialog).toBeHidden()
  expect(outside).toEqual([])
})

test('the ⓘ beside a field opens its entry and leaves the editor as it was', async ({ page }) => {
  await toAuto(page)
  const can = page.locator('#field-can')
  await expect(can).toBeChecked()
  await page.locator('#about-can').click()
  await expect(page.locator('dialog.guide')).toBeVisible()
  const entry = page.locator('details#guide-can')
  await expect(entry).toHaveAttribute('open', '')
  await expect(entry).toBeInViewport()
  await expect(entry).toContainText('PACE')
  await page.locator('#guide-close').click()
  await expect(can).toBeChecked()
  await expect(page.locator('#preview')).toBeVisible()
})

test('follows the interface language', async ({ page }) => {
  await page.goto('/')
  await page.locator('#lang').selectOption('en')
  await page.locator('#guide-open').click()
  await expect(page.locator('#guide-title')).toHaveText('What is on your card?')
})
