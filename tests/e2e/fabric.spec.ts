// SPDX-License-Identifier: AGPL-3.0-or-later
// A light card on dark woven fabric, as in a real TIE photo where the corners came out too far above
// and below the card. Both detectors, then the edge snapping (refine.ts), must land on the card.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { blockModel, chooseDoc, fixture, openCapture } from './helpers.ts'
test.use({ locale: 'es-ES' })

/** A phone photo (W × H) of the fixture's card, `cardW` px wide, turned by `angle`, on woven fabric. */
interface V { seed: number; cardW: number; angle: number; W: number; H: number }
async function fabric (page: Page, name: string, v: V): Promise<Buffer> {
  const png = readFileSync(fixture(name)).toString('base64')
  const blank = await page.context().newPage()
  const out = await blank.evaluate(async ([b64, v]) => {
    const src = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]))
    const c = new OffscreenCanvas(v.W, v.H)
    const g = c.getContext('2d')
    if (!g) throw new Error('no 2d')
    let seed = v.seed
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    g.fillStyle = '#26232a'; g.fillRect(0, 0, v.W, v.H)
    for (let y = 0; y < v.H; y += 3) { g.fillStyle = `rgba(90,80,100,${String(0.15 + rnd() * 0.25)})`; g.fillRect(0, y, v.W, 1) }
    for (let x = 0; x < v.W; x += 3) { g.fillStyle = `rgba(10,10,15,${String(0.15 + rnd() * 0.25)})`; g.fillRect(x, 0, 1, v.H) }
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '120,110,130'},0.35)`; g.fillRect(rnd() * v.W, rnd() * v.H, 2 + rnd() * 6, 1 + rnd() * 3) }
    const ch = v.cardW * 53.98 / 85.6
    g.save(); g.translate(v.W / 2, v.H / 2); g.rotate(v.angle)
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 25
    g.drawImage(src, 200, 222, 1200, 756, -v.cardW / 2, -ch / 2, v.cardW, ch)
    g.restore()
    const u8 = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let bin = ''
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000))
    return btoa(bin)
  }, [png, v] as const)
  await blank.close()
  return Buffer.from(out, 'base64')
}

const PHOTOS: V[] = [
  { seed: 3, cardW: 1100, angle: 0.02, W: 1200, H: 1600 }, // portrait, card across almost the whole width
  { seed: 9, cardW: 1050, angle: -0.04, W: 1200, H: 1600 },
  { seed: 5, cardW: 1400, angle: 0, W: 1600, H: 1200 },
]

for (const model of [true, false]) {
  for (const v of PHOTOS) {
    test(`${model ? 'model' : 'edge detection'}: corners on the card on dark fabric (seed ${String(v.seed)})`, async ({ page }) => {
      if (!model) await blockModel(page)
      await openCapture(page)
      await page.locator('#file-front').setInputFiles({ name: 'f.png', mimeType: 'image/png', buffer: await fabric(page, 'synthetic-front.png', v) })
      await page.locator('#file-back').setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: await fabric(page, 'synthetic-back.png', v) })
      await chooseDoc(page, 'tie')
      await expect(page.locator('#preview')).toHaveJSProperty('width', 1712, { timeout: 30_000 })
      await page.locator('#tab-front').click()
      await page.locator('#adjust-front').click()
      await expect(page.locator('[data-source]')).toHaveAttribute('data-source', model ? 'model' : 'edges')
      const attr = await page.locator('[data-corners]').getAttribute('data-corners')
      const found = (attr ?? '').split(' ').map((p) => { const [x = 0, y = 0] = p.split(',').map(Number); return { x, y } })
      const ch = v.cardW * 53.98 / 85.6
      const [c, s] = [Math.cos(v.angle), Math.sin(v.angle)]
      const truth = [[-v.cardW / 2, -ch / 2], [v.cardW / 2, -ch / 2], [v.cardW / 2, ch / 2], [-v.cardW / 2, ch / 2]]
        .map(([dx = 0, dy = 0]) => ({ x: v.W / 2 + dx * c - dy * s, y: v.H / 2 + dx * s + dy * c }))
      // Within 1 % of the card's width on every corner.
      for (const [i, p] of found.entries()) expect(Math.hypot(p.x - truth[i]!.x, p.y - truth[i]!.y)).toBeLessThan(v.cardW / 100)
    })
  }
}
