// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { devices, expect, test, type JSHandle, type Page } from '@playwright/test'
import { fixture, openCapture } from './helpers.ts'

test.use({ locale: 'es-ES' })

test('the start screen leads to the photo step, front first, then to the document picker', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
  await page.locator('#start').click()
  await expect(page.locator('h2')).toHaveText('Foto del anverso')
  await expect(page.locator('h2')).toBeFocused()
  await expect(page.locator('.progress [aria-current="step"]')).toContainText('Fotos')
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await page.locator('#capture-continue').click()
  await expect(page.locator('h2')).toHaveText('¿Qué documento vas a copiar?')
  await expect(page.locator('h2')).toBeFocused()
  await expect(page.locator('.progress [aria-current="step"]')).toContainText('Fotos')
  // Two choices (DNI, TIE) and no silent default: Continue waits for a choice.
  await expect(page.locator('input[name="doc"]')).toHaveCount(2)
  await expect(page.locator('input[name="doc"]:checked')).toHaveCount(0)
  await expect(page.locator('#doc-continue')).toBeDisabled()
  await expect(page.locator('#doc-choose')).toHaveText('Elige el documento para continuar.')
  // No service worker here, so no OCR: detection says so and the manual choice works as before.
  await expect(page.locator('#detect-status')).toHaveText('La detección automática no está disponible en este navegador. Elige el documento.')
  await page.locator('#doc-dni').check()
  await expect(page.locator('#doc-choose')).toHaveCount(0)
  await page.locator('#doc-continue').click()
  // Both photos are straightened by themselves: straight to the editor.
  await expect(page.locator('h2')).toHaveText('Elige qué tapar')
})

test('loads front and back through the file inputs, moving to the back by itself', async ({ page }) => {
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('h2')).toHaveText('Foto del reverso')
  // The side being captured is spelled out in a badge with a counter, and its tile is highlighted.
  await expect(page.locator('#side-badge')).toHaveAttribute('data-side', 'back')
  await expect(page.locator('#side-badge')).toContainText('2/2')
  await expect(page.locator('.dropzone.is-current #pick-back')).toHaveCount(1)
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
  // The live camera coach is for phones and tablets only.
  await expect(page.locator('#live-front')).toHaveCount(0)
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

/** A DataTransfer holding one fixture, as the browser builds it for a file dragged from the system. */
async function dragged (page: Page, name: string, type = 'image/png'): Promise<JSHandle<DataTransfer>> {
  const bytes = readFileSync(fixture(name)).toString('base64')
  return await page.evaluateHandle(([b64, n, t]) => {
    const d = new DataTransfer()
    d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], n, { type: t }))
    return d
  }, [bytes, name, type] as const)
}

test('desktop: the viewer is an upload area with a choose-file button and says nothing is uploaded', async ({ page }) => {
  await openCapture(page)
  await expect(page.locator('#viewer')).toContainText('Arrastra aquí la imagen')
  await expect(page.locator('#local-note')).toHaveText('La imagen se lee en este dispositivo. No se sube nada.')
  // The button opens the same file chooser as the action bar, for the side on screen.
  const chooser = page.waitForEvent('filechooser')
  await page.locator('#drop-choose').click()
  await (await chooser).setFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#side-badge')).toHaveAttribute('data-side', 'back')
})

test('desktop: front and back dropped on the viewer are read locally, never sent', async ({ page }) => {
  await openCapture(page)
  // Only the app's own files may load (the corner model starts after a photo); nothing is posted.
  const sent: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET' || r.postData() !== null || new URL(r.url()).origin !== 'http://localhost:4173') sent.push(`${r.method()} ${r.url()}`)
  })
  const front = await dragged(page, 'synthetic-front.png')
  await page.locator('#viewer').dispatchEvent('dragover', { dataTransfer: front })
  // While files are over the page, the viewer shows where they go.
  await expect(page.locator('#viewer')).toHaveClass(/is-dragover/)
  await page.locator('#viewer').dispatchEvent('drop', { dataTransfer: front })
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#viewer')).not.toHaveClass(/is-dragover/)
  // A drop anywhere else on the page goes to the side on screen, now the back.
  const back = await dragged(page, 'synthetic-back.png')
  await page.locator('h2').dispatchEvent('drop', { dataTransfer: back })
  await expect(page.locator('#status-back')).toHaveText('Imagen cargada.')
  await expect(page.locator('#capture-continue')).toBeEnabled()
  expect(sent).toEqual([])
})

test('desktop: a dropped file that is not an image gets a clear error', async ({ page }) => {
  await openCapture(page)
  const pdf = await dragged(page, 'synthetic-front.png', 'application/pdf')
  await page.locator('#viewer').dispatchEvent('drop', { dataTransfer: pdf })
  await expect(page.locator('#error-front')).toContainText('no es una imagen')
})

test('a file dropped outside the photo step never replaces the app in the tab', async ({ page }) => {
  await page.goto('/')
  const front = await dragged(page, 'synthetic-front.png')
  // dispatchEvent returns false when a listener cancelled the browser's default (opening the file).
  const opened = await page.evaluate((dt) => {
    const fire = (type: string): boolean => document.body.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }))
    return { dragover: fire('dragover'), drop: fire('drop') }
  }, front)
  expect(opened).toEqual({ dragover: false, drop: false })
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

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the side badge does not animate', async ({ page }) => {
    await openCapture(page)
    const name = await page.locator('#side-badge').evaluate((n) => getComputedStyle(n).animationName)
    expect(name).toBe('none')
  })
})
