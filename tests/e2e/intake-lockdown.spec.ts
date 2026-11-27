// SPDX-License-Identifier: AGPL-3.0-or-later
// Intake lockdown (ADR 0025): while photos are in the page, code in the page cannot send them out by
// loading something. Each probe below tries one channel with a marker in its address; a probe that
// reaches the network (the page's own requests, or the service worker's) is recorded and refused.
// Synthetic cards only.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { controlled, loadBoth, toEditorWithText } from './helpers.ts'

test.use({ locale: 'es-ES' })

const MARK = 'leak-'

/** Records every request with a probe marker that would reach the network, and refuses it. */
async function trap (context: BrowserContext): Promise<string[]> {
  const reached: string[] = []
  await context.route(`**/*${MARK}*`, async (route) => {
    const m = new RegExp(`${MARK}([a-z]+)`).exec(route.request().url())
    reached.push(m?.[1] ?? route.request().url())
    await route.abort('blockedbyclient')
  })
  return reached
}

/**
 * Every way the page could load something with data in its address: image, CSS background, font,
 * stylesheet, fetch, XHR, sendBeacon, WebSocket, a worker and a script import of a build file.
 * Returns once every probe has failed, loaded, or had time to.
 */
async function probe (page: Page): Promise<void> {
  await page.evaluate(async (mark) => {
    const settle = async (el: HTMLElement): Promise<void> => {
      await new Promise<void>((resolve) => {
        el.addEventListener('load', () => { resolve() })
        el.addEventListener('error', () => { resolve() })
        setTimeout(resolve, 1500)
      })
    }
    const tries: Array<Promise<unknown>> = []
    const img = new Image()
    tries.push(settle(img))
    img.src = `./icons/favicon-32.png?${mark}img`
    const bg = document.createElement('div')
    bg.style.backgroundImage = `url(./icons/favicon-16.png?${mark}bg)`
    bg.style.width = '10px'
    bg.style.height = '10px'
    document.body.append(bg)
    tries.push(new FontFace('Probe', `url(./assets/probe.woff2?${mark}font)`).load())
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = `./assets/probe.css?${mark}style`
    tries.push(settle(css))
    document.head.append(css)
    tries.push(fetch(`./?${mark}fetch`))
    tries.push(new Promise((resolve) => {
      const x = new XMLHttpRequest()
      x.onloadend = resolve
      try {
        x.open('GET', `./?${mark}xhr`)
        x.send()
      } catch (e) { resolve(e) }
    }))
    // The test tries this channel to prove that it is closed.
    try { navigator.sendBeacon(`./?${mark}beacon`, 'x') } catch { /* refused */ } // eslint-disable-line no-restricted-properties
    try { new WebSocket(`ws://${location.host}/?${mark}ws`).close() } catch { /* refused */ }
    // Trusted Types compares the whole address, query string included: this throws.
    try { new Worker(`./ocr/worker.min.js?${mark}worker`).terminate() } catch { /* refused */ }
    // A real file of this build, with a query string: CSP ignores query strings when it compares.
    const map = JSON.parse(document.querySelector('script[type="importmap"]')?.textContent ?? '{}') as { integrity?: Record<string, string> }
    const chunk = Object.keys(map.integrity ?? {}).find((k) => k.includes('/rolldown-runtime-')) ?? './assets/x.js'
    tries.push(import(/* @vite-ignore */ `${chunk}?${mark}import`))
    await Promise.allSettled(tries)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }, MARK)
}

test('the probes work: on the start screen, before any photo, an image with a query string reaches the server', async ({ page, context }) => {
  const reached = await trap(context)
  await page.goto('/')
  await expect(page.locator('meta[data-intake-lockdown]')).toHaveCount(0)
  await probe(page)
  // The first policy allows the site's own images; the photo step's does not.
  expect(reached).toContain('img')
  expect(reached).toContain('bg')
})

test('with photos loaded and no service worker, the policy stops every channel except a script import with a query string', async ({ page, context }) => {
  const reached = await trap(context)
  await loadBoth(page)
  await expect(page.locator('meta[data-intake-lockdown]')).toHaveCount(1)
  await probe(page)
  // The one documented limit of CSP alone (ADR 0025): the service worker closes it (next test).
  expect(reached.sort()).toEqual(['import'])
  await expect(page.locator('#filter-note')).toContainText('no está activo')
})

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('with photos loaded, nothing reaches the network, not even a script import with a query string', async ({ page, context }) => {
    await controlled(page)
    const reached = await trap(context)
    await page.locator('#start').click()
    await page.locator('#file-front').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: await tinyPng(page) })
    await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
    await probe(page)
    expect(reached).toEqual([])
    await expect(page.locator('#filter-note')).toHaveCount(0)
  })

  test('a whole workflow under the photo step\'s policy breaks nothing: no policy violation at all', async ({ page }) => {
    test.setTimeout(240_000)
    await page.addInitScript(() => {
      const w = window as unknown as { violations: string[] }
      w.violations = []
      document.addEventListener('securitypolicyviolation', (e) => { w.violations.push(`${e.violatedDirective} ${e.blockedURI}`) })
    })
    // The OCR engine runs only under the service worker, which gives its worker a CSP (ADR 0019).
    await controlled(page)
    // The corner model, document detection, OCR (smart find), watermark, review and PDF.
    await toEditorWithText(page, { model: true })
    await expect(page.locator('#find-run')).toBeEnabled({ timeout: 30_000 })
    await page.locator('#find-run').click()
    await expect(page.locator('#find-status')).toContainText(/Se han añadido \d+ recuadros/, { timeout: 150_000 })
    // A field's guide entry (its own chunk) and another language, after the policy is in force.
    await page.locator('[id^="about-"]').first().click()
    await expect(page.locator('dialog.guide')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.locator('#lang').selectOption('ar')
    await page.locator('#lang').selectOption('es')
    await page.locator('#tool-mark').click()
    await page.locator('#watermark').fill('Solo para el alquiler')
    await page.locator('#review').click()
    await page.locator('#review-confirm').check()
    const download = page.waitForEvent('download')
    await page.locator('#download').click()
    expect((await download).suggestedFilename()).toBe('redacted-dni.pdf')
    expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([])
    // The listener does see a violation: a load the policy refuses.
    await page.evaluate(() => { new Image().src = './icons/favicon-32.png' })
    await expect.poll(async () => await page.evaluate(() => (window as unknown as { violations: string[] }).violations))
      .toEqual([expect.stringMatching(/^img-src .*favicon-32\.png$/)])
  })
})

test('the photo step\'s policy lists exact build files, no origin, no analytics, no connection', async ({ page }) => {
  await page.goto('/')
  await page.locator('#start').click()
  const policy = await page.locator('meta[data-intake-lockdown]').getAttribute('content') ?? ''
  const d: Record<string, string[]> = Object.fromEntries(policy.split('; ').map((x) => [x.split(' ')[0] ?? '', x.split(' ').slice(1)]))
  expect(d['connect-src']).toEqual(["'none'"])
  expect(d['frame-src']).toEqual(["'none'"])
  expect(d['img-src']).toEqual(['blob:', 'data:'])
  expect(d['font-src']).toEqual(["'none'"])
  expect(d['style-src']).toEqual(["'none'"])
  expect(d['manifest-src']).toEqual(["'none'"])
  expect(d['default-src']).toEqual(["'none'"])
  const origin = new URL(page.url()).origin
  expect(d['worker-src']).toEqual([`${origin}/sw.js`, `${origin}/ocr/worker.min.js`])
  // sw.js once, by its exact address (ADR 0037: Firefox checks scripts the service worker answers
  // against it); every other source is a module of this build.
  const sources = d['script-src'] ?? []
  expect(sources.filter((s) => s === `${origin}/sw.js`)).toHaveLength(1)
  const scripts = sources.filter((s) => s !== "'wasm-unsafe-eval'" && s !== `${origin}/sw.js`)
  expect(scripts.length).toBeGreaterThan(5)
  for (const s of scripts) expect(s).toMatch(new RegExp(`^${origin}/assets/[\\w./-]+\\.m?js$`))
  // Back on the start screen the policy stays: only a reload drops it, and a reload drops the photos.
  await page.locator('#back').click()
  await expect(page.locator('meta[data-intake-lockdown]')).toHaveCount(1)
})

/** A small synthetic PNG drawn in the page. */
async function tinyPng (page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = new OffscreenCanvas(64, 40)
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no 2d')
    ctx.fillStyle = '#ddd'
    ctx.fillRect(0, 0, 64, 40)
    const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  })
  return Buffer.from(b64, 'base64')
}
