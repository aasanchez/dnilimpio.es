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
const at = (f: [number, number]): [number, number] => [Math.round(f[0] * 1712), Math.round(f[1] * 1080)]

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

  // The list shows the fields of the side on screen; the MRZ is on the back.
  await expect(page.locator('#field-mrz')).toBeHidden()
  await page.locator('#tab-back').click()
  await page.locator('#field-mrz').uncheck()
  await expect(page.locator('#mrz-warning')).toBeVisible()

  await page.locator('#hide-all').click()
  await expect(page.locator('#hidden-count')).toHaveText('10 de 10')
  await expect(page.locator('#can-warning')).toHaveCount(0)
  await expect(page.locator('#mrz-warning')).toHaveCount(0)
  await page.locator('#restore-all').click()
  await expect(page.locator('#hidden-count')).toHaveText('0 de 10')
})

test('tapping a field on the card covers and uncovers it', async ({ page }) => {
  await toEditor(page)
  const can = at(CAN)
  expect(await pixel(page, '#preview', ...can)).toEqual([0, 0, 0])
  const box = await page.locator('#preview').boundingBox()
  if (!box) throw new Error('no preview box')
  await page.mouse.click(box.x + CAN[0] * box.width, box.y + CAN[1] * box.height)
  await expect(page.locator('#field-can')).not.toBeChecked()
  await expect.poll(async () => (await pixel(page, '#preview', ...can))[0]).toBeGreaterThan(0)
  await page.mouse.click(box.x + CAN[0] * box.width, box.y + CAN[1] * box.height)
  await expect(page.locator('#field-can')).toBeChecked()
})

test('review, then download a PDF with only sanitised images', async ({ page }) => {
  await toEditor(page)
  await page.locator('#tool-mark').click()
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
  // Both sides on one page.
  expect(text).toMatch(/\/Count 1\b/)
  expect(text.match(/\/Type \/Page\b(?!s)/g)).toHaveLength(1)
  expect(text.match(/\/Subtype \/Image/g)).toHaveLength(2)
  for (const forbidden of ['/Info', '/Producer', '/CreationDate', '/Metadata', 'synthetic', 'Exif', 'JFIF', 'COPIA']) {
    expect(text).not.toContain(forbidden)
  }
  await expect(page.locator('#download-status')).toHaveText('PDF creado. Búscalo en tu carpeta de descargas.')
  // No done screen: the review stays, with the small link to the optional stats below the buttons.
  await expect(page.locator('#review-title')).toBeVisible()
  await expect(page.locator('#stats-link')).toHaveText('Enviar datos anónimos')
  await expect(page.locator('#stats-link-hint')).toHaveText('Abre una página sin tu documento. Las fotos se borran de la app.')

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

/** Number of pure black pixels in the preview canvas (masks plus any solid black watermark text). */
test('a change made while the front is shown reaches the back in the review and the PDF', async ({ page }) => {
  // The editor renders only the side on screen; every side is brought up to date before the review.
  await toEditor(page)
  const mrz = at([0.5, 0.8])
  await page.locator('#restore-all').click()
  // The back is rendered once with the MRZ uncovered, then left.
  await page.locator('#tab-back').click()
  await expect.poll(async () => (await pixel(page, '#preview', ...mrz))[0]).toBeGreaterThan(0)
  await page.locator('#tab-front').click()
  // Hide every field and turn on greyscale with the front on screen, then go straight to the review.
  await page.locator('#hide-all').click()
  await page.locator('#tool-mark').click()
  await page.locator('#greyscale').check()
  await page.locator('#review').click()
  expect(await pixel(page, '#review-back', ...mrz)).toEqual([0, 0, 0])
  const [r = 0, g = 0, b = 0] = await pixel(page, '#review-back', ...at(PHOTO))
  expect(Math.max(r, g, b) - Math.min(r, g, b)).toBe(0)

  await page.locator('#review-confirm').check()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  const back = jpegs(readFileSync(await download.path()))[1]
  if (!back) throw new Error('expected the back image')
  const bk = await samples(page, back, [[0.5, 0.8]])
  for (const c of bk.px[0] ?? []) expect(c).toBeLessThan(16)
})

async function blackPixels (page: Page): Promise<number> {
  return await page.locator('#preview').evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no 2d')
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) n++
    return n
  })
}

test('watermark size and opacity sliders update the preview live', async ({ page }) => {
  await toEditor(page)
  await page.locator('#tool-mark').click()
  const size = page.locator('#watermark-size')
  const opacity = page.locator('#watermark-opacity')
  // Nothing to adjust until there is text; defaults are the original look.
  await expect(size).toBeDisabled()
  await expect(opacity).toBeDisabled()
  await expect(page.locator('#watermark-size-value')).toHaveText(/100\s?%/)
  await expect(page.locator('#watermark-opacity-value')).toHaveText(/16\s?%/)

  await page.locator('#watermark').fill('COPIA SOLO PARA ALQUILER')
  await expect(size).toBeEnabled()
  const faint = await blackPixels(page)
  // 100% opacity: the text is solid black, so the preview gains many pure black pixels.
  await opacity.fill('1')
  await expect(page.locator('#watermark-opacity-value')).toHaveText(/100\s?%/)
  await expect.poll(async () => await blackPixels(page)).toBeGreaterThan(faint + 5000)
  const solid = await blackPixels(page)
  // Bigger text: thicker strokes cover more of the card.
  await size.fill('2')
  await expect(page.locator('#watermark-size-value')).toHaveText(/200\s?%/)
  await expect.poll(async () => await blackPixels(page)).toBeGreaterThan(solid)
})

/** Pixels of the preview inside a rectangle (fractions of width/height) that are not opaque black. */
async function nonBlackIn (page: Page, x0: number, y0: number, x1: number, y1: number): Promise<number> {
  return await page.locator('#preview').evaluate((c: HTMLCanvasElement, r) => {
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no 2d')
    const x = Math.ceil(r[0] * c.width)
    const y = Math.ceil(r[1] * c.height)
    const d = ctx.getImageData(x, y, Math.floor(r[2] * c.width) - x, Math.floor(r[3] * c.height) - y).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] !== 0 || d[i + 1] !== 0 || d[i + 2] !== 0 || d[i + 3] !== 255) n++
    return n
  }, [x0, y0, x1, y1] as const)
}

test('the watermark is not drawn over hidden fields: they stay pure opaque black', async ({ page }) => {
  await toEditor(page)
  await page.locator('#tool-mark').click()
  // Large, long text, so copies of it cross the CAN box. Its light halo would turn the box grey.
  await page.locator('#watermark').fill('COPIA SOLO PARA ALQUILER DE VIVIENDA EN MADRID')
  await page.locator('#watermark-size').fill('3')
  await expect(page.locator('#watermark-size-value')).toHaveText(/300\s?%/)
  // CAN zone on the front (src/zones/dni.ts): 0.78–0.985 × 0.82–0.93.
  for (const opacity of ['0.16', '0.5', '1']) {
    await page.locator('#watermark-opacity').fill(opacity)
    await expect.poll(async () => await nonBlackIn(page, 0.78, 0.82, 0.985, 0.93)).toBe(0)
  }
})

test('reset clears photos and choices', async ({ page }) => {
  await toEditor(page)
  await page.locator('#tool-mark').click()
  await page.locator('#watermark').fill('X')
  await page.locator('#reset').click()
  await expect(page.locator('h2')).toHaveText('Foto del anverso')
  await expect(page.locator('#status-front')).toHaveText('')
  await expect(page.locator('#capture-continue')).toHaveCount(0)
})

test('adjusting moves a field box by hand, shows the photo uncovered meanwhile, and resets', async ({ page }) => {
  await toEditor(page)
  const can = at(CAN)
  const left: [number, number] = [CAN[0] - 0.3, CAN[1]]
  expect(await pixel(page, '#preview', ...can)).toEqual([0, 0, 0])
  await expect(page.locator('#reset-zones')).toBeDisabled()

  await page.locator('#adjust-zones').click()
  await expect(page.locator('#adjust-zones')).toHaveAttribute('aria-pressed', 'true')
  // The hidden CAN is drawn see-through so its box can be placed over the printed digits.
  await expect.poll(async () => (await pixel(page, '#preview', ...can))[0]).toBeGreaterThan(0)
  await dragOnPreview(page, CAN, left)
  await expect(page.locator('#zone-position')).toContainText('CAN')
  await expect(page.locator('#reset-zones')).toBeEnabled()

  // Keyboard: the arrow keys move the selected box.
  await page.locator('#preview').press('ArrowUp')

  // The copy hides the new position and no longer the old one.
  await page.locator('#adjust-zones').click()
  await expect.poll(async () => await pixel(page, '#preview', ...at(left))).toEqual([0, 0, 0])
  expect((await pixel(page, '#preview', ...can))[0]).toBeGreaterThan(0)

  await page.locator('#reset-zones').click()
  await expect.poll(async () => await pixel(page, '#preview', ...can)).toEqual([0, 0, 0])
  await expect(page.locator('#reset-zones')).toBeDisabled()
})

/** Drags with the mouse between two points given as fractions of the preview canvas. */
async function dragOnPreview (page: Page, from: [number, number], to: [number, number]): Promise<void> {
  // Centre the card so neither the sticky top bar nor the action bar covers it.
  await page.locator('#preview').evaluate((c) => { c.scrollIntoView({ block: 'center' }) })
  const box = await page.locator('#preview').boundingBox()
  if (!box) throw new Error('no preview box')
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height)
  await page.mouse.down()
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 5 })
  await page.mouse.up()
}

test('manual black boxes: draw, move, undo, redo, delete, keyboard, and they reach the PDF', async ({ page }) => {
  await toEditor(page)
  const photo = at(PHOTO)
  expect((await pixel(page, '#preview', ...photo))[2]).toBeGreaterThan(100) // dark blue photo block

  // Draw a box over the photo block.
  await page.locator('#tool-boxes').click()
  await page.locator('#draw-box').click()
  await expect(page.locator('#draw-box')).toHaveAttribute('aria-pressed', 'true')
  await dragOnPreview(page, [0.08, 0.3], [0.3, 0.7])
  await expect.poll(async () => await pixel(page, '#preview', ...photo)).toEqual([0, 0, 0])

  await page.locator('#undo').click()
  await expect.poll(async () => (await pixel(page, '#preview', ...photo))[2]).toBeGreaterThan(100)
  await page.locator('#redo').click()
  await expect.poll(async () => await pixel(page, '#preview', ...photo)).toEqual([0, 0, 0])

  // Move it away by dragging its middle; the photo shows again.
  await page.locator('#draw-box').click()
  await dragOnPreview(page, [0.2, 0.5], [0.6, 0.5])
  await expect.poll(async () => (await pixel(page, '#preview', ...photo))[2]).toBeGreaterThan(100)

  // Keyboard: the drag focused the canvas, so Delete removes the selected box and Ctrl+Z brings it back.
  await expect(page.locator('#preview')).toBeFocused()
  await page.keyboard.press('Delete')
  await expect(page.locator('#delete-box')).toBeDisabled()
  await page.keyboard.press('Control+z')
  // Keyboard: Add box puts a box in the centre; arrows move it onto the photo block.
  await page.locator('#add-box').click()
  await expect(page.locator('#preview')).toBeFocused()
  await expect.poll(async () => await pixel(page, '#preview', 856, 540)).toEqual([0, 0, 0])
  // Arrow keys move it by 0.5 % of the width; 50 presses take its left edge from 40 % to 15 %.
  for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowLeft')
  await expect.poll(async () => await pixel(page, '#preview', ...photo)).toEqual([0, 0, 0])
  // Shift+arrow keys resize it from the bottom-right corner.
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowDown')
  await expect.poll(async () => await pixel(page, '#preview', Math.round(0.25 * 1712), Math.round(0.65 * 1080))).toEqual([0, 0, 0])

  // Boxes are side-specific and survive in the PDF.
  await page.locator('#tab-back').click()
  expect((await pixel(page, '#preview', 856, 300))[0]).toBeGreaterThan(0)
  await page.locator('#review').click()
  await expect(page.locator('#review-summary')).toContainText('Recuadros negros extra: 2')
  await page.locator('#review-confirm').check()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  const [front] = jpegs(readFileSync(await download.path()))
  if (!front) throw new Error('no front image')
  const f = await samples(page, front, [PHOTO])
  for (const c of f.px[0] ?? []) expect(c).toBeLessThan(16)
})
