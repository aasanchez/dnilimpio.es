// SPDX-License-Identifier: AGPL-3.0-or-later
// Opt-in usage stats (ADR 0029). "Clear everything" clears the photos and opens the thanks page,
// a page of its own that never holds a photo. It shows the exact text it would send and sends it
// only when the person taps Send. Nothing is sent on the way there, and the app page still cannot
// connect anywhere.
import { expect, test, type Page, type Request } from '@playwright/test'
import { THANKS_CSP } from '../../scripts/csp.ts'
import { THANKS_PAGE_CSP } from '../../scripts/headers.ts'
import { parseStats } from '../../src/stats/schema.ts'
import { toEditor } from './helpers.ts'

test.use({ locale: 'es-ES' })

/** Every request the page makes that is not a GET of one of the site's files. */
function watchSends (page: Page): Request[] {
  const sent: Request[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (r.method() !== 'GET' || url.origin !== 'http://localhost:4173' || url.pathname === '/stats') sent.push(r)
  })
  return sent
}

async function toThanks (page: Page): Promise<void> {
  await toEditor(page)
  await page.locator('#review').click()
  await page.locator('#review-confirm').check()
  await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  // The small link appears only once the PDF has left; it opens the stats page.
  await page.locator('#stats-link').click()
  await expect(page.locator('#thanks-title')).toHaveText('Datos de uso anónimos')
}

test('Clear everything opens the photo-free thanks page; nothing is sent until the person taps Send', async ({ page }) => {
  const sent = watchSends(page)
  await toThanks(page)

  // A new page: no photo, no canvas, no image from memory. The figures left the address at once.
  expect(new URL(page.url()).pathname).toBe('/thanks.html')
  expect(new URL(page.url()).hash).toBe('')
  await expect(page.locator('canvas, img[src^="blob:"], img[src^="data:"]')).toHaveCount(0)
  expect(sent).toEqual([])

  // The text shown is exactly what would be sent: one key=value per line, from the fixed list.
  const shown = (await page.locator('#stats-payload').textContent() ?? '').split('\n').join('&')
  const stats = parseStats(shown)
  expect(stats).toMatchObject({ doc: 'dni-4.0', back: true, lang: 'es', src: 'file', device: 'desktop', browser: 'chrome', pwa: false })
  expect(stats?.fields).toEqual(expect.arrayContaining(['signature', 'can', 'mrz']))
  expect(shown).not.toMatch(/[A-Z]{2,}\d|base64|blob:/)

  await page.waitForTimeout(500)
  expect(sent).toEqual([])
  const [post] = await Promise.all([page.waitForRequest('**/stats'), page.locator('#stats-send').click()])
  expect(post.method()).toBe('POST')
  expect(post.postData()).toBe(shown)
  expect(post.headers()['cookie']).toBeUndefined()
  expect(post.headers()['referer']).toBeUndefined()
  // The button itself turns into the thank-you and stays off: one send per visit.
  await expect(page.locator('#stats-send')).toHaveText('✓ ¡Gracias!')
  await expect(page.locator('#stats-send')).toBeDisabled()
  expect(sent).toHaveLength(1)

  // Start again: back to the app's start screen.
  await page.locator('#start-again').click()
  await expect(page.locator('#start')).toBeVisible()
})

test('the thanks page has its own policy: its own origin only, no frames, no other page loosened', async ({ page }) => {
  const res = await page.goto('./thanks.html')
  expect(res?.headers()['content-security-policy']).toBe(THANKS_PAGE_CSP)
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toBe(THANKS_CSP)
  // The thanks page cannot reach another site either.
  const outside = await page.evaluate(async () => await fetch('https://example.com/').then(() => 'sent', () => 'blocked'))
  expect(outside).toBe('blocked')
  // The app page still refuses every connection, also to /stats.
  await page.goto('./')
  const fromApp = await page.evaluate(async () => await fetch('./stats', { method: 'POST', body: 'v=1' }).then(() => 'sent', () => 'blocked'))
  expect(fromApp).toBe('blocked')
})

test('an address with anything else after # shows nothing to send', async ({ page }) => {
  const sent = watchSends(page)
  await page.goto('./thanks.html#photo=data:image/jpeg;base64,/9j/4AAQSkZJRg&doc=tie')
  await expect(page.locator('#thanks-title')).toBeVisible()
  await expect(page.locator('#stats')).toHaveCount(0)
  expect(new URL(page.url()).hash).toBe('')
  await page.goto('./thanks.html')
  await expect(page.locator('#stats')).toHaveCount(0)
  expect(sent).toEqual([])
})

test('offline, the button is off and says why; a failed send says so and keeps nothing', async ({ page, context }) => {
  await toThanks(page)
  await context.setOffline(true)
  await expect(page.locator('#stats-send')).toBeDisabled()
  await expect(page.locator('#stats-status')).toHaveText('Sin conexión: no se puede enviar nada.')
  await context.setOffline(false)
  await expect(page.locator('#stats-send')).toBeEnabled()
  await page.route('**/stats', async (route) => { await route.fulfill({ status: 500 }) })
  await page.locator('#stats-send').click()
  await expect(page.locator('#stats-status')).toHaveText('No se ha podido enviar. No se ha guardado nada de esta visita.')
})

test('Arabic: the thanks page is right to left, the sent text stays left to right', async ({ page }) => {
  await page.goto('./thanks.html#v=1&doc=tie&ai=none&back=0&fields=can&boxes=0&mark=0&grey=0&lang=ar&app=dev&src=file&ocr=1')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('#stats-payload')).toHaveAttribute('dir', 'ltr')
  await expect(page.locator('#stats-send')).toHaveText('أرسل الإحصاءات المجهولة')
})

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })
  test('it passes on the thanks page\'s one POST and refuses the same request from the app page', async ({ page }) => {
    await page.goto('./')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.reload()
    await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    await page.goto('./thanks.html#v=1&doc=tie&ai=right&back=1&fields=can,mrz&boxes=0&mark=0&grey=0&lang=es&app=dev&src=camera&ocr=1')
    await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    await page.locator('#stats-send').click()
    // The preview answers with the Worker's own code: 204 only for the exact list.
    await expect(page.locator('#stats-send')).toHaveText('✓ ¡Gracias!')
    // The same POST from the app page: refused (its CSP first, the worker's route() second).
    await page.goto('./')
    await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    const fromApp = await page.evaluate(async () => await fetch('./stats', { method: 'POST', body: 'v=1' }).then(() => 'sent', () => 'blocked'))
    expect(fromApp).toBe('blocked')
  })
})
