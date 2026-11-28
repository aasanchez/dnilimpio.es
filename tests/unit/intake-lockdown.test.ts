// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOCKDOWN_ATTR, buildScripts, exactSource, intakePolicy, isLocked, loadAllFonts, lockIntake, policyFor,
} from '../../src/security/intake-lockdown.ts'
import { isVerifiedWorker, type WorkerLike } from '../../src/offline/verify.ts'

const BASE = 'https://dnitapado.es/'
const SUB = 'https://aasanchez.github.io/dnitapado.es/'

describe('exactSource', () => {
  it('turns a relative build file into an absolute address, at the root and under a subpath', () => {
    expect(exactSource('./assets/index-ab_C-1.js', BASE)).toBe('https://dnitapado.es/assets/index-ab_C-1.js')
    expect(exactSource('./assets/ml/model-x.js', SUB)).toBe('https://aasanchez.github.io/dnitapado.es/assets/ml/model-x.js')
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
    expect(buildScripts(SUB, srcs, null)).toEqual(['https://aasanchez.github.io/dnitapado.es/assets/index.js'])
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
      'frame-src': ["'none'"],
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

/** A <meta> element as lockIntake builds it. */
interface FakeMeta { httpEquiv: string; content: string; attrs: Set<string>; setAttribute: (n: string) => void }

/** The parts of a page the lockdown reads and writes, without a DOM. */
interface PageParts { base?: string; scripts?: string[]; preloads?: string[]; importMap?: string | null; fonts?: unknown }
function page ({ base = SUB, scripts = [], preloads = [], importMap = null, fonts }: PageParts = {}): Document & { metas: FakeMeta[] } {
  const metas: FakeMeta[] = []
  const attr = (v: string): { getAttribute: () => string } => ({ getAttribute: () => v })
  const doc = {
    baseURI: base,
    fonts,
    metas,
    head: {
      querySelector: (sel: string) => (sel === `meta[${LOCKDOWN_ATTR}]` ? metas.find((m) => m.attrs.has(LOCKDOWN_ATTR)) ?? null : null),
      append: (m: FakeMeta) => { metas.push(m) },
    },
    querySelectorAll: (sel: string) => (sel === 'script[src]' ? scripts.map(attr) : sel === 'link[rel="modulepreload"]' ? preloads.map(attr) : []),
    querySelector: (sel: string) => (sel === 'script[type="importmap"]' && importMap !== null ? { textContent: importMap } : null),
    createElement: (): FakeMeta => {
      const m: FakeMeta = { httpEquiv: '', content: '', attrs: new Set(), setAttribute: (n) => { m.attrs.add(n) } }
      return m
    },
  }
  return doc as unknown as Document & { metas: FakeMeta[] }
}

describe('policyFor', () => {
  it('lists the page\'s scripts, preloads, import map modules, sw.js (ADR 0037) and the two workers, by exact address', () => {
    const doc = page({
      scripts: ['./assets/index-1.js', 'https://static.cloudflareinsights.com/beacon.min.js'],
      preloads: ['./assets/chunk-2.js'],
      importMap: JSON.stringify({ imports: {}, integrity: { './assets/ocr-3.js': 'sha384-x' } }),
    })
    const p = Object.fromEntries(policyFor(doc).split('; ').map((d) => { const [k, ...v] = d.split(' '); return [k ?? '', v] }))
    expect(p['script-src']).toEqual([`${SUB}assets/index-1.js`, `${SUB}assets/chunk-2.js`, `${SUB}assets/ocr-3.js`, `${SUB}sw.js`, "'wasm-unsafe-eval'"])
    expect(p['worker-src']).toEqual([`${SUB}sw.js`, `${SUB}ocr/worker.min.js`])
    expect(p['connect-src']).toEqual(["'none'"])
  })
})

describe('lockIntake', () => {
  it('adds the intake policy as a marked <meta> once, and never takes it away', () => {
    const doc = page({ scripts: ['./assets/index-1.js'] })
    expect(isLocked(doc)).toBe(false)
    lockIntake(doc)
    lockIntake(doc)
    expect(isLocked(doc)).toBe(true)
    expect(doc.metas).toHaveLength(1)
    expect(doc.metas[0]?.httpEquiv).toBe('Content-Security-Policy')
    expect(doc.metas[0]?.content).toBe(policyFor(doc))
  })
})

describe('loadAllFonts', () => {
  afterEach(() => { vi.useRealTimers() })

  it('loads every font face, and a face that fails does not stop the others', async () => {
    const loaded: string[] = []
    const face = (name: string, ok = true): { load: () => Promise<void> } => ({
      load: () => {
        if (!ok) return Promise.reject(new Error('404'))
        loaded.push(name)
        return Promise.resolve()
      },
    })
    await loadAllFonts(page({ fonts: [face('a'), face('b', false), face('c')] }))
    expect(loaded).toEqual(['a', 'c'])
  })

  it('waits at most the time limit for a face that never loads', async () => {
    vi.useFakeTimers()
    let done = false
    void loadAllFonts(page({ fonts: [{ load: async () => await new Promise(() => undefined) }] }), 3000).then(() => { done = true })
    await vi.advanceTimersByTimeAsync(2999)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
  })

  it('does nothing in a browser without the font loading API', async () => {
    await expect(loadAllFonts(page())).resolves.toBeUndefined()
  })
})

describe('prepareIntake', () => {
  it('locks the page even when the fonts cannot be listed, and prepares it once', async () => {
    vi.resetModules()
    const { prepareIntake } = await import('../../src/security/intake-lockdown.ts')
    const broken = { [Symbol.iterator]: () => { throw new Error('no fonts') } }
    const doc = page({ fonts: broken })
    await prepareIntake(doc)
    expect(isLocked(doc)).toBe(true)
    const other = page()
    await prepareIntake(other)
    // Once per page load: the first call did the work.
    expect(isLocked(other)).toBe(false)
  })
})
