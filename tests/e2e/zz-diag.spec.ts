// SPDX-License-Identifier: AGPL-3.0-or-later
// TEMPORARY diagnostic for Firefox OCR; removed before merge.
import { expect, test } from '@playwright/test'
import { controlled, fixture } from './helpers.ts'

test.use({ serviceWorkers: 'allow', locale: 'es-ES' })
test.skip(({ browserName }) => browserName === 'chromium', 'Temporary diagnostic for Firefox and WebKit.')

test('diag: OCR status and prepare', async ({ page }) => {
  test.setTimeout(240_000)
  page.on('console', (m) => { console.log(`[console ${m.type()}] ${m.text()}`) })
  page.on('pageerror', (e) => { console.log(`[pageerror] ${e.message}`) })
  await controlled(page)
  const ask = async (type: string): Promise<unknown> => await page.evaluate(async (type) => await new Promise((resolve) => {
    const c = navigator.serviceWorker.controller
    if (!c) { resolve('no controller'); return }
    const ch = new MessageChannel()
    const t = setTimeout(() => { resolve('timeout') }, 200_000)
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data) }
    c.postMessage({ type, paths: ['ocr/worker.min.js', 'ocr/ort-wasm-simd-threaded.wasm', 'ocr/ppocrv6-tiny-rec.onnx', 'ocr/ppocrv6-tiny-det.onnx', 'ocr/ppocrv6-tiny-dict.json', 'ocr/ort-wasm-simd-threaded.mjs'] }, [ch.port2])
  }), type)
  console.log('simd/worker/wasm', await page.evaluate(() => ({ wasm: typeof WebAssembly, worker: typeof Worker, sab: typeof SharedArrayBuffer, coi: crossOriginIsolated })))
  console.log('status', JSON.stringify(await ask('status')))
  console.log('prepare', JSON.stringify(await ask('prepare')))
  console.log('status after', JSON.stringify(await ask('status')))
  expect(true).toBe(true)
})

test('diag: model offline after first use', async ({ page, context }) => {
  test.setTimeout(120_000)
  page.on('console', (m) => { console.log(`[console ${m.type()}] ${m.text()}`) })
  page.on('pageerror', (e) => { console.log(`[pageerror] ${e.message}\n${e.stack ?? ''}`) })
  page.on('requestfailed', (r) => { console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ''}`) })
  await controlled(page)
  await page.locator('#start').click()
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect.poll(async () => await page.evaluate(async () => {
    const out: string[] = []
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname)
    return out.filter((p) => p.startsWith('/assets/ml/')).length
  }), { timeout: 20_000 }).toBe(2)
  await context.setOffline(true)
  await page.reload()
  console.log('--- offline reload done')
  await page.locator('#start').click()
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await page.locator('#capture-continue').click()
  await page.locator('#doc-dni').check()
  await page.locator('#doc-continue').click()
  await page.waitForTimeout(5000)
  console.log('source', await page.locator('[data-source]').first().getAttribute('data-source', { timeout: 5000 }).catch(() => 'none'))
})
