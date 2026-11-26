// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CSP, cspWithScriptHashes } from '../../scripts/csp.ts'
import { COMMON_HEADERS, HOST_WORKER_CSP, SERVICE_WORKER_CSP, cookiesSetBy, headersFor, hostHeaderRules, pageCsp, renderHeadersFile } from '../../scripts/headers.ts'

const MAP = '{"imports":{},"integrity":{"./assets/a.js":"sha384-x"}}'
const HTML = `<html><head><script type="importmap">${MAP}</script></head></html>`
const rules = hostHeaderRules(HTML)

describe('pageCsp', () => {
  it('is the <meta> policy of the build plus frame-ancestors', () => {
    const hash = `sha256-${createHash('sha256').update(MAP).digest('base64')}`
    expect(pageCsp(HTML)).toBe(`${cspWithScriptHashes([hash])}; frame-ancestors 'none'`)
    expect(pageCsp('<html></html>')).toBe(`${CSP}; frame-ancestors 'none'`)
  })
  it('never loosens the policy', () => {
    expect(pageCsp(HTML)).not.toMatch(/'unsafe-|\*|connect-src[^;]*'self'/)
  })
})

describe('hostHeaderRules', () => {
  it('sends the page CSP and the common headers with every file', () => {
    for (const path of ['/', '/index.html', '/assets/index-x.js', '/unknown']) {
      const h = headersFor(rules, path)
      expect(h['content-security-policy']).toBe(pageCsp(HTML))
      expect(h['strict-transport-security']).toBe(COMMON_HEADERS['Strict-Transport-Security'])
      expect(h['permissions-policy']).toMatch(/camera=\(self\)/)
      expect(h['permissions-policy']).toMatch(/microphone=\(\)/)
    }
  })
  it('gives each worker script its own CSP instead of the page\'s', () => {
    expect(headersFor(rules, '/ocr/worker.min.js')['content-security-policy']).toBe(HOST_WORKER_CSP)
    expect(headersFor(rules, '/sw.js')['content-security-policy']).toBe(SERVICE_WORKER_CSP)
    expect(headersFor(rules, '/ocr/worker.min.js')['x-content-type-options']).toBe('nosniff')
  })
  it('lets the workers load nothing from another origin, and no eval()', () => {
    for (const csp of [HOST_WORKER_CSP, SERVICE_WORKER_CSP]) {
      expect(csp).toMatch(/^default-src 'none'/)
      expect(csp).not.toMatch(/https?:|'unsafe-|\*/)
    }
  })
  it('has no preload in HSTS and no COEP (ADR 0027)', () => {
    expect(COMMON_HEADERS['Strict-Transport-Security']).not.toMatch(/preload/)
    expect(Object.keys(COMMON_HEADERS)).not.toContain('Cross-Origin-Embedder-Policy')
  })
})

describe('renderHeadersFile', () => {
  const file = renderHeadersFile(rules)
  it('writes the Cloudflare `_headers` format, within its limits', () => {
    const lines = file.trimEnd().split('\n')
    expect(lines.filter((l) => l.startsWith('/'))).toEqual(['/*', '/sw.js', '/ocr/worker.min.js'])
    expect(lines.every((l) => l.length <= 2000)).toBe(true)
    expect(lines.filter((l) => l.startsWith('/')).length).toBeLessThanOrEqual(100)
    expect(file).toContain('/sw.js\n  ! Content-Security-Policy\n  Content-Security-Policy: ')
  })
  it('detach lines remove only what an earlier rule set', () => {
    expect(headersFor([{ path: '/*', headers: { A: '1', B: '2' } }, { path: '/x', detach: ['A'], headers: { A: '3' } }], '/x')).toEqual({ a: '3', b: '2' })
    expect(headersFor([{ path: '/*', headers: { A: '1' } }, { path: '/*', headers: { A: '2' } }], '/y')).toEqual({ a: '1, 2' })
  })
})

describe('no cookies and no frames from the host', () => {
  it('no rule sets a cookie', () => {
    expect(rules.flatMap((r) => Object.keys(r.headers)).map((k) => k.toLowerCase())).not.toContain('set-cookie')
  })
  it('cookiesSetBy names every cookie a response sets, so the post-deploy check can refuse them', () => {
    expect(cookiesSetBy(new Headers({ 'content-type': 'text/html' }))).toEqual([])
    const h = new Headers()
    h.append('Set-Cookie', '__cf_bm=abc; path=/; HttpOnly; Secure')
    h.append('Set-Cookie', 'other=1')
    expect(cookiesSetBy(h)).toEqual(['__cf_bm', 'other'])
  })
  it('the page CSP allows no frame: no frame-src or child-src, so default-src none applies (ADR 0027)', () => {
    const names = CSP.split(';').map((d) => d.trim().split(/\s+/)[0])
    expect(names).toContain('default-src')
    expect(CSP).toContain("default-src 'none'")
    expect(names).not.toContain('frame-src')
    expect(names).not.toContain('child-src')
    expect(CSP).not.toMatch(/https?:/)
  })
})
