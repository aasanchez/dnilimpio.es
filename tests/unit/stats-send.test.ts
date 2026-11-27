// SPDX-License-Identifier: AGPL-3.0-or-later
// The one request with data in it (ADR 0029): sendStats sends the text it is given, with no cookie,
// no referrer, no cache and no redirect, and reports success only for 204.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STATS_URL, sendStats } from '../../src/stats/send.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendStats', () => {
  it('posts the text as it is, with no cookie, referrer, cache or redirect', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetch)
    expect(await sendStats('v=1&doc=tie')).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(STATS_URL, {
      method: 'POST',
      body: 'v=1&doc=tie',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    })
  })
  it.each([200, 400, 429, 500])('reports failure for status %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(status === 200 ? 'ok' : null, { status }))))
    expect(await sendStats('v=1')).toBe(false)
  })
  it('reports failure when the request fails, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))))
    expect(await sendStats('v=1')).toBe(false)
  })
})
