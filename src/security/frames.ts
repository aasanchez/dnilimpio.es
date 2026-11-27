// SPDX-License-Identifier: AGPL-3.0-or-later
// Frame guard (ADR 0034). The app removes WebRTC from its window (lockdown.ts), but every new
// browsing context starts with a fresh copy: an about:blank frame has its own RTCPeerConnection, and
// connect-src does not cover WebRTC. The CSP cannot stop that frame: frame-src 'none' blocks loading
// a frame's address, not the empty document every frame starts with. No browser implements the CSP
// `webrtc` directive yet, so it is not in the policies (ADR 0034).
//
// The app never uses a frame or a pop-up, so from the first module on, in every window it controls:
// 1. Every way to put an element into a document refuses a frame element (iframe, frame, object,
//    embed, fencedframe, frameset), alone or inside the inserted tree. A frame element that is not
//    in a document has no window, so no fresh WebRTC.
// 2. window.open() and document.open() with a window's three arguments open nothing and return null.
// 3. If a frame still appears (by a path not listed here), its window gets the same lockdown before
//    contentWindow or contentDocument returns it, and a MutationObserver removes the element.
// The HTML parsers (innerHTML, srcdoc, document.write, execCommand('insertHTML')...) are already
// closed by Trusted Types ('require-trusted-types-for', no createHTML in the policy).
//
// Limit, stated plainly: window[0] and window.frames reach a frame's window without a getter that can
// be wrapped. Rule 1 is what keeps such a frame from existing; rule 3 is a second line, not a proof.

/** Elements that can hold a browsing context (a window of their own). */
export const FRAME_TAGS = ['iframe', 'frame', 'object', 'embed', 'fencedframe', 'frameset'] as const
const FRAME_SET = new Set<string>(FRAME_TAGS)
const FRAME_SELECTOR = FRAME_TAGS.join(',')

/** The part of a node this guard reads. */
interface NodeLike {
  nodeType?: number
  localName?: string | null
  querySelector?: (s: string) => unknown
}

/** True when `node` is a frame element or holds one. Text nodes, comments and strings never do. */
export function holdsFrame (node: unknown): boolean {
  if (node === null || typeof node !== 'object') return false
  const n = node as NodeLike
  // 1: element, 11: document fragment (also a template's content and a shadow root).
  if (n.nodeType === 1 && typeof n.localName === 'string' && FRAME_SET.has(n.localName.toLowerCase())) return true
  if ((n.nodeType === 1 || n.nodeType === 11) && typeof n.querySelector === 'function') {
    try {
      return n.querySelector(FRAME_SELECTOR) !== null
    } catch {
      return true // A node that cannot be searched is refused.
    }
  }
  return false
}

/** The error a refused insertion throws: the same name the DOM uses for an operation it does not support. */
export function frameRefused (): Error {
  const e = new Error('Frames are disabled in this app (ADR 0034).')
  e.name = 'NotSupportedError'
  return e
}

type Method = (this: unknown, ...args: unknown[]) => unknown
type Getter = (this: unknown) => unknown
type Setter = (this: unknown, v: unknown) => void
/** A property descriptor with function-typed members (not methods), so they can be read alone. */
interface Desc { get?: Getter, set?: Setter, value?: unknown, enumerable?: boolean }
const descOf = (o: object, name: string): Desc | undefined => Object.getOwnPropertyDescriptor(o, name)

/**
 * Wraps the method `name` of `proto` so it throws before running when any argument holds a frame.
 * Returns true when the method was wrapped. The wrapper cannot be replaced again.
 */
export function refuseFramesIn (proto: object | undefined, name: string): boolean {
  if (proto === undefined) return false
  const desc = Object.getOwnPropertyDescriptor(proto, name)
  const original = desc?.value as Method | undefined
  if (desc === undefined || typeof original !== 'function') return false
  const guarded = function (this: unknown, ...args: unknown[]): unknown {
    if (args.some(holdsFrame)) throw frameRefused()
    return original.apply(this, args)
  }
  try {
    Object.defineProperty(proto, name, { value: guarded, writable: false, configurable: false, enumerable: desc.enumerable ?? false })
    return true
  } catch {
    return false
  }
}

/** Every DOM method that inserts a node it is given, by interface. */
export const INSERTERS: Readonly<Record<string, readonly string[]>> = {
  Node: ['appendChild', 'insertBefore', 'replaceChild'],
  Element: ['append', 'prepend', 'before', 'after', 'replaceWith', 'replaceChildren', 'insertAdjacentElement', 'moveBefore'],
  CharacterData: ['before', 'after', 'replaceWith'],
  DocumentType: ['before', 'after', 'replaceWith'],
  Document: ['append', 'prepend', 'replaceChildren'],
  DocumentFragment: ['append', 'prepend', 'replaceChildren', 'moveBefore'],
  Range: ['insertNode', 'surroundContents'],
}

/** Getters that hand out a frame's window or document. */
const FRAME_GETTERS: Readonly<Record<string, readonly string[]>> = {
  HTMLIFrameElement: ['contentWindow', 'contentDocument'],
  HTMLFrameElement: ['contentWindow', 'contentDocument'],
  HTMLObjectElement: ['contentWindow', 'contentDocument'],
}

type Scope = Record<string, unknown> & { document?: Document, MutationObserver?: typeof MutationObserver }

const protoOf = (scope: Scope, iface: string): object | undefined => {
  const ctor = scope[iface]
  if (typeof ctor !== 'function') return undefined
  const proto: unknown = (ctor as { prototype?: unknown }).prototype
  return proto !== null && typeof proto === 'object' ? proto : undefined
}

/** Windows already guarded, so a window is never wrapped twice. */
const guarded = new WeakSet()

/**
 * Applies the full lockdown to a window: WebRTC removed (`block`), frames refused, no pop-ups,
 * frames that still appear locked and removed. Safe to call more than once and on any object.
 */
export function guardWindow (scope: object, block: (s: object) => unknown): void {
  if (guarded.has(scope)) return
  guarded.add(scope)
  const s = scope as Scope
  try {
    block(scope)
  } catch {
    // A window of another origin cannot be changed (and cannot be one of this app's frames).
    return
  }
  // 1. No frame element can enter a document.
  for (const [iface, names] of Object.entries(INSERTERS)) {
    for (const name of names) refuseFramesIn(protoOf(s, iface), name)
  }
  // document.body = <frameset> would add frames too.
  const docProto = protoOf(s, 'Document')
  const body = docProto && descOf(docProto, 'body')
  const getBody = body?.get
  const setBody = body?.set
  if (docProto && getBody && setBody) {
    try {
      Object.defineProperty(docProto, 'body', {
        get (this: unknown) { return getBody.call(this) },
        set (this: unknown, v: unknown) { if (holdsFrame(v)) throw frameRefused(); setBody.call(this, v) },
        configurable: false,
        enumerable: body.enumerable ?? false,
      })
    } catch { /* left as it was */ }
  }
  // 2. No pop-up: window.open() and document.open(url, name, features) return null, as a blocked pop-up does.
  try {
    Object.defineProperty(s, 'open', { value: () => null, writable: false, configurable: false })
  } catch { /* left as it was */ }
  const docOpen = docProto && Object.getOwnPropertyDescriptor(docProto, 'open')
  if (docProto && typeof docOpen?.value === 'function') {
    const open = docOpen.value as Method
    try {
      Object.defineProperty(docProto, 'open', {
        value: function (this: unknown, ...args: unknown[]) { return args.length >= 3 ? null : open.apply(this, args) },
        writable: false,
        configurable: false,
      })
    } catch { /* left as it was */ }
  }
  // 3. A frame that appears anyway: its window is locked before it is handed out...
  const lockFrameWindow = (w: unknown): void => { if (w !== null && typeof w === 'object') guardWindow(w, block) }
  for (const [iface, names] of Object.entries(FRAME_GETTERS)) {
    const proto = protoOf(s, iface)
    for (const name of names) {
      const desc = proto && descOf(proto, name)
      const get = desc?.get
      if (proto === undefined || desc === undefined || get === undefined) continue
      try {
        Object.defineProperty(proto, name, {
          get (this: unknown) {
            const v = get.call(this) as { defaultView?: unknown } | null
            lockFrameWindow(name === 'contentDocument' ? v?.defaultView : v)
            return v
          },
          configurable: false,
          enumerable: desc.enumerable ?? false,
        })
      } catch { /* left as it was */ }
    }
  }
  // ...and the element is removed as soon as the page notices it.
  const doc = s.document
  const MO = s.MutationObserver
  if (doc === undefined || typeof MO !== 'function') return
  try {
    new MO((records) => {
      for (const r of records) {
        for (const node of Array.from(r.addedNodes)) {
          if (!holdsFrame(node)) continue
          const el = node as Element
          const frames = FRAME_SET.has(el.localName) ? [el] : Array.from(el.querySelectorAll(FRAME_SELECTOR))
          for (const f of frames) {
            lockFrameWindow((f as HTMLIFrameElement).contentWindow)
            f.remove()
          }
        }
      }
    }).observe(doc, { childList: true, subtree: true })
  } catch { /* no observer: rules 1 to 3 still hold */ }
}
