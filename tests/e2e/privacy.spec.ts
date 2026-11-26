// SPDX-License-Identifier: AGPL-3.0-or-later
// The privacy promise, tested end to end: once the app's files are on the device, a whole document
// workflow (both sides, corner model, document detection and smart find with OCR, redaction,
// watermark, greyscale, PDF) sends no request at all. Synthetic cards only: a fictional DNI whose
// values serve as canaries, so a request that carried them would also be caught.
import { expect, test, type Page } from '@playwright/test'
import { controlled, toEditorWithText } from './helpers.ts'

test.use({ locale: 'es-ES', serviceWorkers: 'allow' })

/** Values printed on the synthetic cards: none may ever appear in a request. */
const CANARIES = ['99999999R', 'CARMEN', 'ESPANOLA', 'BAA000589', 'CAA000000', '987654', 'CALLE MAYOR']

/** Which on-demand files (OCR engine and data, corner model) the service worker has cached. */
async function cachedOnDemand (page: Page): Promise<Record<'worker' | 'core' | 'lang' | 'model', boolean>> {
  return await page.evaluate(async () => {
    const paths: string[] = []
    for (const k of await caches.keys()) {
      for (const r of await (await caches.open(k)).keys()) paths.push(new URL(r.url).pathname)
    }
    return {
      worker: paths.includes('/ocr/worker.min.js'),
      core: paths.some((p) => /^\/ocr\/tesseract-core-.*\.wasm\.js$/.test(p)),
      lang: paths.includes('/ocr/spa.traineddata'),
      model: paths.some((p) => p.startsWith('/assets/ml/')),
    }
  })
}

/** Smart find, a watermark, greyscale, review and the PDF download. */
async function finishDocument (page: Page): Promise<void> {
  await expect(page.locator('#find-run')).toBeEnabled({ timeout: 30_000 })
  await page.locator('#find-run').click()
  await expect(page.locator('#find-status')).toContainText(/Se han añadido \d+ recuadros/, { timeout: 150_000 })
  await page.locator('#tool-mark').click()
  await page.locator('#watermark').fill('Solo para el alquiler 99999999R')
  await page.locator('#greyscale').check()
  await page.locator('#review').click()
  await page.locator('#review-confirm').check()
  const download = page.waitForEvent('download')
  await page.locator('#download').click()
  expect((await download).suggestedFilename()).toBe('protected-document.pdf')
}

test('after the first visit, a whole document workflow sends no request at all', async ({ page, context }) => {
  test.setTimeout(300_000)
  // First visit, online: the service worker installs, and one run caches the corner model and OCR.
  await controlled(page)
  await toEditorWithText(page, { model: true })
  // Wait until the files used on demand are really in the cache (document detection downloads OCR
  // in the background): otherwise the measured run below would count a legitimate first download.
  await expect.poll(async () => await cachedOnDemand(page), { timeout: 60_000 })
    .toEqual({ worker: true, core: true, lang: true, model: true })

  // From here on, every request that would reach the network is recorded and refused. context.route
  // sees the page's requests that bypass the service worker and the service worker's own requests.
  const sent: string[] = []
  await context.route('**/*', async (route) => {
    sent.push(`${route.request().method()} ${route.request().url()}`)
    await route.abort('blockedbyclient')
  })
  // Every request the page or its workers make, even those the service worker answers from its cache.
  const seen: string[] = []
  context.on('request', (r) => { seen.push(`${r.method()} ${r.url()} ${r.postData() ?? ''}`) })

  await page.reload()
  await toEditorWithText(page, { model: true })
  await finishDocument(page)

  expect(sent).toEqual([])
  for (const c of CANARIES) expect(seen.filter((s) => s.toUpperCase().includes(c))).toEqual([])
  // Nothing but the app's own files was requested, all with GET.
  const origin = new URL(page.url()).origin
  expect(seen.filter((s) => !s.startsWith(`GET ${origin}/`) && !/^GET (blob|data):/.test(s))).toEqual([])
})

test('nothing about the document is stored in the browser', async ({ page }) => {
  test.setTimeout(300_000)
  await controlled(page)
  await toEditorWithText(page, { model: true })
  await finishDocument(page)
  const stored = await page.evaluate(async () => {
    const cached: string[] = []
    for (const k of await caches.keys()) {
      for (const r of await (await caches.open(k)).keys()) cached.push(new URL(r.url).pathname)
    }
    return {
      cookies: document.cookie, // eslint-disable-line no-restricted-properties
      // The test only reads these stores to check that they are empty.
      local: localStorage.length, // eslint-disable-line no-restricted-properties
      session: sessionStorage.length, // eslint-disable-line no-restricted-properties
      databases: (await indexedDB.databases()).map((d) => d.name), // eslint-disable-line no-restricted-properties
      // Only the app's own files (and its install manifest and icons, ADR 0018): no blob:, no photo, no PDF.
      foreign: cached.filter((p) => !/^\/(index\.html|manifest\.webmanifest|icons\/[\w-]+\.png|assets\/.+|ocr\/.+)$/.test(p)),
    }
  })
  expect(stored).toEqual({ cookies: '', local: 0, session: 0, databases: [], foreign: [] })
})
