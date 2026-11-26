// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { isIos, isStandalone } from '../../src/offline/install.ts'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'
const media = (matches: boolean): Pick<Window, 'matchMedia'> => ({ matchMedia: () => ({ matches }) as MediaQueryList })

describe('install offer', () => {
  it('recognises iPhone, and iPad behind its Mac user agent', () => {
    expect(isIos({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true)
    expect(isIos({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true)
    expect(isIos({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false)
    expect(isIos({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false)
  })
  it('knows when it already runs as an installed app', () => {
    expect(isStandalone(media(true), { userAgent: ANDROID, maxTouchPoints: 5 })).toBe(true)
    expect(isStandalone(media(false), { userAgent: IPHONE, maxTouchPoints: 5, standalone: true })).toBe(true)
    expect(isStandalone(media(false), { userAgent: IPHONE, maxTouchPoints: 5, standalone: false })).toBe(false)
  })
})
