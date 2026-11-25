// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { commitUrl, normalizeSha, relativeTime, shortSha } from '../../src/version/build-info.ts'

const SHA = '2a07023b9f8c1d4e5f60718293a4b5c6d7e8f901'
const MIN = 60_000
const T0 = Date.UTC(2026, 10, 25, 12, 0)

describe('commit SHA', () => {
  it('accepts full SHA-1 and SHA-256 hashes, in any case, and rejects the rest', () => {
    expect(normalizeSha(SHA)).toBe(SHA)
    expect(normalizeSha(` ${SHA.toUpperCase()}\n`)).toBe(SHA)
    expect(normalizeSha('a'.repeat(64))).toBe('a'.repeat(64))
    for (const bad of [undefined, '', '2a07023', `${SHA}x`, 'main', `${SHA.slice(1)}g`]) expect(normalizeSha(bad)).toBe('')
  })
  it('shortens to 7 characters, as GitHub does', () => {
    expect(shortSha(SHA)).toBe('2a07023')
  })
  it('links to the commit on the repository, and to nothing when unknown', () => {
    expect(commitUrl('https://github.com/aasanchez/dnilimpio.es', SHA)).toBe(`https://github.com/aasanchez/dnilimpio.es/commit/${SHA}`)
    expect(commitUrl('https://github.com/fork/x/', SHA)).toBe(`https://github.com/fork/x/commit/${SHA}`)
    expect(commitUrl('https://github.com/aasanchez/dnilimpio.es', '')).toBeUndefined()
  })
})

describe('relativeTime', () => {
  it('uses the largest whole unit, in the chosen language', () => {
    expect(relativeTime('es', T0, T0 + 5 * MIN)).toBe('hace 5 minutos')
    expect(relativeTime('es', T0, T0 + 59 * MIN)).toBe('hace 59 minutos')
    expect(relativeTime('es', T0, T0 + 3 * 60 * MIN)).toBe('hace 3 horas')
    expect(relativeTime('en', T0, T0 + 2 * 24 * 60 * MIN)).toBe('2 days ago')
    expect(relativeTime('en', T0, T0 + 24 * 60 * MIN)).toBe('yesterday')
    expect(relativeTime('en', T0, T0 + 400 * 24 * 60 * MIN)).toBe('last year')
    expect(relativeTime('ca-ES-valencia', T0, T0 + 5 * MIN)).toBe('fa 5 minuts')
    expect(relativeTime('ar', T0, T0 + 5 * MIN)).toBe('قبل 5 دقائق')
  })
  it('says "now" under a minute and when the device clock is behind the build', () => {
    expect(relativeTime('es', T0, T0 + 30_000)).toBe('ahora')
    expect(relativeTime('en', T0, T0 - 10 * MIN)).toBe('now')
  })
})
