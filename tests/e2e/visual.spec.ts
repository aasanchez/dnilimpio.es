// SPDX-License-Identifier: AGPL-3.0-or-later
// Visual regression: key screens as a phone shows them (390 × 844 px viewport), in Spanish and in Arabic
// (right-to-left), compared with the baselines in tests/e2e/__screenshots__/. These tests run only
// in the pinned Playwright container (`pnpm test:visual`, CI job `visual`), because text rendering
// depends on the browser build and the system fonts. README "Visual regression" says how to update
// the baselines.
import { expect, test, type Page } from '@playwright/test'
import { blockModel, fixture, openCapture } from './helpers.ts'

// A fixed clock: the watermark presets show today's date.
const NOW = new Date('2026-01-15T10:00:00+01:00')

/** Parts that change with every build: version, commit SHA and "deployed … ago". */
const CHANGING = ['#build-version']

/** Both synthetic photos, DNI chosen, straightened by edge detection: ends in the editor. Any language. */
async function toEditor (page: Page, path = '/'): Promise<void> {
  await openCapture(page, path)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await page.locator('#capture-continue').click()
  await page.locator('#doc-dni').check()
  await page.locator('#doc-continue').click()
  await expect(page.locator('#preview')).toHaveJSProperty('width', 1712)
}

/**
 * One viewport, not the full page: sticky bars then sit where a phone shows them. `bottom` scrolls
 * to the end of the page first (the footer). `hide` lists more parts that change between runs.
 *
 * Changing parts are hidden (they keep their space) rather than masked: Playwright draws masks in
 * the top layer, where the app's `::backdrop` tint would darken the whole screenshot, and the CSP
 * refuses the style Playwright would add to undo it.
 */
async function shot (page: Page, name: string, { hide = [], bottom = false }: { hide?: string[]; bottom?: boolean } = {}): Promise<void> {
  await page.evaluate(async ([selectors, end]) => {
    // Fonts are self-hosted; wait until every face in use has loaded.
    await document.fonts.ready
    for (const el of document.querySelectorAll<HTMLElement>(selectors.join(','))) el.style.visibility = 'hidden'
    scrollTo(0, end ? document.documentElement.scrollHeight : 0)
  }, [[...CHANGING, ...hide], bottom] as const)
  await expect(page).toHaveScreenshot(`${name}.png`)
}

for (const lang of ['es', 'ar'] as const) {
  test.describe(lang, () => {
    test.use({ locale: lang === 'es' ? 'es-ES' : 'ar', timezoneId: 'Europe/Madrid', viewport: { width: 390, height: 844 } })

    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(NOW)
      // On-device AI stays off: the screens show the manual path, the same on every run.
      await blockModel(page)
      await page.route('**/ocr/**', (route) => route.abort('internetdisconnected'))
    })

    test('start screen', async ({ page }) => {
      await page.goto(lang === 'es' ? '/' : `/${lang}`)
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
      // The served HTML already shows a Spanish copy of this screen (ADR 0041): shoot the live app.
      await expect(page.locator('[data-prerendered]')).toHaveCount(0)
      await expect(page.locator('#start')).toBeVisible()
      await shot(page, `${lang}-1-start`)
      await shot(page, `${lang}-1-start-footer`, { bottom: true })
    })

    test('editor, review and stats page', async ({ page }) => {
      await toEditor(page, lang === 'es' ? '/' : `/${lang}`)
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
      await shot(page, `${lang}-2-editor`)
      await shot(page, `${lang}-2-editor-tools`, { bottom: true })

      await page.locator('#review').click()
      await expect(page.locator('#review-confirm')).toBeVisible()
      await shot(page, `${lang}-3-review`)

      await page.locator('#review-confirm').check()
      await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
      await page.locator('#stats-link').click()
      await expect(page.locator('#thanks-title')).toBeVisible()
      // The text to send names the build (app=<commit>) and the browser version.
      await shot(page, `${lang}-4-stats`, { hide: ['#stats-payload'] })
    })
  })
}
