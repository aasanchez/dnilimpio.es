// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { BLOCKED_GLOBALS, blockGlobals, isFramed } from '../../src/security/lockdown.ts'

describe('blockGlobals', () => {
  it('replaces the WebRTC constructors with a read-only undefined and leaves the rest', () => {
    const Fake = (): void => undefined
    const scope: Record<string, unknown> = { RTCPeerConnection: Fake, webkitRTCPeerConnection: Fake, RTCDataChannel: Fake, fetch: Fake }
    expect(blockGlobals(scope)).toEqual(['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel'])
    expect(scope['RTCPeerConnection']).toBeUndefined()
    expect(() => { scope['RTCPeerConnection'] = Fake }).toThrow() // strict mode: read-only
    expect(() => Object.defineProperty(scope, 'RTCPeerConnection', { value: Fake })).toThrow()
    expect(scope['fetch']).toBe(Fake)
  })
  it('skips names the scope does not have and never throws', () => {
    expect(blockGlobals({})).toEqual([])
    expect(blockGlobals(Object.freeze({ RTCPeerConnection: 1 }))).toEqual([])
    expect(BLOCKED_GLOBALS).toContain('RTCPeerConnection')
  })
})

describe('isFramed', () => {
  it('is false for a top-level page and true inside a frame', () => {
    const top = {} as Window
    expect(isFramed({ self: top, top } as unknown as Window)).toBe(false)
    expect(isFramed({ self: {} as Window, top } as unknown as Window)).toBe(true)
  })
  it('counts a top that cannot be read as a frame', () => {
    const win = { self: {} as Window, get top (): Window { throw new Error('cross-origin') } }
    expect(isFramed(win as unknown as Window)).toBe(true)
  })
})
