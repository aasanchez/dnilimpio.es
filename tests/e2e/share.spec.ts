// SPDX-License-Identifier: AGPL-3.0-or-later
// Sending the PDF after the download: the user sends it, never the app. Where the browser can share
// files, one button opens the system share sheet with the PDF. The app links (WhatsApp, Telegram,
// Gmail, mail app) are always plain links that carry a fixed message, no file and no data from the
// document: no link can carry a file, and the app uploads the PDF nowhere to make one.
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

const message = 'Te envío mi documento con los datos protegidos (protected-document.pdf).'
const subject = 'Documento con datos protegidos'

async function expectLinks (page: Page): Promise<void> {
  const m = encodeURIComponent(message)
  const s = encodeURIComponent(subject)
  const links = [
    ['whatsapp', 'WhatsApp', `https://wa.me/?text=${m}`],
    ['telegram', 'Telegram', `https://t.me/share/url?url=${encodeURIComponent('https://dnitapado.es/')}&text=${m}`],
    ['gmail', 'Gmail', `https://mail.google.com/mail/?view=cm&fs=1&su=${s}&body=${m}`],
  ] as const
  for (const [id, name, href] of links) {
    const a = page.locator(`a#share-${id}`)
    await expect(a).toHaveText(name)
    await expect(a).toHaveAttribute('href', href)
    await expect(a).toHaveAttribute('target', '_blank')
    await expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  }
  const mail = page.locator('a#share-email')
  await expect(mail).toHaveText('Correo')
  await expect(mail).toHaveAttribute('href', `mailto:?subject=${s}&body=${m}`)
  await expect(mail).not.toHaveAttribute('target', /./)
  await expect(page.locator('#share-links a')).toHaveCount(4)
}

test('without file sharing, the four apps are links with a fixed message and no file', async ({ page }) => {
  const sent: string[] = []
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173/')) sent.push(r.url()) })
  await page.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: undefined }) })
  await toDone(page)

  await expect(page.locator('#send-lead')).toContainText('adjúntalo tú')
  await expect(page.locator('#share-file')).toHaveCount(0)
  await expectLinks(page)
  // Nothing went anywhere just by reaching this screen.
  expect(sent).toEqual([])
})

test('with file sharing, one button hands the PDF to the system share sheet; the links stay as a fallback', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ names: string[]; types: string[]; title: string | undefined; text: string | undefined; url: string | undefined }> = []
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

  await expect(page.locator('#send-lead')).toContainText('con el PDF adjunto')
  await expect(page.locator('#send-links-lead')).toContainText('sin el PDF')
  await page.locator('button#share-file').click()
  await page.locator('button#share-file').click()
  const calls = await page.evaluate(() => (window as unknown as { shareCalls: unknown[] }).shareCalls)
  // Only the file and a title: no text or URL that could hold data.
  const one = { names: ['protected-document.pdf'], types: ['application/pdf'], title: subject }
  expect(calls).toEqual([one, one])
  await expect(page.locator('.send [role=alert]')).toHaveCount(0)
  await expectLinks(page)
})

test('a failed share says the PDF is still in the downloads folder', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true })
    Object.defineProperty(navigator, 'share', { value: (): Promise<void> => Promise.reject(new DOMException('denied', 'NotAllowedError')) })
  })
  await toDone(page)
  await page.locator('#share-file').click()
  await expect(page.locator('.send [role=alert]')).toHaveText('No se ha podido compartir. El PDF sigue en tu carpeta de descargas.')
})
