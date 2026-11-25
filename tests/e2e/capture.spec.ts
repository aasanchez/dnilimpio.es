// SPDX-License-Identifier: AGPL-3.0-or-later
import { devices, expect, test } from '@playwright/test'
import { fixture, openCapture } from './helpers.ts'

test.use({ locale: 'es-ES' })

test('the start screen leads to the document picker, then to the photo step, front first', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
  await page.locator('#start').click()
  await expect(page.locator('h2')).toHaveText('¿Qué documento vas a copiar?')
  await expect(page.locator('h2')).toBeFocused()
  await expect(page.locator('.progress [aria-current="step"]')).toContainText('Fotos')
  // Four documents; DNI 4.0 is preselected.
  await expect(page.locator('input[name="doc"]')).toHaveCount(4)
  await expect(page.locator('[id="doc-dni-4.0"]')).toBeChecked()
  await page.locator('#doc-continue').click()
  await expect(page.locator('h2')).toHaveText('Foto del anverso')
  await expect(page.locator('h2')).toBeFocused()
  await expect(page.locator('.progress [aria-current="step"]')).toContainText('Fotos')
})

test('loads front and back through the file inputs, moving to the back by itself', async ({ page }) => {
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('h2')).toHaveText('Foto del reverso')
  await expect(page.locator('#pick-back')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await expect(page.locator('#status-back')).toHaveText('Imagen cargada.')
  await expect(page.locator('#capture-continue')).toBeEnabled()
  const input = page.locator('#file-front')
  await expect(input).toHaveAttribute('accept', 'image/*')
  // `capture` would force the camera on mobile and block picking from the gallery.
  await expect(input).not.toHaveAttribute('capture')
  await expect(page.locator('#file-back')).not.toHaveAttribute('capture')
})

test('desktop shows only the choose-image button', async ({ page }) => {
  await openCapture(page)
  await expect(page.getByText('Elegir imagen').filter({ visible: true })).toHaveCount(1)
  await expect(page.getByText('Hacer foto')).toHaveCount(0)
  await expect(page.locator('#camera-front')).toHaveCount(0)
})

test.describe('on a touch device', () => {
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 7']
  test.use({ ...pixel, locale: 'es-ES' })

  test('shows take-photo and gallery buttons for the side on screen', async ({ page }) => {
    await openCapture(page)
    await expect(page.getByText('Hacer foto').filter({ visible: true })).toHaveCount(1)
    await expect(page.getByText('Galería').filter({ visible: true })).toHaveCount(1)
    await expect(page.locator('#camera-front')).toHaveAttribute('capture', 'environment')
    await expect(page.locator('#camera-back')).toHaveAttribute('capture', 'environment')
    await expect(page.locator('#file-front')).not.toHaveAttribute('capture')
    // A photo from the camera input loads the same way as one from the gallery.
    await page.locator('#camera-back').setInputFiles(fixture('synthetic-back.png'))
    await expect(page.locator('#status-back')).toHaveText('Imagen cargada.')
  })
})

test('shows a clear error for a non-image file', async ({ page }) => {
  await openCapture(page)
  await page.locator('#file-front').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') })
  await expect(page.locator('#status-front')).toHaveAttribute('role', 'alert')
  await expect(page.locator('#status-front')).toContainText('no es una imagen')
  await expect(page.locator('#error-front')).toBeVisible()
})

test('shows a decode error for a corrupt image', async ({ page }) => {
  await openCapture(page)
  await page.locator('#file-back').setInputFiles({ name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a jpeg') })
  await expect(page.locator('#status-back')).toContainText('No se ha podido abrir')
})

test('accepts a dropped image', async ({ page }) => {
  await openCapture(page)
  const bytes = (await import('node:fs')).readFileSync(fixture('synthetic-front.png')).toString('base64')
  const dt = await page.evaluateHandle((b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const d = new DataTransfer()
    d.items.add(new File([bin], 'card.png', { type: 'image/png' }))
    return d
  }, bytes)
  const zone = page.locator('.dropzone').first()
  await zone.dispatchEvent('dragover', { dataTransfer: dt })
  await zone.dispatchEvent('drop', { dataTransfer: dt })
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
})

test('switching language keeps loaded images and updates text', async ({ page }) => {
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  // Mark the selector node: a language change must update text in place, not rebuild the page
  // (a rebuilt selector would drop keyboard focus).
  await page.locator('#lang').evaluate((n) => { n.dataset['probe'] = '1' })
  await page.locator('#lang').selectOption('eu')
  await expect(page.locator('html')).toHaveAttribute('lang', 'eu')
  await expect(page.locator('#status-front')).toHaveText('Irudia kargatu da.')
  await expect(page.locator('#lang')).toHaveAttribute('data-probe', '1')
})

test('Arabic switches the page to right-to-left', async ({ page }) => {
  await page.goto('/')
  await page.locator('#lang').selectOption('ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.locator('#lang').selectOption('fr')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
})
