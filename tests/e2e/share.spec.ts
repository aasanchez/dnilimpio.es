// SPDX-License-Identifier: AGPL-3.0-or-later
// Download or share, on the download screen. The user sends the PDF, never the app. Where the browser
// can share files, Share hands the PDF to the system share sheet on the device, with a title and no
// text or link; the user picks the app and the person there. Elsewhere only Download is shown.
import { expect, test, type Page } from '@playwright/test'
import { toEditor } from './helpers.ts'

test.use({ locale: 'es-ES' })

async function toReview (page: Page): Promise<void> {
  await toEditor(page)
  await page.locator('#review').click()
  await expect(page.locator('#download')).toBeDisabled()
}

/** A share sheet stand-in: records each call, then answers as `answer` says. */
async function fakeShare (page: Page, answer: 'ok' | 'AbortError' | 'NotAllowedError'): Promise<void> {
  await page.addInitScript((a) => {
    const calls: Array<{ names: string[]; types: string[]; sizes: number[]; keys: string[]; title: string | undefined; active: boolean }> = []
    Object.assign(window, { shareCalls: calls })
    Object.defineProperty(navigator, 'canShare', { value: (d: ShareData) => (d.files?.length ?? 0) > 0 })
    Object.defineProperty(navigator, 'share', {
      value: (d: ShareData): Promise<void> => {
        const files = d.files ?? []
        calls.push({ names: files.map((f) => f.name), types: files.map((f) => f.type), sizes: files.map((f) => f.size), keys: Object.keys(d).sort(), title: d.title, active: navigator.userActivation.isActive })
        return a === 'ok' ? Promise.resolve() : Promise.reject(new DOMException('no', a))
      },
    })
  }, answer)
}

const shareCalls = (page: Page): Promise<Array<Record<string, unknown>>> =>
  page.evaluate(() => (window as unknown as { shareCalls: Array<Record<string, unknown>> }).shareCalls)

test('without file sharing, only Download is shown and nothing leaves the page', async ({ page }) => {
  const sent: string[] = []
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173/')) sent.push(r.url()) })
  await page.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: undefined }) })
  await toReview(page)

  await expect(page.locator('#share-file')).toHaveCount(0)
  await expect(page.locator('#download')).toHaveClass(/primary/)
  await page.locator('#review-confirm').check()
  await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  await expect(page.locator('#download-status')).toHaveText('PDF creado. Búscalo en tu carpeta de descargas.')
  // No app links: the done screen has no way to send anything.
  await expect(page.locator('.done a[href^="http"], .done a[href^="mailto:"]')).toHaveCount(0)
  expect(sent).toEqual([])
})

test('Share hands the PDF to the system share sheet, within the click, with no text or link', async ({ page }) => {
  let downloaded = false
  page.on('download', () => { downloaded = true })
  await fakeShare(page, 'ok')
  await toReview(page)

  await expect(page.locator('#share-file')).toHaveText('Compartir')
  await expect(page.locator('#share-file')).toBeDisabled()
  await page.locator('#review-confirm').check()
  await page.locator('#share-file').click()

  await expect(page.locator('#download-status')).toHaveText('PDF compartido. No se ha guardado ninguna copia en tu carpeta de descargas.')
  const [call] = await shareCalls(page)
  expect(call).toMatchObject({ names: ['protected-document.pdf'], types: ['application/pdf'], keys: ['files', 'title'], title: 'Documento con datos protegidos', active: true })
  expect((call?.sizes as number[])[0]).toBeGreaterThan(1000)
  expect(downloaded).toBe(false)
})

test('closing the share sheet keeps the review open, with no error; Download still works', async ({ page }) => {
  await fakeShare(page, 'AbortError')
  await toReview(page)
  await page.locator('#review-confirm').check()
  await page.locator('#share-file').click()
  await expect.poll(async () => (await shareCalls(page)).length).toBe(1)
  await expect(page.locator('#review-title')).toBeVisible()
  await expect(page.locator('#share-error')).toHaveCount(0)
  await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  await expect(page.locator('#download-status')).toHaveText('PDF creado. Búscalo en tu carpeta de descargas.')
})

test('a failed share says so and offers Download', async ({ page }) => {
  await fakeShare(page, 'NotAllowedError')
  await toReview(page)
  await page.locator('#review-confirm').check()
  await page.locator('#share-file').click()
  await expect(page.locator('#share-error')).toHaveText('No se ha podido compartir. Vuelve a intentarlo o descarga el PDF.')
  await expect(page.locator('#download')).toBeEnabled()
})
