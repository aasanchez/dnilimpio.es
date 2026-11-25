// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { cacheName, isAppRequest, isOnDemand, isPrecached, parseManifest } from '../../src/offline/precache.ts'

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

describe('isAppRequest', () => {
  const scope = 'https://example.org/app/'
  it('handles GET requests inside the scope only', () => {
    expect(isAppRequest('GET', 'https://example.org/app/assets/a.js', scope)).toBe(true)
    expect(isAppRequest('POST', 'https://example.org/app/', scope)).toBe(false)
    expect(isAppRequest('GET', 'https://example.org/other/', scope)).toBe(false)
    expect(isAppRequest('GET', 'https://evil.example/app/', scope)).toBe(false)
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
