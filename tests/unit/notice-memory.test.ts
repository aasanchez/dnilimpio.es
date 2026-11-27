// SPDX-License-Identifier: AGPL-3.0-or-later
// The only thing the app keeps in the browser (CLAUDE.md rule 2): the date the no-cookies notice was
// closed, under one key. These tests check what is written, when the notice shows again, and that
// blocked storage never breaks the page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTICE_INTERVAL_MS, NOTICE_KEY, noticeDue, rememberNoticeClosed } from '../../src/ui/notice-memory.ts'

const NOW = Date.parse('2026-11-27T12:00:00Z')

/** A localStorage stand-in that keeps what is written. */
function storage (): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
  } as unknown as Storage & { map: Map<string, string> }
}

/** Storage that throws on every use, as in some private modes or with storage blocked. */
const blocked = {
  getItem: () => { throw new DOMException('denied', 'SecurityError') },
  setItem: () => { throw new DOMException('denied', 'SecurityError') },
}

let store: ReturnType<typeof storage>

beforeEach(() => {
  store = storage()
  vi.stubGlobal('localStorage', store)
})

afterEach(() => { vi.unstubAllGlobals() })

describe('rememberNoticeClosed', () => {
  it('writes one key, the legacy one, holding only the date', () => {
    rememberNoticeClosed(NOW)
    expect(NOTICE_KEY).toBe('dnilimpio.noticeDismissedAt') // renaming it would show the notice again to everyone
    expect([...store.map]).toEqual([[NOTICE_KEY, '2026-11-27T12:00:00.000Z']])
  })

  it('fails silently when storage is blocked', () => {
    vi.stubGlobal('localStorage', blocked)
    expect(() => { rememberNoticeClosed(NOW) }).not.toThrow()
    vi.stubGlobal('localStorage', undefined)
    expect(() => { rememberNoticeClosed(NOW) }).not.toThrow()
  })
})

describe('noticeDue', () => {
  it('shows the notice when it was never closed', () => {
    expect(noticeDue(NOW)).toBe(true)
  })

  it('hides it for 4 days after it is closed, then shows it again', () => {
    expect(NOTICE_INTERVAL_MS).toBe(4 * 24 * 60 * 60 * 1000)
    rememberNoticeClosed(NOW)
    expect(noticeDue(NOW)).toBe(false)
    expect(noticeDue(NOW + NOTICE_INTERVAL_MS - 1)).toBe(false)
    expect(noticeDue(NOW + NOTICE_INTERVAL_MS)).toBe(true)
  })

  it('shows it when the stored date is in the future or not a date', () => {
    store.map.set(NOTICE_KEY, new Date(NOW + 60_000).toISOString())
    expect(noticeDue(NOW)).toBe(true)
    store.map.set(NOTICE_KEY, 'yesterday')
    expect(noticeDue(NOW)).toBe(true)
  })

  it('shows it when storage is blocked or missing', () => {
    vi.stubGlobal('localStorage', blocked)
    expect(noticeDue(NOW)).toBe(true)
    vi.stubGlobal('localStorage', undefined)
    expect(noticeDue(NOW)).toBe(true)
  })
})
