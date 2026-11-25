// SPDX-License-Identifier: AGPL-3.0-or-later
// Sending the PDF after the download: the user sends it, never the app. Where the browser can share
// files, both buttons open the system share sheet with the PDF. Elsewhere they are plain links
// (wa.me, mailto:) that carry a fixed message and no data from the document.
import { expect, test, type Page } from '@playwright/test'
import { toEditor } from './helpers.ts'

test.use({ locale: 'es-ES' })

async function toDone (page: Page): Promise<void> {
  await toEditor(page)
  await page.locator('#review').click()
  await page.locator('#review-confirm').check()
  await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  await expect(page.locator('#send-title')).toHaveText('Envíalo tú')
}

test('without file sharing, WhatsApp and email are links with a fixed message and no file', async ({ page }) => {
  const sent: string[] = []
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173/')) sent.push(r.url()) })
  await page.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: undefined }) })
  await toDone(page)

  await expect(page.locator('#send-lead')).toContainText('adjunta tú el PDF')
  const message = 'Te envío mi documento con los datos protegidos (protected-document.pdf).'
  const wa = page.locator('a#share-whatsapp')
  await expect(wa).toHaveText('Compartir por WhatsApp')
  await expect(wa).toHaveAttribute('href', `https://wa.me/?text=${encodeURIComponent(message)}`)
  await expect(wa).toHaveAttribute('rel', 'noopener noreferrer')
  const mail = page.locator('a#share-email')
  await expect(mail).toHaveText('Compartir por email')
  await expect(mail).toHaveAttribute('href', `mailto:?subject=${encodeURIComponent('Documento con datos protegidos')}&body=${encodeURIComponent(message)}`)
  // Nothing went anywhere just by reaching this screen.
  expect(sent).toEqual([])
})

test('with file sharing, both buttons hand the PDF to the system share sheet', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ names: string[]; types: string[]; title?: string; text?: string; url?: string }> = []
    Object.assign(window, { shareCalls: calls })
    Object.defineProperty(navigator, 'canShare', { value: (d: ShareData) => (d.files?.length ?? 0) > 0 })
    Object.defineProperty(navigator, 'share', {
      value: (d: ShareData): Promise<void> => {
        calls.push({ names: (d.files ?? []).map((f) => f.name), types: (d.files ?? []).map((f) => f.type), title: d.title, text: d.text, url: d.url })
        // The second call simulates the user closing the sheet: no error is shown.
        return calls.length === 2 ? Promise.reject(new DOMException('closed', 'AbortError')) : Promise.resolve()
      },
    })
  })
  await toDone(page)

  await expect(page.locator('#send-lead')).toContainText('Se abre el menú de compartir')
  await page.locator('button#share-whatsapp').click()
  await page.locator('button#share-email').click()
  const calls = await page.evaluate(() => (window as unknown as { shareCalls: unknown[] }).shareCalls)
  const one = { names: ['protected-document.pdf'], types: ['application/pdf'], title: 'Documento con datos protegidos' }
  expect(calls).toEqual([one, one])
  await expect(page.locator('.send [role=alert]')).toHaveCount(0)
})

test('a failed share says the PDF is still in the downloads folder', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true })
    Object.defineProperty(navigator, 'share', { value: (): Promise<void> => Promise.reject(new DOMException('denied', 'NotAllowedError')) })
  })
  await toDone(page)
  await page.locator('#share-email').click()
  await expect(page.locator('.send [role=alert]')).toHaveText('No se ha podido compartir. El PDF sigue en tu carpeta de descargas.')
})
