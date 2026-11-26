// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { WORKER_SCRIPTS, cacheName, isOnDemand, isPrecached, isSourceMap, parseManifest, route, workerCsp } from '../../src/offline/precache.ts'
import { BEACON_ENDPOINT, BEACON_SCRIPT } from '../../src/analytics/endpoints.ts'

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
  it('keeps source maps only for files of this build', () => {
    const sourceMaps = [{ path: 'assets/index-x.js.map', integrity: HASH }]
    expect(parseManifest(JSON.stringify({ ...ok, sourceMaps })).sourceMaps).toEqual(sourceMaps)
    expect(parseManifest(JSON.stringify(ok)).sourceMaps).toBeUndefined()
    for (const path of ['assets/other.js.map', 'sw.js.map', 'assets/index-x.js', '../assets/index-x.js.map', '/assets/index-x.js.map']) {
      expect(() => parseManifest(JSON.stringify({ ...ok, sourceMaps: [{ path, integrity: HASH }] }))).toThrow(/path/)
    }
    expect(() => parseManifest(JSON.stringify({ ...ok, sourceMaps: [{ path: 'assets/index-x.js.map', integrity: 'x' }] }))).toThrow(/integrity/)
    expect(() => parseManifest(JSON.stringify({ ...ok, sourceMaps: {} }))).toThrow(/source map/)
  })
  it('keeps the analytics addresses only when they are plain https URLs', () => {
    const analytics = { script: BEACON_SCRIPT, endpoint: BEACON_ENDPOINT }
    expect(parseManifest(JSON.stringify({ ...ok, analytics })).analytics).toEqual(analytics)
    expect(parseManifest(JSON.stringify(ok)).analytics).toBeUndefined()
    for (const bad of ['http://cloudflareinsights.com/cdn-cgi/rum', `${BEACON_ENDPOINT}?x=1`, `${BEACON_ENDPOINT}#x`, 'https://u:p@cloudflareinsights.com/', 'not a url', 42]) {
      expect(() => parseManifest(JSON.stringify({ ...ok, analytics: { ...analytics, endpoint: bad } }))).toThrow(/analytics/)
    }
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
  it('answers the source map of a file of this build, and no other .map', () => {
    const withMaps = { ...known, sourceMaps: new Set([`${scope}assets/a.js.map`]) }
    const to = (method: string, url: string): string => route(method, url, 'cors', scope, withMaps).kind
    expect(route('GET', `${scope}assets/a.js.map`, 'cors', scope, withMaps)).toEqual({ kind: 'source-map', url: `${scope}assets/a.js.map` })
    expect(to('GET', `${scope}assets/a.js.map#x`)).toBe('source-map')
    expect(to('GET', `${scope}assets/a.js.map?d=12345678Z`)).toBe('deny') // data in a query string
    expect(to('GET', `${scope}assets/b.js.map`)).toBe('deny') // not in the manifest
    expect(to('GET', 'https://evil.example/app/assets/a.js.map')).toBe('deny')
    expect(to('POST', `${scope}assets/a.js.map`)).toBe('deny')
    expect(get(`${scope}assets/a.js.map`)).toBe('deny') // without the manifest entry
  })
  it('lets only the analytics beacon and its report through, and only when the manifest lists them', () => {
    const withAnalytics = { ...known, analytics: { script: BEACON_SCRIPT, endpoint: BEACON_ENDPOINT } }
    const to = (method: string, url: string): string => route(method, url, 'cors', scope, withAnalytics).kind
    expect(to('GET', BEACON_SCRIPT)).toBe('analytics')
    expect(to('POST', BEACON_ENDPOINT)).toBe('analytics')
    expect(to('POST', `${BEACON_ENDPOINT}?v=1`)).toBe('analytics')
    expect(to('GET', `${BEACON_SCRIPT}?d=12345678Z`)).toBe('deny') // data in the script's query string
    expect(to('POST', BEACON_SCRIPT)).toBe('deny')
    expect(to('PUT', BEACON_ENDPOINT)).toBe('deny')
    expect(to('GET', 'https://static.cloudflareinsights.com/other.js')).toBe('deny')
    expect(to('POST', 'https://cloudflareinsights.com/other')).toBe('deny')
    expect(to('POST', 'https://cloudflareinsights.com.evil.example/cdn-cgi/rum')).toBe('deny')
    // Without the manifest entry, the worker refuses them like any other origin.
    expect(get(BEACON_SCRIPT)).toBe('deny')
    expect(route('POST', BEACON_ENDPOINT, 'cors', scope, known).kind).toBe('deny')
  })
})

it('names caches by build version', () => {
  expect(cacheName('0123456789abcdef')).toBe('dnilimpio-0123456789abcdef')
})

describe('isSourceMap', () => {
  it('matches .map files, not the worker map or dotfiles', () => {
    expect(isSourceMap('assets/index-x.js.map')).toBe(true)
    expect(isSourceMap('ocr/worker.min.js.map')).toBe(true)
    expect(isSourceMap('assets/index-x.js')).toBe(false)
    expect(isSourceMap('sw.js.map')).toBe(false)
    expect(isSourceMap('.x.map')).toBe(false)
  })
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
  it('lets the OCR worker load and read its own folder only, with no eval()', () => {
    const csp = workerCsp('https://example.org/app/')
    expect(csp).toBe("default-src 'none'; script-src https://example.org/app/ocr/ 'wasm-unsafe-eval'; connect-src https://example.org/app/ocr/")
    for (const bad of ["'unsafe-eval'", "'self'", '*', 'blob:', 'data:']) expect(csp).not.toContain(bad)
  })
  it('applies to the OCR worker script, an on-demand file', () => {
    expect(WORKER_SCRIPTS).toEqual(['ocr/worker.min.js'])
    expect(WORKER_SCRIPTS.every(isOnDemand)).toBe(true)
  })
})
