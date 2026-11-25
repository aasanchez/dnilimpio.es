// SPDX-License-Identifier: AGPL-3.0-or-later
// On-device OCR (Tesseract.js, self-hosted under ocr/, loaded on demand). The interface does not use it
// yet, so the tests load the OCR module the way the app will: by its URL from the import map.
import { expect, test, type Page } from '@playwright/test'
import { checkDigit } from '../../src/ocr/mrz.ts'

test.use({ serviceWorkers: 'allow' })

/** A valid TD1 MRZ for a fictional DNI. */
function mrz (): [string, string, string] {
  const number = 'BAA000589'
  const l1 = `IDESP${number}${String(checkDigit(number))}99999999R<<<<<<`
  const birth = '800101'
  const expiry = '310101'
  const l2a = `${birth}${String(checkDigit(birth))}F${expiry}${String(checkDigit(expiry))}ESP<<<<<<<<<<<`
  const composite = l1.slice(5, 30) + l2a.slice(0, 7) + l2a.slice(8, 15) + l2a.slice(18, 29)
  return [l1, l2a + String(checkDigit(composite)), 'ESPANOLA<ESPANOLA<<CARMEN<<<<']
}

/** Path of the OCR chunk, from the import map. */
async function ocrChunk (page: Page): Promise<string> {
  const map = await page.locator('script[type="importmap"]').evaluate((s) => s.textContent)
  const path = Object.keys((JSON.parse(map) as { integrity: Record<string, string> }).integrity).find((p) => /\/ocr-[^/]+\.js$/.test(p))
  if (!path) throw new Error('no OCR chunk in the import map')
  return path
}

async function controlled (page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
}

test('reads a DNI MRZ on the device, then works offline from the cache', async ({ page, context }) => {
  test.setTimeout(120_000)
  const foreign: string[] = []
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173/') && !/^(blob|data):/.test(r.url())) foreign.push(r.url()) })
  await controlled(page)
  const chunk = await ocrChunk(page)
  const lines = mrz()

  const run = async (): Promise<{ before: string; code: string | undefined; number: string | undefined; valid: boolean | undefined }> => await page.evaluate(async ([path, text]) => {
    const ocr = await import(path) as typeof import('../../src/ocr/ocr.ts')
    const before = (await ocr.ocrStatus()).state
    const c = new OffscreenCanvas(1400, 260)
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no 2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#000'
    ctx.font = '48px monospace'
    text.forEach((l, i) => { ctx.fillText(l, 30, 70 + i * 70) })
    const m = await ocr.readMrz(c)
    await ocr.stopOcr()
    return { before, code: m?.documentCode, number: m?.documentNumber, valid: m?.valid }
  }, [chunk, lines] as const)

  const first = await run()
  expect(first.before).toBe('download')
  expect(first).toMatchObject({ code: 'ID', number: 'BAA000589', valid: true })

  // Second time, offline: the files come from the service worker's cache.
  await context.setOffline(true)
  await page.reload()
  const second = await run()
  expect(second.before).toBe('ready')
  expect(second).toMatchObject({ code: 'ID', valid: true })
  expect(foreign).toEqual([])
})

test('offline before the first download, OCR reports itself unavailable instead of failing', async ({ page, context }) => {
  await controlled(page)
  const chunk = await ocrChunk(page)
  await context.setOffline(true)
  const status = await page.evaluate(async (path) => await (await import(path) as typeof import('../../src/ocr/ocr.ts')).ocrStatus(), chunk)
  expect(status).toEqual({ state: 'unavailable', reason: 'offline' })
})

test.describe('without a service worker', () => {
  test.use({ serviceWorkers: 'block' })
  test('OCR is unavailable, because nothing would check the files', async ({ page }) => {
    await page.goto('/')
    const chunk = await ocrChunk(page)
    const status = await page.evaluate(async (path) => await (await import(path) as typeof import('../../src/ocr/ocr.ts')).ocrStatus(), chunk)
    expect(status).toEqual({ state: 'unavailable', reason: 'no-service-worker' })
  })
})

test('a tampered OCR file is refused and nothing is cached', async ({ page, context }) => {
  test.setTimeout(30_000)
  await context.route('**/ocr/spa.traineddata', async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, body: Buffer.concat([await res.body(), Buffer.from('x')]) })
  })
  await controlled(page)
  const chunk = await ocrChunk(page)
  const result = await page.evaluate(async (path) => {
    const ocr = await import(path) as typeof import('../../src/ocr/ocr.ts')
    const c = new OffscreenCanvas(200, 50)
    try { await ocr.readMrz(c); return 'read' } catch { return 'refused' } finally { await ocr.stopOcr() }
  }, chunk)
  expect(result).toBe('refused')
  expect(await page.evaluate(async () => await caches.match(new URL('ocr/spa.traineddata', document.baseURI).href) !== undefined)).toBe(false)
})
