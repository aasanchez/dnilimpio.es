// SPDX-License-Identifier: AGPL-3.0-or-later
// Edge detection on the synthetic fixtures: the browser decodes the PNG (as the app does), the
// detector runs on the pixels, and the corners must land on the known card corners.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { detectCard } from '../../src/detect/edges.ts'
import { CARD, fixture } from './helpers.ts'

for (const name of ['synthetic-front.png', 'synthetic-back.png']) {
  test(`detects the card corners in ${name}`, async ({ page }) => {
    await page.goto('/')
    const b64 = readFileSync(fixture(name)).toString('base64')
    const img = await page.evaluate(async (s) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(s), (c) => c.charCodeAt(0))]))
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('no 2d')
      ctx.drawImage(bmp, 0, 0)
      return { width: bmp.width, height: bmp.height, data: Array.from(ctx.getImageData(0, 0, bmp.width, bmp.height).data) }
    }, b64)
    const d = detectCard({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) })
    expect(d).not.toBeNull()
    expect(d?.confidence).toBeGreaterThan(0.8)
    // Within 0.5 % of the image width (8 px on 1600).
    d?.quad.forEach((p, i) => {
      expect(Math.abs(p.x - CARD[i]!.x)).toBeLessThan(8)
      expect(Math.abs(p.y - CARD[i]!.y)).toBeLessThan(8)
    })
  })
}
