// SPDX-License-Identifier: AGPL-3.0-or-later
// The page side of OCR (src/ocr/ocr.ts) with a fake service worker, a fake OCR worker and fake
// canvases: when OCR is offered, the time limits on the service worker's answers (ask.ts), the
// "ready" answer kept per service worker (ADR 0033), the job queue and stopOcr().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AskMessage, AskReply } from '../../src/ocr/ask.ts'
import type { Request, WireLine } from '../../src/ocr/protocol.ts'

const ask = vi.hoisted(() => ({ askWorker: vi.fn() }))
vi.mock('../../src/ocr/ask.ts', async (original) => ({ ...await original<typeof import('../../src/ocr/ask.ts')>(), askWorker: ask.askWorker }))

const { AskTimeout } = await import('../../src/ocr/ask.ts')

/** The OCR worker: answers each 'read' with `FakeWorker.answer`, unless `hold` keeps it waiting. */
class FakeWorker extends EventTarget {
  static made: FakeWorker[] = []
  static answer: (req: Request) => WireLine[] | 'error' = () => []
  readonly url: string
  received: Array<{ msg: Request; transfer: Transferable[] }> = []
  terminated = false
  hold = false
  constructor (url: string) {
    super()
    this.url = url
    FakeWorker.made.push(this)
  }

  postMessage (msg: Request, transfer: Transferable[]): void {
    this.received.push({ msg, transfer })
    if (!this.hold) this.reply(msg)
  }

  reply (msg: Request): void {
    queueMicrotask(() => {
      const lines = FakeWorker.answer(msg)
      if (lines === 'error') this.dispatchEvent(new Event('error'))
      else this.dispatchEvent(new MessageEvent('message', { data: { type: 'lines', id: msg.id, lines } }))
    })
  }

  terminate (): void { this.terminated = true }
}

/** The page's service worker container: `controller` can be swapped like an update does. */
class FakeContainer extends EventTarget {
  controller: object | null = { name: 'sw-1' }
  take (next: object): void {
    this.controller = next
    this.dispatchEvent(new Event('controllerchange'))
  }
}

/** A canvas with `w` × `h` pixels. */
const canvas = (w = 40, h = 20): HTMLCanvasElement => ({
  width: w,
  height: h,
  getContext: () => ({ getImageData: (_x: number, _y: number, cw: number, ch: number) => ({ width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4) }) }),
}) as unknown as HTMLCanvasElement

const line = (text: string, confidence = 0.9, x = 0, y = 0, w = 40, h = 10): WireLine => ({ text, confidence, x, y, w, h })

let sw: FakeContainer
let nav: { serviceWorker: FakeContainer; onLine: boolean }
/** What the service worker answers to 'status' (files cached?) and to 'prepare'. */
let cached: boolean
let prepared: AskReply | Error
let mod: typeof import('../../src/ocr/ocr.ts')
let ran: typeof import('../../src/ocr/ran.ts')

const asked = (type: AskMessage['type']): number => ask.askWorker.mock.calls.filter((c) => (c[1] as AskMessage).type === type).length

beforeEach(async () => {
  FakeWorker.made = []
  FakeWorker.answer = () => []
  sw = new FakeContainer()
  nav = { serviceWorker: sw, onLine: true }
  cached = true
  prepared = { ok: true }
  vi.stubGlobal('navigator', nav)
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('document', { baseURI: 'https://example.test/app/' })
  ask.askWorker.mockImplementation((_target: unknown, msg: AskMessage): Promise<AskReply> => {
    if (msg.type === 'status') return Promise.resolve({ ok: true, cached })
    return prepared instanceof Error ? Promise.reject(prepared) : Promise.resolve(prepared)
  })
  vi.resetModules()
  mod = await import('../../src/ocr/ocr.ts')
  ran = await import('../../src/ocr/ran.ts')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('ocrStatus', () => {
  it('is unavailable without workers or WebAssembly', async () => {
    vi.stubGlobal('Worker', undefined)
    expect(await mod.ocrStatus()).toEqual({ state: 'unavailable', reason: 'unsupported' })
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('WebAssembly', undefined)
    expect(await mod.ocrStatus()).toEqual({ state: 'unavailable', reason: 'unsupported' })
    expect(ask.askWorker).not.toHaveBeenCalled()
  })

  it('is unavailable when no service worker controls the page, which checks the files', async () => {
    sw.controller = null
    expect(await mod.ocrStatus()).toEqual({ state: 'unavailable', reason: 'no-service-worker' })
    vi.stubGlobal('navigator', { onLine: true })
    expect(await mod.ocrStatus()).toEqual({ state: 'unavailable', reason: 'no-service-worker' })
  })

  it('asks the controlling service worker about the worker and every model file', async () => {
    expect(await mod.ocrStatus()).toEqual({ state: 'ready' })
    const [target, msg] = ask.askWorker.mock.calls[0] as [unknown, AskMessage]
    expect(target).toBe(sw.controller)
    expect(msg.type).toBe('status')
    expect(msg.paths).toContain('ocr/worker.min.js')
    expect(msg.paths.length).toBeGreaterThan(1)
    expect(msg.paths.every((p) => p.startsWith('ocr/'))).toBe(true)
  })

  it('offers the download online, and is unavailable offline, when the files are not cached', async () => {
    cached = false
    expect(await mod.ocrStatus()).toEqual({ state: 'download', megabytes: mod.OCR_DOWNLOAD_MB })
    nav.onLine = false
    expect(await mod.ocrStatus()).toEqual({ state: 'unavailable', reason: 'offline' })
    // "Not cached" is never kept: each question asks again.
    expect(asked('status')).toBe(2)
  })

  it('is unavailable, not stuck, when the service worker does not answer in time', async () => {
    ask.askWorker.mockRejectedValueOnce(new AskTimeout('status'))
    expect(await mod.ocrStatus()).toEqual({ state: 'unavailable', reason: 'no-service-worker' })
    // The next question asks again.
    expect(await mod.ocrStatus()).toEqual({ state: 'ready' })
    expect(asked('status')).toBe(2)
  })

  it('treats any other failed answer as "not cached"', async () => {
    ask.askWorker.mockRejectedValueOnce(new Error('port closed'))
    expect(await mod.ocrStatus()).toEqual({ state: 'download', megabytes: mod.OCR_DOWNLOAD_MB })
  })
})

describe('the "ready" answer kept per service worker (ADR 0033)', () => {
  it('asks once while the same service worker controls the page', async () => {
    await mod.ocrStatus()
    await mod.ocrStatus()
    await Promise.all([mod.ocrStatus(), mod.ocrStatus()])
    expect(asked('status')).toBe(1)
  })

  it('asks again after an update, when another service worker takes control', async () => {
    await mod.ocrStatus()
    sw.take({ name: 'sw-2' })
    cached = false
    expect(await mod.ocrStatus()).toEqual({ state: 'download', megabytes: mod.OCR_DOWNLOAD_MB })
    expect(asked('status')).toBe(2)
  })

  it('asks again when the same worker\'s controllerchange fires', async () => {
    await mod.ocrStatus()
    sw.dispatchEvent(new Event('controllerchange'))
    await mod.ocrStatus()
    expect(asked('status')).toBe(2)
  })

  it('keeps "ready" after a successful prepare, so the next status needs no hashing', async () => {
    cached = false
    await mod.recognise(canvas())
    const before = asked('status')
    expect(await mod.ocrStatus()).toEqual({ state: 'ready' })
    expect(asked('status')).toBe(before)
  })

  it('drops "ready" when an OCR job fails', async () => {
    await mod.ocrStatus()
    FakeWorker.answer = () => 'error'
    await expect(mod.recognise(canvas())).rejects.toThrow('OCR worker failed')
    const before = asked('status')
    await mod.ocrStatus()
    expect(asked('status')).toBe(before + 1)
  })
})

describe('recognise', () => {
  it('checks the files first, then starts the worker from this site and returns the lines', async () => {
    FakeWorker.answer = () => [line('SECOND', 0.9, 0, 30), line('FIRST', 0.9, 0, 0), line('   ')]
    const { text, lines } = await mod.recognise(canvas(40, 20))
    expect(text).toBe('FIRST\nSECOND')
    expect(lines.map((l) => l.text)).toEqual(['FIRST', 'SECOND'])
    expect(asked('prepare')).toBe(1)
    expect(FakeWorker.made.map((w) => w.url)).toEqual(['https://example.test/app/ocr/worker.min.js'])
    expect(ran.ocrRan()).toBe(true)
  })

  it('moves the pixels to the worker instead of copying them', async () => {
    await mod.recognise(canvas(40, 20))
    const sent = FakeWorker.made[0]?.received[0]
    if (!sent) throw new Error('nothing sent')
    const { msg, transfer } = sent
    expect(msg).toMatchObject({ type: 'read', width: 40, height: 20 })
    expect(msg.data.byteLength).toBe(40 * 20 * 4)
    expect(transfer).toEqual([msg.data])
  })

  it('starts one worker for every job', async () => {
    await mod.recognise(canvas())
    await mod.recognise(canvas())
    expect(FakeWorker.made).toHaveLength(1)
    expect(asked('prepare')).toBe(1)
  })

  it('refuses to start when OCR is unavailable', async () => {
    cached = false
    nav.onLine = false
    await expect(mod.recognise(canvas())).rejects.toThrow('OCR unavailable: offline')
    expect(FakeWorker.made).toHaveLength(0)
  })

  it('fails with a clear error when the files cannot be prepared in time, and tries again next time', async () => {
    prepared = new AskTimeout('prepare')
    await expect(mod.recognise(canvas())).rejects.toThrow(/OCR files unavailable: .*'prepare' in time/)
    expect(FakeWorker.made).toHaveLength(0)
    prepared = { ok: true }
    await expect(mod.recognise(canvas())).resolves.toBeDefined()
    expect(FakeWorker.made).toHaveLength(1)
  })

  it('fails when the service worker reports a file that does not pass its check', async () => {
    prepared = { ok: false, error: 'hash mismatch: ocr/ppocrv6-tiny-det.onnx' }
    await expect(mod.recognise(canvas())).rejects.toThrow('OCR files unavailable: hash mismatch')
  })

  it('runs jobs one at a time', async () => {
    const first = mod.recognise(canvas())
    await vi.waitFor(() => { expect(FakeWorker.made[0]?.received).toHaveLength(1) })
    const w = FakeWorker.made[0]
    if (!w) throw new Error('no worker')
    w.hold = true
    const second = mod.recognise(canvas())
    await first
    await vi.waitFor(() => { expect(w.received).toHaveLength(2) })
    expect(w.received.map((r) => r.msg.id)).toEqual([1, 2])
    w.reply(w.received[1]?.msg as Request)
    await second
  })
})

describe('readMrz, findOnCard and wordBoxesOnCard', () => {
  it('readMrz returns null when no MRZ is read', async () => {
    FakeWorker.answer = () => [line('NOT AN MRZ')]
    expect(await mod.readMrz(canvas())).toBeNull()
  })

  it('wordBoxesOnCard keeps confident words only, in card coordinates, and no text', async () => {
    FakeWorker.answer = () => [line('ABC', 0.9, 10, 5, 20, 10), line('XYZ', 0.2, 0, 15, 20, 5)]
    const [side] = await mod.wordBoxesOnCard([['front', canvas(100, 50)]])
    expect(side?.side).toBe('front')
    expect(side?.words).toHaveLength(1)
    expect(side?.words[0]).toMatchObject({ y: 0.1, h: 0.2 })
    expect(JSON.stringify(side)).not.toContain('ABC')
  })

  it('findOnCard reads each side in turn', async () => {
    const res = await mod.findOnCard([['front', canvas()], ['back', canvas()]])
    expect(res.map((r) => r.side)).toEqual(['front', 'back'])
    expect(FakeWorker.made[0]?.received).toHaveLength(2)
  })
})

describe('stopOcr', () => {
  it('ends the running job with OcrStopped, ends the worker and keeps "ready"', async () => {
    await mod.recognise(canvas())
    const w = FakeWorker.made[0]
    if (!w) throw new Error('no worker')
    w.hold = true
    const job = mod.recognise(canvas())
    await vi.waitFor(() => { expect(w.received).toHaveLength(2) })
    await mod.stopOcr()
    await expect(job).rejects.toBeInstanceOf(mod.OcrStopped)
    expect(w.terminated).toBe(true)
    // Stopping is not a failure: the kept "ready" answer stays.
    const before = asked('status')
    await mod.ocrStatus()
    expect(asked('status')).toBe(before)
  })

  it('drops the result of a queued job and starts a new worker for the next one', async () => {
    await mod.recognise(canvas())
    const first = FakeWorker.made[0]
    if (!first) throw new Error('no worker')
    first.hold = true
    const running = mod.recognise(canvas())
    const queued = mod.recognise(canvas())
    await vi.waitFor(() => { expect(first.received).toHaveLength(2) })
    await mod.stopOcr()
    await expect(running).rejects.toBeInstanceOf(mod.OcrStopped)
    await expect(queued).rejects.toBeInstanceOf(mod.OcrStopped)
    expect(first.received).toHaveLength(2)
    await mod.recognise(canvas())
    expect(FakeWorker.made).toHaveLength(2)
  })

  it('does nothing when OCR never started', async () => {
    await expect(mod.stopOcr()).resolves.toBeUndefined()
  })
})
