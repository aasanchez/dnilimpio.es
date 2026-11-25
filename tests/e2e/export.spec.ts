// SPDX-License-Identifier: AGPL-3.0-or-later
// Editor, review and PDF export through the real UI (spec §12–§17), on the production build.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { pixel, toEditor } from './helpers.ts'

test.use({ locale: 'es-ES' })

/** JPEG streams embedded in a PDF, in page order. */
function jpegs (pdf: Buffer): Buffer[] {
  const s = pdf.toString('latin1')
  const out: Buffer[] = []
  for (const m of s.matchAll(/<<([^]*?)>>\s*stream\r?\n/g)) {
    const dict = m[1] ?? ''
    if (!dict.includes('/DCTDecode')) continue
    const len = Number(/\/Length (\d+)/.exec(dict)?.[1])
    const start = m.index + m[0].length
    out.push(pdf.subarray(start, start + len))
  }
  return out
}

/** Decodes a JPEG in the page and returns the RGB of the given pixels (fractions of width/height). */
async function samples (page: Page, jpeg: Buffer, points: Array<[number, number]>): Promise<{ w: number; h: number; px: number[][] }> {
  return await page.evaluate(async ([b64, pts]) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no 2d')
    ctx.drawImage(bmp, 0, 0)
    const px = pts.map(([fx, fy]) => [...ctx.getImageData(Math.round(fx * bmp.width), Math.round(fy * bmp.height), 1, 1).data.subarray(0, 3)])
    return { w: bmp.width, h: bmp.height, px }
  }, [jpeg.toString('base64'), points] as const)
}

// Centre of the CAN zone on the front (src/zones/dni.ts) and of the photo block in the fixture.
const CAN: [number, number] = [0.8825, 0.875]
const PHOTO: [number, number] = [0.18, 0.5]

test('checklist: recommended fields hidden, live preview, warnings, hide all and show all', async ({ page }) => {
  await toEditor(page)
  await expect(page.locator('#hidden-count')).toHaveText('6 de 10')
  await expect(page.locator('#field-can')).toBeChecked()
  // The CAN is black in the preview.
  expect(await pixel(page, '#preview', Math.round(CAN[0] * 1712), Math.round(CAN[1] * 1080))).toEqual([0, 0, 0])

  await page.locator('#field-can').uncheck()
  await expect(page.locator('#can-warning')).toBeVisible()
  await expect(page.locator('#hidden-count')).toHaveText('5 de 10')
  expect((await pixel(page, '#preview', Math.round(CAN[0] * 1712), Math.round(CAN[1] * 1080)))[0]).toBeGreaterThan(0)

  await page.locator('#field-mrz').uncheck()
  await expect(page.locator('#mrz-warning')).toBeVisible()

  await page.locator('#hide-all').click()
  await expect(page.locator('#hidden-count')).toHaveText('10 de 10')
  await expect(page.locator('#can-warning')).toHaveCount(0)
  await expect(page.locator('#mrz-warning')).toHaveCount(0)
  await page.locator('#restore-all').click()
  await expect(page.locator('#hidden-count')).toHaveText('0 de 10')
})

test('review, then download a PDF with only sanitised images', async ({ page }) => {
  await toEditor(page)
  await page.locator('#watermark').fill('COPIA SOLO PARA ALQUILER')
  await page.locator('#greyscale').check()
  await page.locator('#review').click()
  await expect(page.locator('#review-title')).toBeFocused()
  await expect(page.locator('#review-summary')).toContainText('Campos ocultos: 6')
  await expect(page.locator('#review-summary')).toContainText('Marca de agua: COPIA SOLO PARA ALQUILER')
  await expect(page.locator('#review-summary')).toContainText('Blanco y negro: sí')
  await expect(page.locator('#download')).toBeDisabled()
  await page.locator('#review-confirm').check()

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  expect(download.suggestedFilename()).toBe('protected-document.pdf')
  const pdf = readFileSync(await download.path())
  const text = pdf.toString('latin1')
  expect(text.startsWith('%PDF-')).toBe(true)
  expect(text).toMatch(/\/Count 2/)
  for (const forbidden of ['/Info', '/Producer', '/CreationDate', '/Metadata', 'synthetic', 'Exif', 'JFIF', 'COPIA']) {
    expect(text).not.toContain(forbidden)
  }
  await expect(page.locator('#download-status')).toHaveText('PDF creado. Búscalo en tu carpeta de descargas.')

  const [front, back] = jpegs(pdf)
  if (!front || !back) throw new Error('expected two images')
  const f = await samples(page, front, [CAN, PHOTO])
  expect([f.w, f.h]).toEqual([1712, 1080])
  // Masked pixels stay black after JPEG compression (small tolerance for compression noise).
  for (const c of f.px[0] ?? []) expect(c).toBeLessThan(16)
  // Greyscale: channels equal within JPEG noise.
  const [r = 0, g = 0, b = 0] = f.px[1] ?? []
  expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(8)
  // MRZ on the back is masked.
  const bk = await samples(page, back, [[0.5, 0.8]])
  for (const c of bk.px[0] ?? []) expect(c).toBeLessThan(16)
})

test('reset clears photos and choices', async ({ page }) => {
  await toEditor(page)
  await page.locator('#watermark').fill('X')
  await page.locator('#reset').click()
  await expect(page.locator('h2')).toHaveText('Paso 1 de 3: añade las fotos del DNI')
  await expect(page.locator('#status-front')).toHaveText('')
  await expect(page.locator('#capture-continue')).toBeDisabled()
})
