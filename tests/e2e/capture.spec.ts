// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const fixture = (name: string): string => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))

test.use({ locale: 'es-ES' })

test('loads front and back through the file inputs', async ({ page }) => {
  await page.goto('/')
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#status-back')).toHaveText('Imagen cargada.')
  const input = page.locator('#file-front')
  await expect(input).toHaveAttribute('accept', 'image/*')
  // `capture` would force the camera on mobile and block picking from the gallery.
  await expect(input).not.toHaveAttribute('capture')
  await expect(page.locator('#file-back')).not.toHaveAttribute('capture')
})

test('shows a clear error for a non-image file', async ({ page }) => {
  await page.goto('/')
  await page.locator('#file-front').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') })
  await expect(page.locator('#status-front')).toHaveAttribute('role', 'alert')
  await expect(page.locator('#status-front')).toContainText('no es una imagen')
})

test('shows a decode error for a corrupt image', async ({ page }) => {
  await page.goto('/')
  await page.locator('#file-back').setInputFiles({ name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a jpeg') })
  await expect(page.locator('#status-back')).toContainText('No se ha podido abrir')
})

test('accepts a dropped image', async ({ page }) => {
  await page.goto('/')
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
  await page.goto('/')
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await page.locator('#lang').selectOption('eu')
  await expect(page.locator('html')).toHaveAttribute('lang', 'eu')
  await expect(page.locator('#status-front')).toHaveText('Irudia kargatu da.')
  await expect(page.locator('#lang')).toBeFocused()
})

test('Arabic switches the page to right-to-left', async ({ page }) => {
  await page.goto('/')
  await page.locator('#lang').selectOption('ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.locator('#lang').selectOption('fr')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
})
