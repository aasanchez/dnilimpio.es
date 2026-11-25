// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from '@playwright/test'
import { CSP } from '../../scripts/csp.ts'

test('built page carries the exact CSP and referrer policy', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', CSP)
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
})

test('every script and stylesheet has SRI; no inline scripts or styles', async ({ page }) => {
  await page.goto('/')
  const report = await page.evaluate(() => ({
    scripts: [...document.querySelectorAll('script')].map((s) => ({ src: s.getAttribute('src'), integrity: s.integrity, inline: !s.src && s.textContent !== '' })),
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

test('Trusted Types: HTML strings are rejected and no policy can be created', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(() => {
    const tryIt = (f: () => void): string => { try { f(); return 'allowed' } catch { return 'blocked' } }
    const tt = (window as unknown as { trustedTypes?: { createPolicy: (n: string, o: object) => unknown } }).trustedTypes
    return {
      // eslint-disable-next-line no-restricted-properties -- this test checks that the browser blocks it
      innerHTML: tryIt(() => { document.createElement('div').innerHTML = '<b>x</b>' }),
      policy: tt ? tryIt(() => tt.createPolicy('probe', {})) : 'unsupported',
    }
  })
  expect(result).toEqual({ innerHTML: 'blocked', policy: 'blocked' })
})
