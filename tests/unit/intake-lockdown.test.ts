// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { buildScripts, exactSource, intakePolicy } from '../../src/security/intake-lockdown.ts'
import { isVerifiedWorker, type WorkerLike } from '../../src/offline/verify.ts'

const BASE = 'https://dnitapado.es/'
const SUB = 'https://aasanchez.github.io/dnilimpio.es/'

describe('exactSource', () => {
  it('turns a relative build file into an absolute address, at the root and under a subpath', () => {
    expect(exactSource('./assets/index-ab_C-1.js', BASE)).toBe('https://dnitapado.es/assets/index-ab_C-1.js')
    expect(exactSource('./assets/ml/model-x.js', SUB)).toBe('https://aasanchez.github.io/dnilimpio.es/assets/ml/model-x.js')
  })
  it('refuses anything that is not a plain file address', () => {
    for (const bad of ['./a.js?x=1', './a.js#x', 'blob:https://dnitapado.es/1', 'data:text/javascript,1', 'https://u:p@dnitapado.es/a.js', './a b.js', "./a';.js", 'javascript:1']) {
      expect(exactSource(bad, BASE), bad).toBeNull()
    }
  })
})

describe('buildScripts', () => {
  it('lists the page scripts and every module of the import map, and skips the rest', () => {
    const map = JSON.stringify({ imports: {}, integrity: { './assets/a.js': 'sha384-x', './assets/ml/b.mjs': 'sha384-y', './assets/c.js?q': 'sha384-z' } })
    expect(buildScripts(BASE, ['./assets/index.js', 'https://static.example/x.js?q=1'], map)).toEqual([
      'https://dnitapado.es/assets/index.js',
      'https://dnitapado.es/assets/a.js',
      'https://dnitapado.es/assets/ml/b.mjs',
    ])
  })
  it('never lists another site\'s script (such as the analytics beacon) or a file outside the app\'s folder', () => {
    const srcs = ['https://static.cloudflareinsights.com/beacon.min.js', 'https://aasanchez.github.io/other/x.js', './assets/index.js']
    expect(buildScripts(SUB, srcs, null)).toEqual(['https://aasanchez.github.io/dnilimpio.es/assets/index.js'])
  })
  it('survives a missing or broken import map', () => {
    expect(buildScripts(BASE, ['./assets/index.js'], null)).toEqual(['https://dnitapado.es/assets/index.js'])
    expect(buildScripts(BASE, [], '{')).toEqual([])
  })
})

describe('intakePolicy', () => {
  const parse = (p: string): Record<string, string[]> => Object.fromEntries(p.split('; ').map((d) => { const [k, ...v] = d.split(' '); return [k ?? '', v] }))

  it('allows no connection, no font, no stylesheet, no manifest, and images only from memory', () => {
    const d = parse(intakePolicy({ scripts: ['https://dnitapado.es/assets/a.js'], workers: ['https://dnitapado.es/ocr/worker.min.js'] }))
    expect(d).toEqual({
      'default-src': ["'none'"],
      'img-src': ['blob:', 'data:'],
      'font-src': ["'none'"],
      'style-src': ["'none'"],
      'manifest-src': ["'none'"],
      'connect-src': ["'none'"],
      'script-src': ['https://dnitapado.es/assets/a.js', "'wasm-unsafe-eval'"],
      'worker-src': ['https://dnitapado.es/ocr/worker.min.js'],
    })
  })
  it('never names an origin, \'self\' or the analytics beacon, and lists each file once', () => {
    const p = intakePolicy({ scripts: ['https://dnitapado.es/a.js', 'https://dnitapado.es/a.js'], workers: [] })
    expect(p).not.toMatch(/'self'|cloudflare|\*/)
    expect(parse(p)['script-src']).toEqual(['https://dnitapado.es/a.js', "'wasm-unsafe-eval'"])
    expect(parse(p)['worker-src']).toEqual(["'none'"])
    expect(parse(intakePolicy({ scripts: [], workers: [] }))['script-src']).toEqual(["'none'", "'wasm-unsafe-eval'"])
  })
})

describe('isVerifiedWorker', () => {
  const worker = (scriptURL: string, reply: unknown): WorkerLike => ({
    scriptURL,
    postMessage: (_m, [port]) => { if (reply !== undefined) (port as MessagePort).postMessage(reply) },
  })
  it('accepts this site\'s sw.js when it answers the status message', async () => {
    expect(await isVerifiedWorker(worker(`${SUB}sw.js`, { ok: true, cached: true }), SUB)).toBe(true)
  })
  it('refuses no worker, another script, a wrong answer or silence', async () => {
    expect(await isVerifiedWorker(null, SUB)).toBe(false)
    expect(await isVerifiedWorker(worker('https://evil.example/sw.js', { ok: true }), SUB)).toBe(false)
    expect(await isVerifiedWorker(worker(`${SUB}sw.js`, { ok: false }), SUB)).toBe(false)
    expect(await isVerifiedWorker(worker(`${SUB}sw.js`, undefined), SUB, 50)).toBe(false)
  })
})
