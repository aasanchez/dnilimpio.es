// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { cspWithScriptHashes } from '../../scripts/csp.ts'
import { toEditor } from './helpers.ts'

/** The inline import map's text, or null. It is the only inline script the CSP allows (by hash). */
const importMapText = async (page: Page): Promise<string | null> =>
  await page.locator('script[type="importmap"]').evaluate((s) => s.textContent).catch(() => null)

const sha = (alg: 'sha256' | 'sha384', data: string | Buffer): string => `${alg}-${createHash(alg).update(data).digest('base64')}`

test('built page carries the exact CSP and referrer policy', async ({ page }) => {
  await page.goto('/')
  const map = await importMapText(page)
  const expected = cspWithScriptHashes(map === null ? [] : [sha('sha256', map)])
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', expected)
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
})

test('every script and stylesheet has SRI; no inline scripts or styles', async ({ page }) => {
  await page.goto('/')
  const report = await page.evaluate(() => ({
    scripts: [...document.querySelectorAll<HTMLScriptElement>('script:not([type="importmap"])')].map((s) => ({ src: s.getAttribute('src'), integrity: s.integrity, inline: !s.src && s.textContent !== '' })),
    styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => (l as HTMLLinkElement).integrity),
    inlineStyles: document.querySelectorAll('style, [style]').length,
  }))
  expect(report.scripts.length).toBeGreaterThan(0)
  for (const s of report.scripts) {
    expect(s.inline).toBe(false)
    expect(s.integrity).toMatch(/^sha384-/)
  }
  for (const integrity of report.styles) expect(integrity).toMatch(/^sha384-/)
  expect(report.inlineStyles).toBe(0)
})

test('app renders with no CSP violations and no requests outside its origin', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin
  const foreign: string[] = []
  const violations: string[] = []
  page.on('request', (r) => { if (new URL(r.url()).origin !== origin && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) foreign.push(r.url()) })
  page.on('console', (m) => { if (/Content Security Policy|Trusted Type/i.test(m.text())) violations.push(m.text()) })
  page.on('pageerror', (e) => violations.push(e.message))
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
  expect(foreign).toEqual([])
  expect(violations).toEqual([])
})

test('Trusted Types: HTML strings are rejected and no other policy can be created', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(() => {
    const tryIt = (f: () => void): string => { try { f(); return 'allowed' } catch { return 'blocked' } }
    const tt = (window as unknown as { trustedTypes?: { createPolicy: (n: string, o: object) => unknown } }).trustedTypes
    return {
      // eslint-disable-next-line no-restricted-properties -- this test checks that the browser blocks it
      innerHTML: tryIt(() => { document.createElement('div').innerHTML = '<b>x</b>' }),
      policy: tt ? tryIt(() => tt.createPolicy('probe', {})) : 'unsupported',
      // The app already created the only allowed policy; a second copy is refused.
      defaultPolicy: tt ? tryIt(() => tt.createPolicy('default', {})) : 'unsupported',
      // The default policy refuses any script URL other than the two the app needs.
      foreignWorker: tryIt(() => { new Worker('https://example.org/evil.js').terminate() }),
      ownWorkerUrl: tryIt(() => { new Worker('ocr/worker.min.js').terminate() }),
    }
  })
  expect(result).toEqual({ innerHTML: 'blocked', policy: 'blocked', defaultPolicy: 'blocked', foreignWorker: 'blocked', ownWorkerUrl: 'allowed' })
})

test('chunks loaded on demand are listed in the import map with a matching hash', async ({ page, request }) => {
  await page.goto('/')
  const map = await importMapText(page)
  expect(map).not.toBeNull()
  const integrity = (JSON.parse(map ?? '{}') as { integrity?: Record<string, string> }).integrity ?? {}
  const entries = Object.entries(integrity)
  expect(entries.length).toBeGreaterThan(0)
  for (const [path, hash] of entries) {
    const body = await (await request.get(path)).body()
    expect(hash).toBe(sha('sha384', body))
  }
})

test.describe('tampering', () => {
  test.use({ locale: 'es-ES' })

  test('a tampered PDF chunk is refused by the browser and the export fails safely', async ({ page }) => {
    await page.route('**/assets/export-*.js', async (route) => {
      const res = await route.fetch()
      await route.fulfill({ response: res, body: (await res.text()) + '\n// tampered' })
    })
    await toEditor(page)
    await page.locator('#review').click()
    await page.locator('#review-confirm').check()
    let downloaded = false
    page.on('download', () => { downloaded = true })
    await page.locator('#download').click()
    await expect(page.locator('#download-status')).toHaveAttribute('role', 'alert')
    expect(downloaded).toBe(false)
  })
})
