// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ASK_TIMEOUT_MS, AskTimeout, askWorker, type AskTarget } from '../../src/ocr/ask.ts'

/** A service worker stand-in that answers `reply` (or nothing), after `delayMs`. */
const target = (reply: unknown, delayMs = 0): AskTarget => ({
  postMessage: (_m, [port]) => {
    if (reply === undefined) return
    setTimeout(() => { (port as MessagePort).postMessage(reply) }, delayMs)
  },
})

const STATUS = { type: 'status', paths: ['ocr/worker.min.js'] } as const

describe('askWorker', () => {
  it('returns the worker\'s answer', async () => {
    expect(await askWorker(target({ ok: true, cached: true }), STATUS, 1000)).toEqual({ ok: true, cached: true })
    expect(await askWorker(target({ ok: false, error: 'offline' }), { type: 'prepare', paths: [] }, 1000)).toEqual({ ok: false, cached: false, error: 'offline' })
  })

  it('reads a malformed answer as "not ok"', async () => {
    expect(await askWorker(target(null), STATUS, 1000)).toEqual({ ok: false, cached: false })
    expect(await askWorker(target({ ok: 'yes', cached: 1, error: 3 }), STATUS, 1000)).toEqual({ ok: false, cached: false })
  })

  it('ends with AskTimeout when the worker stays silent', async () => {
    await expect(askWorker(target(undefined), STATUS, 30)).rejects.toBeInstanceOf(AskTimeout)
  })

  it('ignores an answer that comes after the limit', async () => {
    await expect(askWorker(target({ ok: true, cached: true }, 80), STATUS, 20)).rejects.toBeInstanceOf(AskTimeout)
  })

  it('rejects when the message cannot be sent', async () => {
    const broken: AskTarget = { postMessage: () => { throw new Error('worker gone') } }
    await expect(askWorker(broken, STATUS, 1000)).rejects.toThrow('worker gone')
  })

  it('gives the download more time than the status check', () => {
    expect(ASK_TIMEOUT_MS.status).toBeGreaterThan(0)
    expect(ASK_TIMEOUT_MS.prepare).toBeGreaterThan(ASK_TIMEOUT_MS.status)
  })
})

describe('ocrStatus with a silent service worker', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('says OCR is unavailable after the limit instead of waiting forever', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.stubGlobal('Worker', function Worker () {})
    vi.stubGlobal('navigator', { onLine: true, serviceWorker: { controller: target(undefined) } })
    const { ocrStatus } = await import('../../src/ocr/ocr.ts')
    const status = ocrStatus()
    await vi.advanceTimersByTimeAsync(ASK_TIMEOUT_MS.status)
    expect(await status).toEqual({ state: 'unavailable', reason: 'no-service-worker' })
  })

  it('still says "ready" when the worker answers in time', async () => {
    vi.stubGlobal('Worker', function Worker () {})
    vi.stubGlobal('navigator', { onLine: true, serviceWorker: { controller: target({ ok: true, cached: true }) } })
    const { ocrStatus } = await import('../../src/ocr/ocr.ts')
    expect(await ocrStatus()).toEqual({ state: 'ready' })
  })
})
