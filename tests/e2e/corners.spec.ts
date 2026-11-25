// SPDX-License-Identifier: AGPL-3.0-or-later
// The corner model ("better edges"): suggests the corners when it can, stays silent when it cannot.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fixture, loadBoth, pixel } from './helpers.ts'

test.use({ locale: 'es-ES' })

test('the model places the corners on the card; Continue straightens it without dragging', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await loadBoth(page, { model: true })
  await page.locator('#capture-continue').click()
  await expect(page.locator('#align-auto')).toHaveText(/Hemos colocado las esquinas/, { timeout: 30_000 })
  await page.locator('#align-continue').click()
  await expect(page.locator('#align-auto')).toHaveText(/Hemos colocado las esquinas/, { timeout: 30_000 })
  await page.locator('#align-continue').click()
  await expect(page.locator('#preview')).toHaveJSProperty('width', 1712)
  // Corners on the card: just inside the straightened image's edges is card background (light),
  // not the dark table around it.
  for (const [x, y] of [[40, 40], [1671, 40], [1671, 1039], [40, 1039]] as const) {
    const [r = 0] = await pixel(page, '#preview', x, y)
    expect(r).toBeGreaterThan(180)
  }
  expect(errors).toEqual([])
})

test('without the model the corners stay where they start, with no message and no error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await loadBoth(page)
  await page.locator('#capture-continue').click()
  await expect(page.locator('canvas.corner-editor')).toBeVisible()
  await expect(page.locator('#align-auto')).toHaveText('')
  await expect(page.locator('#align-continue')).toBeEnabled()
  expect(errors).toEqual([])
})

test('a corner moved by the user is never overridden by a late detection', async ({ page }) => {
  // Hold the model back until the user has dragged a corner.
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/assets/ml/**', async (route) => { await held; await route.continue() })
  await loadBoth(page, { model: true })
  await page.locator('#capture-continue').click()
  const canvas = page.locator('canvas.corner-editor')
  await canvas.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#align-auto')).toHaveText('')
  const answered = page.waitForResponse('**/assets/ml/model-*')
  release()
  await answered
  // Give the model time to run; the message must not appear.
  await page.waitForTimeout(1500)
  await expect(page.locator('#align-auto')).toHaveText('')
})

interface Variant { seed: number; cx: number; cy: number; angle: number }
const VARIANTS: Variant[] = [
  { seed: 7, cx: 720, cy: 680, angle: 0.17 },
  { seed: 42, cx: 640, cy: 760, angle: -0.35 },
  { seed: 1234, cx: 650, cy: 560, angle: 0.05 },
]

/**
 * A cluttered photo: the front fixture's card, rotated and smaller, on a busy desk with a sheet of
 * paper, shapes and lines. Drawn in a blank page (no app, no CSP), returned as PNG bytes.
 */
async function messyPhoto (page: import('@playwright/test').Page, v: Variant): Promise<Buffer> {
  const png = readFileSync(fixture('synthetic-front.png')).toString('base64')
  const blank = await page.context().newPage()
  const out = await blank.evaluate(async ([b64, v]) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const src = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const c = new OffscreenCanvas(1600, 1200)
    const g = c.getContext('2d')
    if (!g) throw new Error('no 2d')
    let seed = v.seed
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    g.fillStyle = '#6b4a2f' // desk
    g.fillRect(0, 0, 1600, 1200)
    for (let i = 0; i < 60; i++) { // wood grain
      g.strokeStyle = `rgba(40,25,10,${String(0.2 + rnd() * 0.3)})`
      g.lineWidth = 1 + rnd() * 4
      g.beginPath(); g.moveTo(0, rnd() * 1200); g.lineTo(1600, rnd() * 1200); g.stroke()
    }
    g.save(); g.translate(1300, 260); g.rotate(-0.3) // sheet of paper with text lines
    g.fillStyle = '#e8e4da'; g.fillRect(-220, -300, 440, 600)
    g.fillStyle = '#555'
    for (let y = -260; y < 260; y += 28) g.fillRect(-190, y, 300 + rnd() * 80, 8)
    g.restore()
    for (let i = 0; i < 25; i++) { // clutter: coins, pens, sticky notes
      const hue = Math.floor(rnd() * 360)
      g.fillStyle = `hsl(${String(hue)} 50% ${String(20 + rnd() * 25)}%)`
      const x = rnd() * 1600; const y = rnd() * 1200
      if (rnd() < 0.5) { g.beginPath(); g.arc(x, y, 15 + rnd() * 50, 0, Math.PI * 2); g.fill() } else {
        g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI); g.fillRect(-90, -8, 180, 16); g.restore()
      }
    }
    g.save(); g.translate(v.cx, v.cy); g.rotate(v.angle) // the card: 900 px wide
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 20
    g.drawImage(src, 200, 222, 1200, 756, -450, -283.5, 900, 567)
    g.restore()
    const blob = await c.convertToBlob({ type: 'image/png' })
    const u8 = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000))
    return btoa(bin)
  }, [png, v] as const)
  await blank.close()
  return Buffer.from(out, 'base64')
}

/** The corners shown in the editor, in photo pixels. */
async function corners (page: import('@playwright/test').Page): Promise<{ x: number; y: number }[]> {
  const attr = await page.locator('[data-corners]').getAttribute('data-corners')
  return (attr ?? '').split(' ').map((p) => { const [x = 0, y = 0] = p.split(',').map(Number); return { x, y } })
}

for (const v of VARIANTS) {
  test(`finds the card on a messy background (seed ${String(v.seed)})`, async ({ page }) => {
    const photo = await messyPhoto(page, v)
    await page.goto('/')
    await page.locator('#start').click()
    await page.locator('#file-front').setInputFiles({ name: 'messy.png', mimeType: 'image/png', buffer: photo })
    await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
    await page.locator('#capture-continue').click()
    await expect(page.locator('#align-auto')).toHaveText(/Hemos colocado las esquinas/, { timeout: 30_000 })
    // Where messyPhoto() drew the card: 900 × 567, centred on (cx, cy), rotated by `angle`.
    const [c, s] = [Math.cos(v.angle), Math.sin(v.angle)]
    const truth = [[-450, -283.5], [450, -283.5], [450, 283.5], [-450, 283.5]].map(([dx = 0, dy = 0]) => ({ x: v.cx + dx * c - dy * s, y: v.cy + dx * s + dy * c }))
    const found = await corners(page)
    const errors = found.map((p, i) => Math.hypot(p.x - truth[i]!.x, p.y - truth[i]!.y))
    console.log(`seed ${String(v.seed)}: corner errors in px of a 1600 × 1200 photo:`, errors.map((e) => e.toFixed(1)).join(', '))
    // Close enough to only need a nudge: within 2 % of the photo's width (32 px) on each corner.
    for (const e of errors) expect(e).toBeLessThan(32)
  })
}
