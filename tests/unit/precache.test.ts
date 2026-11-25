// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { cacheName, isAppRequest, isLazy, isPrecached, parseManifest } from '../../src/offline/precache.ts'

const HASH = `sha384-${'A'.repeat(64)}`
const ok = {
  version: '0123456789abcdef',
  files: [{ path: 'index.html', integrity: HASH }, { path: 'assets/index-x.js', integrity: HASH }],
  lazy: [{ path: 'assets/ml/model-x.js', integrity: HASH }],
}

describe('isPrecached', () => {
  it('keeps app files and leaves out source maps, the worker and dotfiles', () => {
    expect(isPrecached('index.html')).toBe(true)
    expect(isPrecached('assets/index-x.js')).toBe(true)
    expect(isPrecached('assets/index-x.js.map')).toBe(false)
    expect(isPrecached('sw.js')).toBe(false)
    expect(isPrecached('.nojekyll')).toBe(false)
  })
  it('leaves the optional model files for first use', () => {
    expect(isPrecached('assets/ml/model-x.js')).toBe(false)
    expect(isLazy('assets/ml/model-x.js')).toBe(true)
    expect(isLazy('assets/ml/ort-x.mjs')).toBe(true)
    expect(isLazy('assets/ml/model-x.js.map')).toBe(false)
    expect(isLazy('assets/index-x.js')).toBe(false)
  })
})

describe('parseManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(parseManifest(JSON.stringify(ok))).toEqual(ok)
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
  it('keeps model files out of the install list and app files out of the lazy list', () => {
    expect(parseManifest(JSON.stringify({ ...ok, lazy: [] })).lazy).toEqual([])
    expect(() => parseManifest(JSON.stringify({ version: ok.version, files: ok.files }))).toThrow(/lazy/)
    expect(() => parseManifest(JSON.stringify({ ...ok, files: [...ok.files, ...ok.lazy] }))).toThrow(/path/)
    expect(() => parseManifest(JSON.stringify({ ...ok, lazy: ok.files }))).toThrow(/path/)
    expect(() => parseManifest(JSON.stringify({ ...ok, lazy: [{ path: 'assets/ml/../../x.js', integrity: HASH }] }))).toThrow(/path/)
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
