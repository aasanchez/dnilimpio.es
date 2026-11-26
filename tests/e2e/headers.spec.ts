// SPDX-License-Identifier: AGPL-3.0-or-later
// HTTP security headers of the host (scripts/headers.ts, ADR 0025). `vite preview` sends the same
// headers as Cloudflare, so these tests fail if a header is dropped, loosened or drifts from the CSP.
import { expect, test } from '@playwright/test'
import { COMMON_HEADERS, HOST_WORKER_CSP, SERVICE_WORKER_CSP, pageCsp } from '../../scripts/headers.ts'

const lower = (h: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))

test('the page is served with the full CSP, frame-ancestors and the other security headers', async ({ page, request }) => {
  const res = await page.goto('/')
  const html = await (await request.get('index.html')).text()
  const h = res?.headers() ?? {}
  expect(h['content-security-policy']).toBe(pageCsp(html))
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  // The header and the <meta> policy are the same policy, apart from frame-ancestors.
  const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(h['content-security-policy']).toBe(`${meta ?? ''}; frame-ancestors 'none'`)
  expect(h).toMatchObject(lower(COMMON_HEADERS))
  expect(h['strict-transport-security']).toBe('max-age=31536000; includeSubDomains')
})

test('each worker script carries its own CSP; other files carry the common headers', async ({ request }) => {
  const worker = await request.get('ocr/worker.min.js')
  expect(worker.headers()['content-security-policy']).toBe(HOST_WORKER_CSP)
  const sw = await request.get('sw.js')
  expect(sw.headers()['content-security-policy']).toBe(SERVICE_WORKER_CSP)
  for (const r of [worker, sw, await request.get('manifest.webmanifest')]) expect(r.headers()).toMatchObject(lower(COMMON_HEADERS))
})

test('Permissions-Policy leaves the camera on and turns microphone, location and clipboard reading off', async ({ page }) => {
  await page.goto('/')
  const allowed = await page.evaluate(() => {
    const fp = (document as unknown as { featurePolicy: { allowsFeature: (f: string) => boolean } }).featurePolicy
    return Object.fromEntries(['camera', 'microphone', 'geolocation', 'clipboard-read', 'payment', 'usb'].map((f) => [f, fp.allowsFeature(f)]))
  })
  expect(allowed).toEqual({ camera: true, microphone: false, geolocation: false, 'clipboard-read': false, payment: false, usb: false })
})

test('the page is not cross-origin isolated: COEP is not set (ADR 0025)', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.headers()['cross-origin-embedder-policy']).toBeUndefined()
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(false)
})
