// SPDX-License-Identifier: AGPL-3.0-or-later
// Browsers without Trusted Types (older Firefox and Safari). installTrustedTypesPolicy() then does
// nothing (src/security/trusted-types.ts), and the CSP alone keeps scripts and workers to the site's
// own files. These tests serve the page as such a browser sees it, in every browser project: no
// `trustedTypes` object, and a CSP without the two Trusted Types directives (a browser that does not
// know them ignores them). The app must still start, register its service worker, start the OCR
// worker and export a PDF, and the CSP must still refuse another site's script.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { toEditor } from './helpers.ts'

test.use({ locale: 'es-ES' })

/** The policy without its Trusted Types directives. */
const withoutTrustedTypes = (csp: string): string =>
  csp.split(';').map((d) => d.trim()).filter((d) => d !== '' && !/^(require-trusted-types-for|trusted-types)\b/.test(d)).join('; ')

/** Serves every page of the app as a browser without Trusted Types sees it. Returns the errors. */
async function asBrowserWithoutTrustedTypes (page: Page): Promise<string[]> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'trustedTypes', { value: undefined, configurable: true, writable: false })
  })
  await page.route('**/*', async (route) => {
    if (!route.request().isNavigationRequest()) { await route.fallback(); return }
    const response = await route.fetch()
    const headers = { ...response.headers() }
    // The body is replaced decoded, so the transfer headers of the original no longer apply.
    for (const h of ['content-encoding', 'content-length', 'transfer-encoding', 'etag']) Reflect.deleteProperty(headers, h)
    const header = headers['content-security-policy']
    if (header !== undefined) headers['content-security-policy'] = withoutTrustedTypes(header)
    // The <meta> policy is HTML-escaped (&#39; for each quote): unescape, strip, escape again.
    const body = (await response.text()).replace(
      /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/,
      (_m, open: string, csp: string, close: string) =>
        `${open}${withoutTrustedTypes(csp.replaceAll('&#39;', "'")).replaceAll("'", '&#39;')}${close}`)
    await route.fulfill({ response, headers, body })
  })
  const errors: string[] = []
  page.on('console', (m) => { if (/Content Security Policy|Trusted Type/i.test(m.text())) errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

test('without Trusted Types the app starts, and the CSP alone refuses another site\'s script', async ({ page }) => {
  const errors = await asBrowserWithoutTrustedTypes(page)
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
  // Checked before the probe below, whose refused script is reported as a violation on purpose.
  expect(errors).toEqual([])
  const result = await page.evaluate(async () => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? ''
    // Without Trusted Types, a plain string reaches a script element's src. script-src 'self' must
    // still stop it: the browser reports a violation and never loads the file.
    const foreignScript = await new Promise<string>((resolve) => {
      const script = document.createElement('script')
      document.addEventListener('securitypolicyviolation', (e) => {
        if (e.blockedURI.startsWith('https://example.org/')) resolve(`refused by ${e.effectiveDirective}`)
      })
      script.addEventListener('load', () => { resolve('loaded') })
      script.addEventListener('error', () => { setTimeout(() => { resolve('requested') }, 500) })
      script.src = 'https://example.org/evil.js'
      document.head.append(script)
    })
    return {
      trustedTypes: typeof (window as unknown as { trustedTypes?: unknown }).trustedTypes,
      ttInPolicy: /trusted-types/.test(meta),
      foreignScript,
    }
  })
  expect(result).toEqual({ trustedTypes: 'undefined', ttInPolicy: false, foreignScript: 'refused by script-src-elem' })
  // The app's own OCR worker still starts from a plain string (worker-src 'self').
  expect(await page.evaluate(async () => await new Promise<string>((resolve) => {
    const w = new Worker('ocr/worker.min.js')
    w.addEventListener('error', () => { resolve('error') })
    setTimeout(() => { w.terminate(); resolve('running') }, 1000)
  }))).toBe('running')
})

test('without Trusted Types the whole flow reaches the PDF', async ({ page }) => {
  const errors = await asBrowserWithoutTrustedTypes(page)
  await toEditor(page)
  await page.locator('#review').click()
  await page.locator('#review-confirm').check()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  expect(readFileSync(await download.path()).toString('latin1').startsWith('%PDF-')).toBe(true)
  expect(errors).toEqual([])
})

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('without Trusted Types the service worker registers from a plain string', async ({ page }) => {
    const errors = await asBrowserWithoutTrustedTypes(page)
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
    expect(new URL(scope).pathname).toBe('/')
    expect(errors).toEqual([])
  })
})
