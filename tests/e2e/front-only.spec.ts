// SPDX-License-Identifier: AGPL-3.0-or-later
// The back photo is optional: many requests need only the front. With the front alone the person
// still covers fields, adds the watermark and downloads a one-page PDF; detection, field boxes,
// sharing and the done screen work the same. The back can also be removed after it was added.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { blockModel, DOC_PX, fixture, openCapture, pixel } from './helpers.ts'

test.use({ locale: 'es-ES' })

/** Loads only the front and skips the back, through to the editor (DNI). */
async function frontOnlyToEditor (page: Page): Promise<void> {
  await blockModel(page)
  await openCapture(page)
  await expect(page.locator('#capture-skip-back')).toHaveCount(0)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await page.locator('#capture-skip-back').click()
  await expect(page.locator('h2')).toHaveText('¿Qué documento vas a copiar?')
  await page.locator('#doc-dni').check()
  await page.locator('#doc-continue').click()
  await expect(page.locator('h2')).toHaveText('Elige qué tapar')
  await expect(page.locator('#preview')).toHaveJSProperty('width', DOC_PX['dni-4.0'].w)
}

test('the photo step says the back is optional and offers to go on without it', async ({ page }) => {
  await openCapture(page)
  // Front first: nothing to skip yet, and the front is never optional.
  await expect(page.locator('#back-optional')).toHaveCount(0)
  await expect(page.locator('#pick-back .status')).toHaveText('opcional')
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('h2')).toHaveText('Foto del reverso')
  await expect(page.locator('#back-optional')).toHaveText('El reverso es opcional. Añádelo solo si te lo piden.')
  await expect(page.locator('#capture-continue')).toHaveCount(0)
  await expect(page.locator('#capture-skip-back')).toHaveText(/Seguir sin el reverso/)
  // Adding the back replaces the skip button with the usual Continue.
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await expect(page.locator('#capture-skip-back')).toHaveCount(0)
  await expect(page.locator('#capture-continue')).toBeEnabled()
})

test('a back added by mistake can be removed, and the flow goes on with the front', async ({ page }) => {
  await blockModel(page)
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await page.locator('#capture-remove-back').click()
  await expect(page.locator('#capture-remove-back')).toHaveCount(0)
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#capture-continue')).toHaveCount(0)
  await page.locator('#capture-skip-back').click()
  await page.locator('#doc-dni').check()
  await page.locator('#doc-continue').click()
  await expect(page.locator('#front-only')).toBeVisible()
})

test('desktop: a front dropped on the viewer is enough to go on', async ({ page }) => {
  await blockModel(page)
  await openCapture(page)
  const bytes = readFileSync(fixture('synthetic-front.png')).toString('base64')
  const dt = await page.evaluateHandle((b64) => {
    const d = new DataTransfer()
    d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'card.png', { type: 'image/png' }))
    return d
  }, bytes)
  await page.locator('#viewer').dispatchEvent('dragover', { dataTransfer: dt })
  await page.locator('#viewer').dispatchEvent('drop', { dataTransfer: dt })
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await page.locator('#capture-skip-back').click()
  await expect(page.locator('h2')).toHaveText('¿Qué documento vas a copiar?')
})

test('front only: the editor has one side and only front fields, and the PDF has one page', async ({ page }) => {
  await frontOnlyToEditor(page)
  // No side tabs and no back-only fields (MRZ, address): there is no back to cover.
  await expect(page.locator('#tab-front')).toHaveCount(0)
  await expect(page.locator('#tab-back')).toHaveCount(0)
  await expect(page.locator('#front-only')).toHaveText('Solo el anverso: no hay foto del reverso.')
  await expect(page.locator('#field-can')).toBeChecked()
  await expect(page.locator('#field-mrz')).toHaveCount(0)
  await expect(page.locator('#field-address')).toHaveCount(0)
  await expect(page.locator('#hidden-count')).toHaveText('5 de 6')
  // Hiding data the MRZ repeats warns only when an MRZ is in the copy.
  await page.locator('#field-dateOfBirth').check()
  await expect(page.locator('#mrz-warning')).toHaveCount(0)
  // The other tools work on the one side.
  await page.locator('#tool-mark').click()
  await page.locator('#watermark').fill('COPIA SOLO PARA ALQUILER')
  await page.locator('#review').click()
  await expect(page.locator('#review-front')).toBeVisible()
  await expect(page.locator('#review-back')).toHaveCount(0)
  // The CAN (bottom right of the front) is still opaque black in the copy that goes into the PDF.
  expect(await pixel(page, '#review-front', Math.round(0.8825 * 1712), Math.round(0.875 * 1080))).toEqual([0, 0, 0])
  await expect(page.locator('#summary-front-only')).toContainText('Solo el anverso')
  await expect(page.locator('#review-summary')).toContainText('Campos ocultos: 6')
  await expect(page.locator('#review-summary')).toContainText('Marca de agua: COPIA SOLO PARA ALQUILER')
  await expect(page.locator('#review-warning')).toContainText('Revisa el anverso del documento')
  await expect(page.locator('label:has(#review-confirm)')).toHaveText('He revisado el anverso')
  await page.locator('#review-confirm').check()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  expect(download.suggestedFilename()).toBe('protected-document.pdf')
  const text = readFileSync(await download.path()).toString('latin1')
  expect(text.startsWith('%PDF-')).toBe(true)
  expect(text).toMatch(/\/Count 1\b/)
  expect(text.match(/\/Type \/Page\b(?!s)/g)).toHaveLength(1)
  // Done screen, as with both sides.
  await expect(page.locator('h2')).toHaveText('Tu PDF está listo')
  await expect(page.locator('#done-summary')).toContainText('Páginas: 1')
  await expect(page.locator('#download-status')).toHaveText('PDF creado. Búscalo en tu carpeta de descargas.')
  await page.locator('#reset-done').click()
  await expect(page.locator('h2')).toHaveText('Foto del anverso')
  await expect(page.locator('#status-front')).toHaveText('')
})

test('front only: going back from the editor and adding the back brings both sides, back fields still hidden', async ({ page }) => {
  await frontOnlyToEditor(page)
  // Presets act on the front only: the back's recommended choices (MRZ) are kept for later.
  await page.locator('#restore-all').click()
  await expect(page.locator('#hidden-count')).toHaveText('0 de 6')
  await page.locator('#back').click()
  await page.locator('#back').click()
  // Back on the photo step, it opens on the empty back, ready to add it.
  await expect(page.locator('h2')).toHaveText('Foto del reverso')
  await expect(page.locator('#capture-skip-back')).toBeVisible()
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await page.locator('#capture-continue').click()
  await page.locator('#doc-dni').check()
  await page.locator('#doc-continue').click()
  await expect(page.locator('#tab-back')).toBeVisible()
  await expect(page.locator('#front-only')).toHaveCount(0)
  await page.locator('#tab-back').click()
  await expect(page.locator('#field-mrz')).toBeChecked()
  await expect(page.locator('#field-can')).toHaveCount(0)
})
