// SPDX-License-Identifier: AGPL-3.0-or-later
// Installable app (ADR 0018): a valid manifest with relative URLs and real icons, Chromium's own
// installability check, and the "Install app" link (browser dialog on Chromium, Share steps on iOS).
import { expect, test, type Page } from '@playwright/test'

test.use({ locale: 'en-GB' })

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1'

interface Manifest { id: string; name: string; short_name: string; start_url: string; scope: string; display: string; icons: Array<{ src: string; sizes: string; purpose: string }> }

async function manifestOf (page: Page): Promise<Manifest> {
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('./manifest.webmanifest')
  const res = await page.request.get(new URL(href ?? '', page.url()).href)
  expect(res.ok()).toBe(true)
  return await res.json() as Manifest
}

test('has a manifest with relative URLs and icons of the stated sizes', async ({ page }) => {
  await page.goto('/')
  const m = await manifestOf(page)
  expect(m).toMatchObject({ id: './', name: 'DNI Tapado.es', short_name: 'DT.es', start_url: './', scope: './', display: 'standalone' })
  expect(m.icons.map((i) => i.purpose).sort()).toEqual(['any', 'any', 'maskable', 'maskable'])
  const icons = [...m.icons.map((i) => ({ src: i.src, size: i.sizes })), { src: 'icons/apple-touch-icon.png', size: '180x180' }, { src: 'icons/favicon-32.png', size: '32x32' }, { src: 'icons/favicon-16.png', size: '16x16' }]
  for (const icon of icons) {
    expect(icon.src.startsWith('/')).toBe(false)
    const size = await page.evaluate(async (src) => {
      const img = new Image()
      img.src = src
      await img.decode()
      return `${String(img.naturalWidth)}x${String(img.naturalHeight)}`
    }, icon.src)
    expect(size).toBe(icon.size)
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', './icons/apple-touch-icon.png')
})

test('links a favicon in SVG, PNG and ICO with relative URLs', async ({ page }) => {
  await page.goto('/')
  const links = await page.locator('link[rel="icon"]').evaluateAll((els) => els.map((el) => ({
    href: el.getAttribute('href'), type: el.getAttribute('type'), sizes: el.getAttribute('sizes'),
  })))
  expect(links).toEqual([
    { href: './favicon.ico', type: null, sizes: '32x32' },
    { href: './icons/favicon.svg', type: 'image/svg+xml', sizes: null },
    { href: './icons/favicon-32.png', type: 'image/png', sizes: '32x32' },
    { href: './icons/favicon-16.png', type: 'image/png', sizes: '16x16' },
  ])
  for (const { href, type } of links) {
    const res = await page.request.get(new URL(href ?? '', page.url()).href)
    expect(res.ok(), href ?? '').toBe(true)
    if (type !== null) expect(res.headers()['content-type']).toContain(type)
    // The browser can draw each one.
    const ok = await page.evaluate(async (src) => {
      const img = new Image()
      img.src = src
      await img.decode()
      return img.naturalWidth > 0
    }, href ?? '')
    expect(ok, href ?? '').toBe(true)
  }
})

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('Chromium finds nothing that stops installation', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    const cdp = await page.context().newCDPSession(page)
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
    expect(installabilityErrors).toEqual([])
    const { errors } = await cdp.send('Page.getAppManifest')
    expect(errors).toEqual([])
  })
})

test('offers the browser install dialog when Chromium allows it, then hides the link', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#install')).toHaveCount(0)
  // The same event Chromium fires, with a dialog that the user accepts.
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(e, {
      prompt: async () => { (window as unknown as { prompted: boolean }).prompted = true; await Promise.resolve() },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })
    dispatchEvent(e)
  })
  await expect(page.locator('#install')).toHaveText('Install the app')
  await page.locator('#install').click()
  expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true)
  await expect(page.locator('#install')).toHaveCount(0)
})

test.describe('on iPhone', () => {
  test.use({ userAgent: IPHONE, hasTouch: true })

  test('shows the Add to Home Screen steps', async ({ page }) => {
    await page.goto('/')
    const button = page.locator('#install')
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#install-help')).toContainText('Add to Home Screen')
    await button.click()
    await expect(page.locator('#install-help')).toHaveCount(0)
  })

  test('shows nothing once installed', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }) })
    await page.goto('/')
    await expect(page.locator('#source-link')).toBeVisible()
    await expect(page.locator('#install')).toHaveCount(0)
  })
})
