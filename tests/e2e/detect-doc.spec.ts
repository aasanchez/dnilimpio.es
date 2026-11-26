// SPDX-License-Identifier: AGPL-3.0-or-later
// Automatic document detection: the MRZ on the back preselects the document on the picker.
// The backs are drawn here (fictional data), never photos of real documents. The browser's
// monospace font stands in for OCR-B; at this size it reads reliably.
import { expect, test, type Page } from '@playwright/test'
import { checkDigit } from '../../src/ocr/mrz.ts'
import { fixture, openCapture } from './helpers.ts'

test.use({ locale: 'es-ES', serviceWorkers: 'allow' })

/** A valid TD1 MRZ (fictional). */
function mrz (code: string, birth: string, expiry: string): string[] {
  const number = 'BAA000589'
  const l1 = code + 'ESP' + number + String(checkDigit(number)) + '99999999R<<<<<<'
  const l2a = `${birth}${String(checkDigit(birth))}F${expiry}${String(checkDigit(expiry))}ESP<<<<<<<<<<<`
  const composite = l1.slice(5, 30) + l2a.slice(0, 7) + l2a.slice(8, 15) + l2a.slice(18, 29)
  return [l1, l2a + String(checkDigit(composite)), 'ESPANOLA<ESPANOLA<<CARMEN<<<<']
}

/** A 1600 × 1200 photo of a card back on a dark table, with the MRZ printed at the bottom. */
async function back (page: Page, lines: string[], sideways = false): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const url = await page.evaluate(([text, turn]) => {
    const c = document.createElement('canvas')
    c.width = 1600
    c.height = 1200
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no 2d')
    ctx.fillStyle = '#292a33'
    ctx.fillRect(0, 0, 1600, 1200)
    ctx.fillStyle = '#f4f4f0'
    ctx.fillRect(200, 222, 1200, 756)
    ctx.fillStyle = '#000'
    ctx.font = '48px monospace'
    text.forEach((l, i) => { ctx.fillText(l, 260, 770 + i * 64) })
    if (!turn) return c.toDataURL('image/png')
    // The same photo taken with the phone upright: the card is sideways.
    const r = document.createElement('canvas')
    r.width = 1200
    r.height = 1600
    const rctx = r.getContext('2d')
    if (!rctx) throw new Error('no 2d')
    rctx.translate(1200, 0)
    rctx.rotate(Math.PI / 2)
    rctx.drawImage(c, 0, 0)
    return r.toDataURL('image/png')
  }, [lines, sideways] as const)
  return { name: 'back.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1] ?? '', 'base64') }
}

async function controlled (page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
}

test('reads the back, preselects TIE, then DNI 4.0 for a new photo', async ({ page }) => {
  test.setTimeout(180_000)
  await controlled(page)
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#file-back').setInputFiles(await back(page, mrz('IR', '900101', '290101')))
  await page.locator('#capture-continue').click()

  // First time: the OCR files download by themselves (online), then the back is read.
  await expect(page.locator('input[name="doc"]:checked')).toHaveCount(0)
  await expect(page.locator('#doc-continue')).toBeDisabled()
  await expect(page.locator('#detect-status')).toHaveText('Documento detectado: TIE (tarjeta de extranjero). Compruébalo antes de continuar.', { timeout: 90_000 })
  await expect(page.locator('#doc-tie')).toBeChecked()

  // A new back photo: OCR is now cached, so detection runs by itself.
  await page.locator('#back').click()
  await page.locator('#file-back').setInputFiles(await back(page, mrz('ID', '800101', '330101')))
  await page.locator('#capture-continue').click()
  await expect(page.locator('#detect-status')).toHaveText('Documento detectado: DNI 4.0. Compruébalo antes de continuar.', { timeout: 60_000 })
  await expect(page.locator('[id="doc-dni-4.0"]')).toBeChecked()
})

test('a sideways photo is detected too', async ({ page }) => {
  test.setTimeout(180_000)
  await controlled(page)
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#file-back').setInputFiles(await back(page, mrz('IR', '900101', '290101'), true))
  await page.locator('#capture-continue').click()
  await expect(page.locator('#detect-status')).toHaveText('Documento detectado: TIE (tarjeta de extranjero). Compruébalo antes de continuar.', { timeout: 90_000 })
})

test('a choice made by hand is never overridden', async ({ page }) => {
  test.setTimeout(180_000)
  await controlled(page)
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#file-back').setInputFiles(await back(page, mrz('IR', '900101', '290101')))
  await page.locator('#capture-continue').click()
  // Picked while the back is still being read: the result informs, it does not override.
  await page.locator('[id="doc-dni-3.0"]').click()
  await expect(page.locator('#detect-status')).toContainText('TIE', { timeout: 90_000 })
  await expect(page.locator('[id="doc-dni-3.0"]')).toBeChecked()
})

test('offline without the OCR files: a note, and the manual choice', async ({ page, context }) => {
  await controlled(page)
  await context.setOffline(true)
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await page.locator('#capture-continue').click()
  await expect(page.locator('#detect-status')).toHaveText('Sin conexión no se puede descargar la detección automática. Elige el documento.')
  await expect(page.locator('#doc-continue')).toBeDisabled()
  await page.locator('#doc-tie').check()
  await page.locator('#doc-continue').click()
  await expect(page.locator('h2')).toHaveText('Elige qué tapar')
})

/** A 1600 × 1200 photo of a card front on a dark table, with the given lines of printed text. */
async function front (page: Page, lines: ReadonlyArray<readonly [string, number, number, number]>): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const url = await page.evaluate((text) => {
    const c = document.createElement('canvas')
    c.width = 1600
    c.height = 1200
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no 2d')
    ctx.fillStyle = '#292a33'
    ctx.fillRect(0, 0, 1600, 1200)
    ctx.fillStyle = '#f4f4f0'
    ctx.fillRect(200, 222, 1200, 756)
    ctx.fillStyle = '#555'
    ctx.fillRect(250, 400, 280, 380)
    ctx.fillStyle = '#000'
    for (const [t, x, y, size] of text) {
      ctx.font = `${String(size)}px sans-serif`
      ctx.fillText(t, x, y)
    }
    return c.toDataURL('image/png')
  }, lines)
  return { name: 'front.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1] ?? '', 'base64') }
}

test('without an MRZ, the printed text of the front tells a TIE', async ({ page }) => {
  test.setTimeout(180_000)
  await controlled(page)
  await openCapture(page)
  await page.locator('#file-front').setInputFiles(await front(page, [
    ['PERMISO DE RESIDENCIA', 560, 300, 40],
    ['TIPO DE PERMISO / TYPE OF PERMIT', 560, 560, 24],
    ['RESIDENCE PERMIT / TITRE DE SEJOUR', 560, 930, 28],
  ]))
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await page.locator('#capture-continue').click()
  await expect(page.locator('#detect-status')).toHaveText('Documento detectado: TIE (tarjeta de extranjero). Compruébalo antes de continuar.', { timeout: 120_000 })
  await expect(page.locator('#doc-tie')).toBeChecked()
})

test('when the MRZ dates allow both DNI versions, the front tells the version', async ({ page }) => {
  test.setTimeout(180_000)
  await controlled(page)
  await openCapture(page)
  // Issued between December 2020 and December 2021: either version.
  await page.locator('#file-front').setInputFiles(await front(page, [
    ['REINO DE ESPAÑA', 600, 290, 48],
    ['DOCUMENTO NACIONAL DE IDENTIDAD', 600, 330, 24],
    ['NATIONAL IDENTITY CARD / DOCUMENTO NACIONAL IDENTIDAD', 560, 950, 22],
  ]))
  await page.locator('#file-back').setInputFiles(await back(page, mrz('ID', '800101', '311201')))
  await page.locator('#capture-continue').click()
  await expect(page.locator('#detect-status')).toHaveText('Documento detectado: DNI 4.0. Compruébalo antes de continuar.', { timeout: 120_000 })
  await expect(page.locator('[id="doc-dni-4.0"]')).toBeChecked()
})
