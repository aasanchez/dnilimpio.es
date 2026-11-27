// SPDX-License-Identifier: AGPL-3.0-or-later
// Memory clean-up after processing: screens free their canvases when they close, Download and
// clear revokes the PDF's download link as it clears, and work still running for old photos cannot
// bring them back after a reset. (Secure erasure cannot be proven from a page; these check what the app controls.)
import { expect, test, type Page } from '@playwright/test'
import { chooseDoc, loadBoth, toEditor } from './helpers.ts'

test.use({ locale: 'es-ES' })

/** Logs to the console each object URL made for a PDF ("pdf <url>") and each URL revoked ("revoked <url>"). */
async function logUrls (page: Page): Promise<void> {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (o: Blob | MediaSource): string => {
      const url = create(o)
      if (o instanceof Blob && o.type === 'application/pdf') console.log(`pdf ${url}`)
      return url
    }
    URL.revokeObjectURL = (url: string): void => {
      console.log(`revoked ${url}`)
      revoke(url)
    }
  })
}

test('Download and clear revokes the PDF\'s download link as it clears, well before its 10 s timer', async ({ page }) => {
  await logUrls(page)
  // On the console too: "Download and clear" leaves the page for the thanks page (ADR 0029).
  const made: string[] = []
  const revoked: string[] = []
  page.on('console', (m) => {
    const [kind, url] = m.text().split(' ')
    if (kind === 'pdf' && url !== undefined) made.push(url)
    if (kind === 'revoked' && url !== undefined) revoked.push(url)
  })
  await toEditor(page)
  await page.locator('#review').click()
  await page.locator('#review-confirm').check()
  const started = Date.now()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  // The browser gets the whole PDF before the app clears itself.
  expect(await download.failure()).toBeNull()
  await expect(page.locator('#thanks-title')).toBeVisible()
  expect(made).toHaveLength(1)
  expect(revoked).toContain(made[0])
  expect(Date.now() - started).toBeLessThan(10_000)
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
