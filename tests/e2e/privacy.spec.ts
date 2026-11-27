// SPDX-License-Identifier: AGPL-3.0-or-later
// The privacy promise, tested end to end: once the app's files are on the device, a whole document
// workflow (both sides, corner model, document detection and smart find with OCR, redaction,
// watermark, greyscale, PDF) sends no request at all. Synthetic cards only: a fictional DNI whose
// values serve as canaries, so a request that carried them would also be caught.
//
// Canaries come from every place document data enters the app: the text printed on the cards (read
// by OCR), the photos' file names and the watermark the user types. They are watched from the first
// page load, while the app's files still download, in every request's address, headers and body, and
// in the exported PDF.
import { readFileSync } from 'node:fs'
import { expect, test, type Page, type Request } from '@playwright/test'
import { MARK, NAMES, WATERMARK, canariesIn } from './canaries.ts'
import { controlled, toEditorWithText } from './helpers.ts'

test.use({ locale: 'es-ES', serviceWorkers: 'allow' })

/** Every canary that a request carries in its address, headers or body, in plain or URL-encoded form. */
function leaks (r: Request): string[] {
  return canariesIn(r.url(), JSON.stringify(r.headers()), r.postData() ?? '').map((c) => `${c} in ${r.method()} ${r.url()}`)
}

/** Which on-demand files (OCR engine and data, corner model) the service worker has cached. */
async function cachedOnDemand (page: Page): Promise<Record<'worker' | 'core' | 'lang' | 'model', boolean>> {
  return await page.evaluate(async () => {
    const paths: string[] = []
    for (const k of await caches.keys()) {
      for (const r of await (await caches.open(k)).keys()) paths.push(new URL(r.url).pathname)
    }
    return {
      worker: paths.includes('/ocr/worker.min.js'),
      core: paths.includes('/ocr/ort-wasm-simd-threaded.wasm'),
      lang: paths.includes('/ocr/ppocrv6-tiny-rec.onnx'),
      model: paths.some((p) => p.startsWith('/assets/ml/')),
    }
  })
}

/** Smart find, a watermark, greyscale, review and the PDF download. */
async function finishDocument (page: Page): Promise<string> {
  await expect(page.locator('#find-run')).toBeEnabled({ timeout: 30_000 })
  await page.locator('#find-run').click()
  await expect(page.locator('#find-status')).toContainText(/Se han añadido \d+ recuadros/, { timeout: 150_000 })
  await page.locator('#tool-mark').click()
  await page.locator('#watermark').fill(WATERMARK)
  await page.locator('#greyscale').check()
  await page.locator('#review').click()
  await page.locator('#review-confirm').check()
  const download = page.waitForEvent('download')
  await page.locator('#download').click()
  const pdf = await download
  // The file name of the export never echoes the photos' names.
  expect(pdf.suggestedFilename()).toBe('redacted-dni.pdf')
  expect(canariesIn(pdf.suggestedFilename())).toEqual([])
  return await pdf.path()
}

/** Canaries found as text in the exported PDF (masks and watermark are pixels, so there must be none). */
function pdfLeaks (path: string): string[] {
  return canariesIn(readFileSync(path).toString('latin1'))
}

test('after the first visit, a whole document workflow sends no request at all', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', "Playwright routes and reports a service worker's own requests only in Chromium: without that, this test could miss a request.")
  test.setTimeout(300_000)
  // Watched from the very first request: the first visit downloads the app's files, and none of
  // those requests may carry document data either.
  const leaked: string[] = []
  const firstVisit: string[] = []
  const onFirst = (r: Request): void => { leaked.push(...leaks(r)); firstVisit.push(`${r.method()} ${r.url()}`) }
  context.on('request', onFirst)
  // First visit, online: the service worker installs, and one run caches the corner model and OCR.
  await controlled(page)
  await toEditorWithText(page, { model: true, names: NAMES })
  // Wait until the files used on demand are really in the cache (document detection downloads OCR
  // in the background): otherwise the measured run below would count a legitimate first download.
  await expect.poll(async () => await cachedOnDemand(page), { timeout: 60_000 })
    .toEqual({ worker: true, core: true, lang: true, model: true })

  // From here on, every request that would reach the network is recorded and refused. context.route
  // sees the page's requests that bypass the service worker and the service worker's own requests.
  context.off('request', onFirst)
  const origin = new URL(page.url()).origin
  // Online, the app fetches only its own files, with GET.
  expect(firstVisit.filter((s) => !s.startsWith(`GET ${origin}/`) && !/^GET (blob|data):/.test(s))).toEqual([])
  const sent: string[] = []
  await context.route('**/*', async (route) => {
    sent.push(`${route.request().method()} ${route.request().url()}`)
    await route.abort('blockedbyclient')
  })
  // Every request the page or its workers make, even those the service worker answers from its cache.
  const seen: string[] = []
  context.on('request', (r) => { leaked.push(...leaks(r)); seen.push(`${r.method()} ${r.url()} ${r.postData() ?? ''}`) })

  await page.reload()
  await toEditorWithText(page, { model: true, names: NAMES })
  const pdf = await finishDocument(page)

  expect(sent).toEqual([])
  expect(leaked).toEqual([])
  expect(pdfLeaks(pdf)).toEqual([])
  // Nothing but the app's own files was requested, all with GET.
  expect(seen.filter((s) => !s.startsWith(`GET ${origin}/`) && !/^GET (blob|data):/.test(s))).toEqual([])
})

test('nothing about the document is stored in the browser', async ({ page }) => {
  test.setTimeout(300_000)
  await controlled(page)
  await toEditorWithText(page, { model: true, names: NAMES })
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
      // Only the app's own files (its install manifest, icons and favicon, ADR 0018; robots.txt and sitemap.xml; the card guide pages, ADR 0040): no blob:, no photo, no PDF.
      foreign: cached.filter((p) => !/^\/(index\.html|thanks\.html|guia-(dni-4|dni-3|tie)\.html|manifest\.webmanifest|robots\.txt|sitemap\.xml|favicon\.ico|icons\/[\w-]+\.(png|svg)|assets\/.+|ocr\/.+)$/.test(p)),
    }
  })
  expect(stored).toEqual({ cookies: '', local: 0, session: 0, databases: [], foreign: [] })
})

test('the canary check catches document data in an address, plain or encoded', async ({ page }) => {
  // Guards the guard: if leaks() stopped matching, the tests above would pass for the wrong reason.
  await page.goto('/')
  const caught: string[] = []
  page.on('request', (r) => { if (r.url().includes('probe')) caught.push(...leaks(r)) })
  await page.evaluate(([mark, name]) => {
    for (const q of [mark, encodeURIComponent(name)]) {
      const img = new Image()
      img.src = `./probe.png?q=${q}`
    }
  }, [MARK, `${NAMES[0]} `] as const)
  await expect.poll(() => caught.length).toBe(2)
  expect(caught.map((c) => c.split(' ')[0])).toEqual([MARK, NAMES[0].replace(/\.png$/, '').toUpperCase()])
})
