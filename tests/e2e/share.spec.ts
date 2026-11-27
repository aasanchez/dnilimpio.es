// SPDX-License-Identifier: AGPL-3.0-or-later
// Download or share, on the review screen. The user sends the PDF, never the app. Where the browser
// can share files, "Share and clear" hands the PDF to the system share sheet on the device, with a
// title and no text or link; the user picks the app and the person there. Elsewhere only "Download
// and clear" is shown. Once the PDF has left, the app clears everything and opens the thanks page.
import { expect, test, type Page } from '@playwright/test'
import { toEditor } from './helpers.ts'

test.use({ locale: 'es-ES' })

async function toReview (page: Page): Promise<void> {
  await toEditor(page)
  await page.locator('#review').click()
  await expect(page.locator('#download')).toBeDisabled()
}

interface ShareCall { names: string[]; types: string[]; sizes: number[]; keys: string[]; title: string | undefined; active: boolean }

/**
 * A share sheet stand-in: records each call, then answers as `answer` says. The calls are kept by
 * the test, not the page, because a successful share opens the thanks page (a new document).
 */
async function fakeShare (page: Page, answer: 'ok' | 'AbortError' | 'NotAllowedError'): Promise<ShareCall[]> {
  const calls: ShareCall[] = []
  await page.exposeFunction('recordShare', (c: ShareCall) => { calls.push(c) })
  await page.addInitScript((a) => {
    const record = (window as unknown as { recordShare: (c: unknown) => Promise<void> }).recordShare
    Object.defineProperty(navigator, 'canShare', { value: (d: ShareData) => (d.files?.length ?? 0) > 0 })
    Object.defineProperty(navigator, 'share', {
      value: async (d: ShareData): Promise<void> => {
        const files = d.files ?? []
        const active = navigator.userActivation.isActive
        await record({ names: files.map((f) => f.name), types: files.map((f) => f.type), sizes: files.map((f) => f.size), keys: Object.keys(d).sort(), title: d.title, active })
        if (a !== 'ok') throw new DOMException('no', a)
      },
    })
  }, answer)
  return calls
}

test('without file sharing, only Download and clear is shown; it saves the PDF, then opens the thanks page', async ({ page }) => {
  const sent: string[] = []
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173/')) sent.push(r.url()) })
  await page.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: undefined }) })
  await toReview(page)

  await expect(page.locator('#share-file')).toHaveCount(0)
  await expect(page.locator('#download')).toHaveClass(/primary/)
  await expect(page.locator('#download')).toHaveText('Descargar y borrar')
  await page.locator('#review-confirm').check()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  // The PDF is saved in full before the app clears itself.
  await expect(page.locator('#download-status')).toHaveText('PDF creado. Búscalo en tu carpeta de descargas.')
  await expect(page.locator('#download')).toBeDisabled()
  expect(await download.failure()).toBeNull()
  // No done screen: straight to the photo-free thanks page.
  await expect(page.locator('#thanks-title')).toHaveText('Tu documento ya no está aquí')
  expect(new URL(page.url()).pathname).toBe('/thanks.html')
  expect(sent).toEqual([])
})

test('Share and clear hands the PDF to the share sheet, within the click, with no text or link, then clears', async ({ page }) => {
  let downloaded = false
  page.on('download', () => { downloaded = true })
  const calls = await fakeShare(page, 'ok')
  await toReview(page)

  await expect(page.locator('#share-file')).toHaveText('Compartir y borrar')
  await expect(page.locator('#share-file')).toBeDisabled()
  await page.locator('#review-confirm').check()
  await page.locator('#share-file').click()

  await expect(page.locator('#thanks-title')).toHaveText('Tu documento ya no está aquí')
  const [call] = calls
  expect(call).toMatchObject({ names: ['protected-document.pdf'], types: ['application/pdf'], keys: ['files', 'title'], title: 'Documento con datos protegidos', active: true })
  expect((call?.sizes as number[])[0]).toBeGreaterThan(1000)
  expect(downloaded).toBe(false)
})

test('closing the share sheet keeps the review open, with no error; Download still works', async ({ page }) => {
  const calls = await fakeShare(page, 'AbortError')
  await toReview(page)
  await page.locator('#review-confirm').check()
  await page.locator('#share-file').click()
  await expect.poll(() => calls.length).toBe(1)
  // Nothing is cleared: the review and its photos stay.
  await page.waitForTimeout(300)
  await expect(page.locator('#review-title')).toBeVisible()
  await expect(page.locator('#review-front')).toBeVisible()
  await expect(page.locator('#share-error')).toHaveCount(0)
  await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  await expect(page.locator('#download-status')).toHaveText('PDF creado. Búscalo en tu carpeta de descargas.')
  await expect(page.locator('#thanks-title')).toBeVisible()
})

test('a failed share says so and offers Download', async ({ page }) => {
  await fakeShare(page, 'NotAllowedError')
  await toReview(page)
  await page.locator('#review-confirm').check()
  await page.locator('#share-file').click()
  await expect(page.locator('#share-error')).toHaveText('No se ha podido compartir. Vuelve a intentarlo o descarga el PDF.')
  await expect(page.locator('#download')).toBeEnabled()
  await expect(page.locator('#review-title')).toBeVisible()
})

test('going back during the 1.5 s after Download and clear still clears everything', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: undefined }) })
  await toReview(page)
  await page.locator('#review-confirm').check()
  await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  // Back to the editor before the app clears itself: the clear still happens.
  await page.locator('#back').click()
  await expect(page.locator('#thanks-title')).toHaveText('Tu documento ya no está aquí')
})
