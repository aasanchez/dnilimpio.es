// SPDX-License-Identifier: AGPL-3.0-or-later
// Memory clean-up after processing: screens free their canvases when they close, Clear all revokes
// the PDF's download link at once, and work still running for old photos cannot bring them back
// after a reset. (Secure erasure cannot be proven from a page; these check what the app controls.)
import { expect, test, type Page } from '@playwright/test'
import { chooseDoc, loadBoth, toEditor } from './helpers.ts'

test.use({ locale: 'es-ES' })

/** Records the object URLs made for PDFs and the URLs revoked, in window.urlLog. */
async function logUrls (page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log = { pdf: [] as string[], revoked: [] as string[] }
    Object.assign(window, { urlLog: log })
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (o: Blob | MediaSource): string => {
      const url = create(o)
      if (o instanceof Blob && o.type === 'application/pdf') log.pdf.push(url)
      return url
    }
    URL.revokeObjectURL = (url: string): void => {
      log.revoked.push(url)
      revoke(url)
    }
  })
}

const urlLog = async (page: Page): Promise<{ pdf: string[]; revoked: string[] }> =>
  await page.evaluate(() => (window as unknown as { urlLog: { pdf: string[]; revoked: string[] } }).urlLog)

test('Clear all revokes the PDF\'s download link at once', async ({ page }) => {
  await logUrls(page)
  await toEditor(page)
  await page.locator('#review').click()
  await page.locator('#review-confirm').check()
  await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  await expect(page.locator('#reset-done')).toBeVisible()
  const before = await urlLog(page)
  expect(before.pdf).toHaveLength(1)
  // Still open: the browser may need it for a moment after the click (the delay is 10 s).
  expect(before.revoked).not.toContain(before.pdf[0])

  await page.locator('#reset-done').click()
  await expect(page.locator('h2')).toHaveText('Foto del anverso')
  expect((await urlLog(page)).revoked).toContain(before.pdf[0])
})

test('screens free their canvases when they close', async ({ page }) => {
  await loadBoth(page)
  const viewer = await page.locator('#viewer canvas').elementHandle()
  expect(await viewer.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0)
  await chooseDoc(page)
  await expect(page.locator('#preview')).toHaveJSProperty('width', 1712)
  // The photo preview of the capture step is gone and holds no pixels.
  expect(await viewer.evaluate((c: HTMLCanvasElement) => [c.isConnected, c.width, c.height])).toEqual([false, 0, 0])

  const preview = await page.locator('#preview').elementHandle()
  await page.locator('#reset').click()
  await expect(page.locator('h2')).toHaveText('Foto del anverso')
  expect(await preview.evaluate((c: HTMLCanvasElement) => [c.isConnected, c.width, c.height])).toEqual([false, 0, 0])
})

test('a reset while the photos are being straightened: the late result does not come back', async ({ page }) => {
  // The corner model answers only after a while (then fails), so straightening is still running
  // when the page is left.
  await page.route('**/assets/ml/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500))
    await route.abort('internetdisconnected')
  })
  await loadBoth(page, { model: true })
  await chooseDoc(page)
  await expect(page.locator('#straighten-status')).toBeVisible()
  await page.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })) })
  await expect(page.locator('h2')).toHaveText('Foto del anverso')
  // Give the model time to fail and edge detection time to answer: nothing may come back.
  await page.waitForTimeout(4000)
  await expect(page.locator('h2')).toHaveText('Foto del anverso')
  await expect(page.locator('#status-front')).toHaveText('')
  await expect(page.locator('#capture-continue')).toHaveCount(0)
  await expect(page.locator('#preview')).toHaveCount(0)
})
