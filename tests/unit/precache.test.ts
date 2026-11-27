// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { PAGE_HEADERS, SECURITY_HEADERS, WORKER_SCRIPTS, addPageHeaders, cacheName, isOnDemand, isPrecached, parseManifest, route, sriOf, workerCsp } from '../../src/offline/precache.ts'

const HASH = `sha384-${'A'.repeat(64)}`
const ok = { version: '0123456789abcdef', files: [{ path: 'index.html', integrity: HASH }, { path: 'assets/index-x.js', integrity: HASH }], onDemand: [{ path: 'ocr/ppocrv6-tiny-rec.onnx', integrity: HASH }] }

describe('isPrecached', () => {
  it('keeps app files and leaves out source maps, the worker and dotfiles', () => {
    expect(isPrecached('index.html')).toBe(true)
    expect(isPrecached('assets/index-x.js')).toBe(true)
    expect(isPrecached('assets/index-x.js.map')).toBe(false)
    expect(isPrecached('sw.js')).toBe(false)
    expect(isPrecached('.nojekyll')).toBe(false)
  })
})

describe('parseManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(parseManifest(JSON.stringify(ok))).toEqual(ok)
  })
  it('keeps OCR files on demand and nothing else', () => {
    expect(() => parseManifest(JSON.stringify({ ...ok, files: [...ok.files, { path: 'ocr/x.js', integrity: HASH }] }))).toThrow(/path/)
    expect(() => parseManifest(JSON.stringify({ ...ok, files: [...ok.files, { path: 'assets/ml/model-x.js', integrity: HASH }] }))).toThrow(/path/)
    expect(parseManifest(JSON.stringify({ ...ok, onDemand: [{ path: 'assets/ml/model-x.js', integrity: HASH }] })).onDemand).toHaveLength(1)
    expect(() => parseManifest(JSON.stringify({ ...ok, onDemand: [{ path: 'assets/x.js', integrity: HASH }] }))).toThrow(/path/)
    expect(parseManifest(JSON.stringify({ version: ok.version, files: ok.files })).onDemand).toEqual([])
  })
  it('rejects the unreplaced placeholder, empty lists, bad paths and bad hashes', () => {
    expect(() => parseManifest('__DNI_PRECACHE_MANIFEST__')).toThrow()
    expect(() => parseManifest(JSON.stringify({ ...ok, files: [] }))).toThrow(/Empty/)
    expect(() => parseManifest(JSON.stringify({ ...ok, version: 'x' }))).toThrow(/version/)
    for (const path of ['/index.html', '../secret', 'sw.js', 'a.js.map']) {
      expect(() => parseManifest(JSON.stringify({ ...ok, files: [{ path, integrity: HASH }] }))).toThrow(/path/)
    }
    expect(() => parseManifest(JSON.stringify({ ...ok, files: [{ path: 'index.html', integrity: 'sha256-abc' }] }))).toThrow(/integrity/)
  })
  it('never lists a source map, in either list (ADR 0022)', () => {
    for (const path of ['assets/index-x.js.map', 'ocr/worker.min.js.map', 'assets/ml/model-x.js.map']) {
      expect(() => parseManifest(JSON.stringify({ ...ok, files: [...ok.files, { path, integrity: HASH }] }))).toThrow(/path/)
      expect(() => parseManifest(JSON.stringify({ ...ok, onDemand: [{ path, integrity: HASH }] }))).toThrow(/path/)
    }
    // A key left over from the ADR 0016 manifest is ignored, never served.
    expect(parseManifest(JSON.stringify({ ...ok, sourceMaps: [{ path: 'assets/index-x.js.map', integrity: HASH }] }))).toEqual(ok)
  })
  it('ignores an analytics entry left over from the ADR 0015 manifest (ADR 0023)', () => {
    const analytics = { script: 'https://static.cloudflareinsights.com/beacon.min.js', endpoint: 'https://cloudflareinsights.com/cdn-cgi/rum' }
    expect(parseManifest(JSON.stringify({ ...ok, analytics }))).toEqual(ok)
  })
})

describe('route (deny by default)', () => {
  const scope = 'https://example.org/app/'
  const known = {
    files: new Set([`${scope}index.html`, `${scope}assets/a.js`]),
    onDemand: new Set([`${scope}ocr/ppocrv6-tiny-rec.onnx`]),
  }
  const get = (url: string, mode = 'no-cors'): string => route('GET', url, mode, scope, known).kind

  it('answers the files of the build, from the cache or on first use', () => {
    expect(route('GET', `${scope}assets/a.js`, 'cors', scope, known)).toEqual({ kind: 'file', url: `${scope}assets/a.js` })
    expect(route('GET', `${scope}ocr/ppocrv6-tiny-rec.onnx`, 'same-origin', scope, known)).toEqual({ kind: 'on-demand', url: `${scope}ocr/ppocrv6-tiny-rec.onnx` })
    expect(get(`${scope}assets/a.js#x`)).toBe('file')
  })
  it('answers every page load inside the scope with index.html', () => {
    for (const url of [scope, `${scope}?lang=es`, `${scope}anything`]) expect(get(url, 'navigate')).toBe('index')
  })
  it('refuses everything else', () => {
    expect(get(`${scope}assets/b.js`)).toBe('deny') // not in the manifest
    expect(get(`${scope}assets/a.js?d=12345678Z`)).toBe('deny') // data in a query string
    expect(get(`${scope}x.png?d=secret`)).toBe('deny')
    expect(get(`${scope}sw.js.map`)).toBe('deny')
    expect(get('https://example.org/other/a.js')).toBe('deny') // same origin, outside the scope
    expect(get('https://evil.example/app/assets/a.js')).toBe('deny') // another origin
    expect(get('https://evil.example/', 'navigate')).toBe('deny')
    for (const method of ['POST', 'PUT', 'HEAD', 'DELETE']) expect(route(method, `${scope}assets/a.js`, 'cors', scope, known).kind).toBe('deny')
  })
  it('refuses source maps, even of a file of this build (ADR 0022)', () => {
    for (const mode of ['cors', 'no-cors', 'same-origin']) expect(get(`${scope}assets/a.js.map`, mode)).toBe('deny')
    expect(get(`${scope}ocr/ppocrv6-tiny-rec.onnx.map`)).toBe('deny')
  })
  it('lets nothing through to a third party, Cloudflare included (ADR 0023)', () => {
    for (const [method, url] of [
      ['GET', 'https://static.cloudflareinsights.com/beacon.min.js'],
      ['POST', 'https://cloudflareinsights.com/cdn-cgi/rum'],
      ['GET', 'https://cloudflareinsights.com/cdn-cgi/rum?d=12345678Z'],
    ] as const) {
      for (const mode of ['cors', 'no-cors']) expect(route(method, url, mode, scope, known).kind).toBe('deny')
    }
  })
})

it('names caches by build version', () => {
  expect(cacheName('0123456789abcdef')).toBe('dnilimpio-0123456789abcdef')
})

describe('isOnDemand', () => {
  it('covers the OCR files and the corner model, not the app', () => {
    expect(isOnDemand('ocr/ppocrv6-tiny-rec.onnx')).toBe(true)
    expect(isOnDemand('assets/ml/model-x.js')).toBe(true)
    expect(isOnDemand('assets/ml/ort-wasm-simd-threaded-x.mjs')).toBe(true)
    expect(isOnDemand('assets/index-x.js')).toBe(false)
  })
})

describe('workerCsp', () => {
  it('lets the OCR worker load and read its own folder only, plus sw.js for Firefox (ADR 0037), with no eval()', () => {
    const csp = workerCsp('https://example.org/app/')
    expect(csp).toBe("default-src 'none'; script-src https://example.org/app/ocr/ https://example.org/app/sw.js 'wasm-unsafe-eval'; connect-src https://example.org/app/ocr/ https://example.org/app/sw.js")
    for (const bad of ["'unsafe-eval'", "'self'", '*', 'blob:', 'data:']) expect(csp).not.toContain(bad)
  })
  it('applies to the OCR worker script, an on-demand file', () => {
    expect(WORKER_SCRIPTS).toEqual(['ocr/worker.min.js'])
    expect(WORKER_SCRIPTS.every(isOnDemand)).toBe(true)
  })
})

describe('sriOf', () => {
  const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer
  const sri = (text: string): string => `sha384-${createHash('sha384').update(text).digest('base64')}`

  it('gives the SRI string the manifest records (SHA-384, base64)', async () => {
    expect(await sriOf(bytes('<!doctype html>'))).toBe(sri('<!doctype html>'))
    expect(await sriOf(bytes(''))).toBe(sri(''))
  })

  it('changes when one byte of a cached file is rewritten', async () => {
    expect(await sriOf(bytes('self.onmessage = run'))).not.toBe(await sriOf(bytes('self.onmessage = rum')))
  })
})

describe('addPageHeaders', () => {
  it('adds frame-ancestors as one more policy, never in place of the host CSP (ADR 0027)', () => {
    const host = new Headers({ 'Content-Security-Policy': "default-src 'none'", 'X-Frame-Options': 'SAMEORIGIN' })
    const h = addPageHeaders(host)
    expect(h.get('content-security-policy')).toBe("default-src 'none', frame-ancestors 'none'")
    expect(h.get('x-frame-options')).toBe('DENY')
    expect(h.get('referrer-policy')).toBe('no-referrer')
    expect(host.get('content-security-policy')).toBe("default-src 'none'") // the cached copy is untouched
  })
  it('sets every security header itself, so a cached entry needs none (ADR 0026)', () => {
    expect(Object.keys(PAGE_HEADERS)).toEqual(['Content-Security-Policy', ...Object.keys(SECURITY_HEADERS)])
    expect(PAGE_HEADERS['Permissions-Policy']).toMatch(/camera=\(self\)/)
    expect(PAGE_HEADERS['Permissions-Policy']).toMatch(/microphone=\(\)/)
    expect(PAGE_HEADERS['Cross-Origin-Opener-Policy']).toBe('same-origin')
  })
  it('on a response without headers sends exactly PAGE_HEADERS', () => {
    expect(Object.fromEntries(addPageHeaders(new Headers()))).toEqual(Object.fromEntries(Object.entries(PAGE_HEADERS).map(([k, v]) => [k.toLowerCase(), v])))
  })
})
