// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { BLOCKED_GLOBALS, blockGlobals, exposedGlobals, isFramed } from '../../src/security/lockdown.ts'
import { FRAME_TAGS, INSERTERS, guardWindow, holdsFrame, nativesOf, refuseFramesIn } from '../../src/security/frames.ts'

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

describe('exposedGlobals (audit F-14)', () => {
  const Fake = (): void => undefined
  it('is empty once blockGlobals() removed everything', () => {
    const scope: Record<string, unknown> = { RTCPeerConnection: Fake, RTCDataChannel: Fake, fetch: Fake }
    blockGlobals(scope)
    expect(exposedGlobals(scope)).toEqual([])
    expect(exposedGlobals({})).toEqual([])
  })
  it('names a constructor that could not be replaced', () => {
    const scope: Record<string, unknown> = { RTCDataChannel: Fake }
    Object.defineProperty(scope, 'RTCPeerConnection', { value: Fake, writable: false, configurable: false, enumerable: true })
    expect(blockGlobals(scope)).toEqual(['RTCDataChannel'])
    expect(exposedGlobals(scope)).toEqual(['RTCPeerConnection'])
  })
  it('counts a property that throws when read as present', () => {
    const scope = {}
    Object.defineProperty(scope, 'RTCPeerConnection', { get () { throw new Error('no') }, configurable: false })
    expect(exposedGlobals(scope)).toEqual(['RTCPeerConnection'])
  })
  it('sees an inherited constructor too', () => {
    const scope = Object.create(Object.freeze({ webkitRTCPeerConnection: Fake })) as object
    expect(exposedGlobals(scope)).toEqual(['webkitRTCPeerConnection'])
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

describe('frame guard (ADR 0034)', () => {
  const el = (localName: string, inner: string | null = null): object => ({ nodeType: 1, localName, querySelector: (s: string) => (inner !== null && s.split(',').includes(inner) ? {} : null) })

  it('finds a frame element, alone or inside an element or fragment', () => {
    for (const tag of FRAME_TAGS) expect(holdsFrame(el(tag)), tag).toBe(true)
    expect(holdsFrame(el('div', 'iframe'))).toBe(true)
    expect(holdsFrame({ nodeType: 11, querySelector: () => ({}) })).toBe(true)
  })
  it('lets everything else through: other elements, text, strings, nothing', () => {
    expect(holdsFrame(el('div'))).toBe(false)
    expect(holdsFrame({ nodeType: 3, localName: null })).toBe(false)
    expect(holdsFrame('<iframe>')).toBe(false)
    expect(holdsFrame(null)).toBe(false)
    expect(holdsFrame(undefined)).toBe(false)
  })
  it('reads nodes only through the native accessors, so a node cannot disguise itself', () => {
    // A fake DOM: the "native" getters read a hidden slot, as the browser reads an internal slot.
    const slot = new WeakMap<object, { type: number, name: string }>()
    const read = (o: unknown): { type: number, name: string } => { const v = slot.get(o as object); if (v === undefined) throw new TypeError('Illegal invocation'); return v }
    class Node { get nodeType (): number { return read(this).type } }
    class Element extends Node {
      get localName (): string { return read(this).name }
      querySelector (): null { return null }
      querySelectorAll (): never[] { return [] }
      remove (): void {}
    }
    class DocumentFragment extends Node { querySelector (): null { return null } }
    const natives = nativesOf({ Node, Element, DocumentFragment })
    expect(natives).not.toBeNull()
    const frame = new Element()
    slot.set(frame, { type: 1, name: 'iframe' })
    Object.defineProperty(frame, 'nodeType', { value: 3 })
    Object.defineProperty(frame, 'localName', { value: 'p' })
    expect(holdsFrame(frame, natives)).toBe(true)
    expect(holdsFrame(frame)).toBe(false) // what the disguise did to a check that trusts the node
    const div = new Element()
    slot.set(div, { type: 1, name: 'div' })
    expect(holdsFrame(div, natives)).toBe(false)
    expect(holdsFrame({ nodeType: 1, localName: 'iframe' }, natives)).toBe(false) // not a node: the native method refuses it
    expect(nativesOf({})).toBeNull()
  })
  it('refuses a node that cannot be searched', () => {
    expect(holdsFrame({ nodeType: 1, localName: 'div', querySelector: () => { throw new Error('x') } })).toBe(true)
  })
  it('wraps an insertion method so it throws on a frame and works for the rest, for good', () => {
    const calls: unknown[] = []
    const proto = { append (...nodes: unknown[]) { calls.push(...nodes) } }
    expect(refuseFramesIn(proto, 'append')).toBe(true)
    expect(() => { proto.append(el('div'), 'text') }).not.toThrow()
    expect(() => { proto.append('text', el('iframe')) }).toThrow(/Frames are disabled/)
    expect(calls).toHaveLength(2)
    expect(() => Object.defineProperty(proto, 'append', { value: () => undefined })).toThrow()
    expect(refuseFramesIn(proto, 'missing')).toBe(false)
    expect(refuseFramesIn(undefined, 'append')).toBe(false)
  })
  it('lists every DOM method that inserts a given node', () => {
    expect(INSERTERS['Node']).toEqual(['appendChild', 'insertBefore', 'replaceChild'])
    expect(INSERTERS['Element']).toEqual(expect.arrayContaining(['append', 'prepend', 'before', 'after', 'replaceWith', 'replaceChildren', 'insertAdjacentElement']))
    expect(INSERTERS['Range']).toEqual(['insertNode', 'surroundContents'])
  })
  it('locks a window: WebRTC removed, no pop-up, and never twice', () => {
    const Fake = (): void => undefined
    const win: Record<string, unknown> = { RTCPeerConnection: Fake, open: () => ({}) }
    let runs = 0
    const block = (s: object): void => { runs++; blockGlobals(s) }
    guardWindow(win, block)
    guardWindow(win, block)
    expect(runs).toBe(1)
    expect(win['RTCPeerConnection']).toBeUndefined()
    expect((win['open'] as () => unknown)()).toBeNull()
  })
})
