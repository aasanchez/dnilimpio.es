// SPDX-License-Identifier: AGPL-3.0-or-later
// Photo file checks (ADR 0031): type by content, size cap, pixel cap, on every way in.
import { readFileSync } from 'node:fs'
import { devices, expect, test, type Page } from '@playwright/test'
import { heicHeader, pngHeader } from '../image-headers.ts'
import { fixture, openCapture } from './helpers.ts'

test.use({ locale: 'es-ES' })

const PNG = readFileSync(fixture('synthetic-front.png'))
const BOMB = Buffer.from(pngHeader(100_000, 100_000)) // under 100 bytes, 10 000 MP once decoded
const PDF = Buffer.from('%PDF-1.7 not a photo')

/** Delivers bytes to the page as a dropped or pasted file. */
async function send (page: Page, how: 'drop' | 'paste', bytes: Buffer, name: string, type: string): Promise<void> {
  await page.evaluate(([how, b64, name, type]) => {
    const d = new DataTransfer()
    d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type }))
    if (how === 'drop') document.querySelector('#viewer')?.dispatchEvent(new DragEvent('drop', { dataTransfer: d, bubbles: true, cancelable: true }))
    else document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }))
  }, [how, bytes.toString('base64'), name, type] as const)
}

test('file picker: the content decides, not the name or MIME type', async ({ page }) => {
  await openCapture(page)
  await page.locator('#file-front').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: PNG })
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await page.locator('#file-back').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: PDF })
  await expect(page.locator('#error-back')).toContainText('no es una imagen')
  await expect(page.locator('#error-back')).toContainText('JPEG, PNG, WebP o HEIC')
})

test('file picker: a decompression bomb is refused before decoding, with the limit', async ({ page }) => {
  await openCapture(page)
  await page.locator('#file-front').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: BOMB })
  await expect(page.locator('#status-front')).toHaveAttribute('role', 'alert')
  await expect(page.locator('#error-front')).toContainText('demasiados píxeles (máximo 50 megapíxeles)')
  // The page still works: a normal photo loads next.
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#error-front')).toHaveCount(0)
})

test('file picker: a file over 25 MB is refused', async ({ page }) => {
  await openCapture(page)
  const big = Buffer.concat([PNG, Buffer.alloc(25 * 1024 * 1024)])
  await page.locator('#file-front').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: big })
  await expect(page.locator('#error-front')).toContainText('demasiado grande (máximo 25 MB)')
})

test('HEIC where the browser cannot decode it: a clear message with what to do', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium has no HEIC decoder; Safari 17+ has one')
  await openCapture(page)
  // No MIME type and an odd name, as some platforms send HEIC: the first bytes still say HEIC.
  await page.locator('#file-front').setInputFiles({ name: 'photo', mimeType: 'application/octet-stream', buffer: Buffer.from(heicHeader([[4032, 3024]])) })
  await expect(page.locator('#error-front')).toContainText('no puede abrir fotos HEIC')
})

for (const how of ['drop', 'paste'] as const) {
  test(`${how}: same checks as the file picker`, async ({ page }) => {
    await openCapture(page)
    await send(page, how, PDF, 'scan.png', 'image/png')
    await expect(page.locator('#error-front')).toContainText('no es una imagen')
    await send(page, how, BOMB, 'a.png', 'image/png')
    await expect(page.locator('#error-front')).toContainText('demasiados píxeles')
    await send(page, how, PNG, 'scan.pdf', 'application/pdf')
    await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  })
}

test.describe('on a touch device', () => {
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 7']
  test.use({ ...pixel, locale: 'es-ES' })

  test('camera input: same checks as the file picker', async ({ page }) => {
    await openCapture(page)
    await page.locator('#camera-front').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: BOMB })
    await expect(page.locator('#error-front')).toContainText('demasiados píxeles')
  })
})

test('the error is translated: English', async ({ browser }) => {
  const page = await browser.newPage({ locale: 'en-GB' })
  await openCapture(page)
  await page.locator('#file-front').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: BOMB })
  await expect(page.locator('#error-front')).toContainText('too many pixels (maximum 50 megapixels)')
  await page.close()
})
