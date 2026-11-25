// SPDX-License-Identifier: AGPL-3.0-or-later
// Capture coach (live camera). Chromium's fake camera plays a Y4M file we write here: a light
// card with "text" lines on a dark background, placed exactly in the coach's guide frame.
import { devices, expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { guideRect } from '../../src/capture/coach.ts'
import { openCapture } from './helpers.ts'

const VW = 640
const VH = 360

/** One still frame as a Y4M file (4:2:0); Chromium loops it. */
function cardVideo (): string {
  const g = guideRect(VW, VH)
  const y = new Uint8Array(VW * VH)
  for (let r = 0; r < VH; r++) {
    for (let c = 0; c < VW; c++) {
      const u = c - g.x
      const w = r - g.y
      let v = 50 + ((r * 7 + c * 13) % 9) // dark, slightly textured background
      if (u >= 0 && u < g.w && w >= 0 && w < g.h) {
        v = 205
        if (u > g.w * 0.35 && u < g.w * 0.9 && w > g.h * 0.2 && w < g.h * 0.85 && Math.floor(w) % 9 < 2 && Math.floor(u / 7) % 3 !== 0) v = 40
      }
      y[r * VW + c] = v
    }
  }
  const chroma = new Uint8Array((VW / 2) * (VH / 2)).fill(128)
  const header = Buffer.from(`YUV4MPEG2 W${String(VW)} H${String(VH)} F30:1 Ip A1:1 C420jpeg\nFRAME\n`)
  const file = join(mkdtempSync(join(tmpdir(), 'dni-coach-')), 'card.y4m')
  writeFileSync(file, Buffer.concat([header, y, chroma, chroma]))
  return file
}

const { defaultBrowserType: _, ...pixel } = devices['Pixel 7']

// Launch options apply to the whole file (they need their own browser). The refusal tests below
// replace getUserMedia themselves, so the fake camera does not matter to them.
test.use({
  ...pixel,
  locale: 'es-ES',
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cardVideo()}`] },
})

test.describe('with a working camera', () => {
  test('shoots the front by itself, then waits for the back', async ({ page }) => {
    await openCapture(page)
    // The live camera takes the place of the system camera button.
    await expect(page.locator('#live-front')).toBeVisible()
    await expect(page.locator('#camera-front')).toHaveAttribute('capture', 'environment')
    await expect(page.getByText('Hacer foto').filter({ visible: true })).toHaveCount(1)
    await page.locator('#live-front').click()
    const dialog = page.locator('dialog.live')
    await expect(dialog).toBeVisible()
    // Automatic shot: the front loads without touching the shutter, and the view moves to the back.
    await expect(page.locator('#status-front')).toHaveText('Imagen cargada.', { timeout: 10_000 })
    await expect(page.locator('#live-title')).toHaveText('Foto del reverso')
    await expect(page.locator('#live-tip')).toHaveText('Hecho. Ahora da la vuelta a la tarjeta.')
    // The same card is still in view: no second automatic shot for the back.
    await page.waitForTimeout(1500)
    await expect(page.locator('#status-back')).toHaveText('')
    // Manual shutter for the back; with both sides done the camera closes.
    await page.locator('#live-shutter').click()
    await expect(page.locator('#status-back')).toHaveText('Imagen cargada.')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('#capture-continue')).toBeEnabled()
    // The camera is off once the view is closed.
    const live = await page.evaluate(() => document.querySelectorAll('video').length)
    expect(live).toBe(0)
  })

  test('automatic shot can be turned off, and the camera closes with the close button', async ({ page }) => {
    await openCapture(page)
    await page.locator('#live-front').click()
    await page.locator('#live-auto').click()
    await expect(page.locator('#live-auto')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#live-tip')).toHaveText('Todo bien: haz la foto', { timeout: 10_000 })
    await expect(page.locator('#status-front')).toHaveText('')
    await page.locator('#live-close').click()
    await expect(page.locator('dialog.live')).toHaveCount(0)
    await expect(page.locator('#live-front')).toBeVisible()
  })
})

test.describe('when the camera is refused', () => {
  test('falls back to the system camera with a short note, no error', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'))
    })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await openCapture(page)
    await page.locator('#live-front').click()
    await expect(page.locator('dialog.live')).toHaveCount(0)
    await expect(page.locator('#live-note')).toContainText('No hay permiso para usar la cámara')
    await expect(page.locator('#live-front')).toHaveCount(0)
    await expect(page.getByText('Hacer foto', { exact: true }).filter({ visible: true })).toHaveCount(1)
    await page.locator('#camera-front').setInputFiles(new URL('../fixtures/synthetic-front.png', import.meta.url).pathname)
    await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
    expect(errors).toEqual([])
  })
})

test.describe('without a live camera API', () => {
  test('shows only the system camera and gallery buttons', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { value: undefined }) })
    await openCapture(page)
    await expect(page.locator('#live-front')).toHaveCount(0)
    await expect(page.getByText('Hacer foto').filter({ visible: true })).toHaveCount(1)
    await expect(page.getByText('Galería').filter({ visible: true })).toHaveCount(1)
  })
})
