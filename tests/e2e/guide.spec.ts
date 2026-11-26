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
  await expect(page.locator('#guide-tab-dni')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#guide-ver-dni-4\\.0')).toHaveAttribute('aria-pressed', 'true')

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

  // The NIE cites its source; a part without an official source says so instead of guessing.
  await page.locator('#guide-tab-tie').click()
  await page.locator('#guide-nie summary').click()
  await expect(page.locator('#guide-nie .guide-cites').first()).toContainText('¿Qué es el NIE?')
  await page.locator('#guide-issuePlace summary').click()
  await expect(page.locator('#guide-issuePlace .guide-none').first()).toHaveText(/Ninguna de las fuentes oficiales/)

  // One DNI tab, with its two versions; the version shown is kept across tabs.
  await expect(page.locator('#guide-ver-dni-3\\.0')).toHaveCount(0)
  await page.locator('#guide-tab-dni').click()
  await page.locator('#guide-ver-dni-3\\.0').click()
  await expect(page.locator('#guide-ver-dni-3\\.0')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('#guide-tab-tie').click()
  await page.locator('#guide-tab-dni').click()
  await expect(page.locator('#guide-ver-dni-3\\.0')).toHaveAttribute('aria-pressed', 'true')

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
  // Collapsed by the reader, the entry opens again on the next ⓘ.
  await entry.locator('summary').click()
  await expect(entry).not.toHaveAttribute('open', '')
  await page.locator('#guide-close').click()
  await page.locator('#about-can').click()
  await expect(entry).toHaveAttribute('open', '')
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
