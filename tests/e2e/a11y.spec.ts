// SPDX-License-Identifier: AGPL-3.0-or-later
// Automatic accessibility scan (axe-core, ADR 0042) of every screen, in Spanish and in Arabic (right
// to left), on a wide screen in light mode and on a phone in dark mode. Fails on any serious or
// critical finding. Moderate and minor findings are printed, not failed (see the README).
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { blockModel, fixture } from './helpers.ts'

/** WCAG 2.0, 2.1 and 2.2 at levels A and AA, and axe's best practices. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

/**
 * Scans the screen from the top of the page; returns the serious and critical findings, one line
 * each, and prints the others. From the top, because axe measures touch targets as they are on
 * screen: a control scrolled away under the sticky top bar counts as too small, and that depends on
 * where the last click left the scroll, not on the screen.
 */
async function scan (page: Page, screen: string): Promise<string[]> {
  await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }) })
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const line = (v: (typeof violations)[number]): string =>
    `${screen}: ${String(v.impact)} ${v.id} (${v.help}) at ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`
  const blocking = (v: (typeof violations)[number]): boolean => v.impact === 'serious' || v.impact === 'critical'
  for (const v of violations) if (!blocking(v)) console.log(line(v))
  return violations.filter(blocking).map(line)
}

const SETUPS = [
  { name: 'es, wide screen, light', locale: 'es-ES', colorScheme: 'light', viewport: { width: 1280, height: 720 } },
  { name: 'ar, wide screen, light', locale: 'ar', colorScheme: 'light', viewport: { width: 1280, height: 720 } },
  { name: 'es, phone, dark', locale: 'es-ES', colorScheme: 'dark', viewport: { width: 390, height: 844 } },
  { name: 'ar, phone, dark', locale: 'ar', colorScheme: 'dark', viewport: { width: 390, height: 844 } },
] as const

for (const { name, locale, colorScheme, viewport } of SETUPS) {
  test.describe(`accessibility scan (${name})`, () => {
    test.use({ locale, colorScheme, viewport })

    test('every screen, from the start screen to the thanks page, has no serious or critical finding', async ({ page }) => {
      test.setTimeout(90_000)
      const found: string[] = []
      await blockModel(page)
      await page.goto('/')
      await expect(page.locator('#start')).toBeVisible()
      found.push(...await scan(page, 'start screen'))

      // Dialogs on the start screen.
      await page.locator('#guide-open').click()
      await expect(page.locator('dialog.guide')).toBeVisible()
      found.push(...await scan(page, 'card guide'))
      await page.keyboard.press('Escape')
      await page.locator('#privacy-ok').click()
      await page.locator('#audit-footer').click()
      await expect(page.locator('#audit-footer-close')).toBeVisible()
      found.push(...await scan(page, 'audit prompt'))
      await page.keyboard.press('Escape')

      // Photos: empty, then both loaded.
      await page.locator('#start').click()
      await expect(page.locator('#file-front')).toBeAttached()
      found.push(...await scan(page, 'photo step, empty'))
      await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
      await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
      await expect(page.locator('#capture-continue')).toBeEnabled()
      found.push(...await scan(page, 'photo step, both photos'))

      // Document choice.
      await page.locator('#capture-continue').click()
      await expect(page.locator('#doc-dni')).toBeVisible()
      found.push(...await scan(page, 'document choice'))
      await page.locator('#doc-dni').check()
      await page.locator('#doc-continue').click()

      // Editor: each tool, with a box and a watermark.
      await expect(page.locator('#preview')).toHaveJSProperty('width', 1712, { timeout: 30_000 })
      found.push(...await scan(page, 'editor, data'))
      await page.locator('#adjust-zones').click()
      found.push(...await scan(page, 'editor, adjusting boxes'))
      await page.locator('#adjust-zones').click()
      await page.locator('#tool-boxes').click()
      await page.locator('#add-box').click()
      found.push(...await scan(page, 'editor, boxes'))
      await page.locator('#tool-mark').click()
      await page.locator('#watermark').fill('Solo para X')
      found.push(...await scan(page, 'editor, watermark'))

      // Corners.
      await page.locator('#adjust-front').click()
      await expect(page.locator('canvas.corner-editor')).toBeVisible()
      found.push(...await scan(page, 'corners'))
      await page.locator('#align-continue').click()
      await expect(page.locator('#preview')).toHaveJSProperty('width', 1712, { timeout: 30_000 })

      // Review, before and after the download.
      await page.locator('#review').click()
      await expect(page.locator('#review-title')).toBeVisible()
      found.push(...await scan(page, 'review'))
      await page.locator('#review-confirm').check()
      await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
      await expect(page.locator('#stats-link')).toBeVisible()
      found.push(...await scan(page, 'review, after the download'))

      // The photo-free thanks page, reached as users reach it: with the session figures to send.
      await page.locator('#stats-link').click()
      await expect(page.locator('#stats-send')).toBeVisible()
      found.push(...await scan(page, 'thanks page'))

      expect(found, 'serious or critical accessibility findings').toEqual([])
    })
  })
}
