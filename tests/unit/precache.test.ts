// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { cacheName, isOnDemand, isPrecached, parseManifest, route } from '../../src/offline/precache.ts'

const HASH = `sha384-${'A'.repeat(64)}`
const ok = { version: '0123456789abcdef', files: [{ path: 'index.html', integrity: HASH }, { path: 'assets/index-x.js', integrity: HASH }], onDemand: [{ path: 'ocr/spa.traineddata', integrity: HASH }] }

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
})

describe('route (deny by default)', () => {
  const scope = 'https://example.org/app/'
  const known = {
    files: new Set([`${scope}index.html`, `${scope}assets/a.js`]),
    onDemand: new Set([`${scope}ocr/spa.traineddata`]),
  }
  const get = (url: string, mode = 'no-cors'): string => route('GET', url, mode, scope, known).kind

  it('answers the files of the build, from the cache or on first use', () => {
    expect(route('GET', `${scope}assets/a.js`, 'cors', scope, known)).toEqual({ kind: 'file', url: `${scope}assets/a.js` })
    expect(route('GET', `${scope}ocr/spa.traineddata`, 'same-origin', scope, known)).toEqual({ kind: 'on-demand', url: `${scope}ocr/spa.traineddata` })
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
})

it('names caches by build version', () => {
  expect(cacheName('0123456789abcdef')).toBe('dnilimpio-0123456789abcdef')
})

describe('isOnDemand', () => {
  it('covers the OCR files and the corner model, not the app', () => {
    expect(isOnDemand('ocr/spa.traineddata')).toBe(true)
    expect(isOnDemand('assets/ml/model-x.js')).toBe(true)
    expect(isOnDemand('assets/ml/ort-wasm-simd-threaded-x.mjs')).toBe(true)
    expect(isOnDemand('assets/index-x.js')).toBe(false)
  })
})
