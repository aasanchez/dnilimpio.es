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
const FRAME_SELECTOR = FRAME_TAGS.join(',')

// Built-ins captured when this module loads, before any other code runs: page code can later replace
// Array.prototype.some, Function.prototype.apply or Set.prototype.has, but not these bindings.
const apply = Reflect.apply
const getOwn = Object.getOwnPropertyDescriptor
const define = Object.defineProperty
const entries = Object.entries

type Method = (this: unknown, ...args: unknown[]) => unknown
type Getter = (this: unknown) => unknown
type Setter = (this: unknown, v: unknown) => void
/** A property descriptor with function-typed members (not methods), so they can be read alone. */
interface Desc { get?: Getter, set?: Setter, value?: unknown, enumerable?: boolean }
const descOf = (o: object, name: string): Desc | undefined => getOwn(o, name)

/** True for a frame tag. Compared one by one: no Set or Array method that page code could replace. */
function isFrameTag (name: unknown): boolean {
  for (let i = 0; i < FRAME_TAGS.length; i++) if (name === FRAME_TAGS[i]) return true
  return false
}

/** The native DOM accessors the guard reads a node with (one realm's). */
export interface Natives {
  nodeType: Getter
  localName: Getter
  elementQuery: Method
  fragmentQuery: Method
  elementQueryAll: Method
  remove: Method
}

/**
 * Reads the native accessors from a window's prototypes, or returns null where there is no DOM
 * (Node, unit tests). A node's own properties are never read: page code can shadow them
 * (Object.defineProperty(frame, 'nodeType', { value: 3 })), the native getters cannot be fooled.
 */
export function nativesOf (scope: object): Natives | null {
  const proto = (iface: string): object | undefined => protoOf(scope as Scope, iface)
  const node = proto('Node')
  const el = proto('Element')
  const frag = proto('DocumentFragment')
  if (!node || !el || !frag) return null
  const nodeType = descOf(node, 'nodeType')?.get
  const localName = descOf(el, 'localName')?.get
  const elementQuery = descOf(el, 'querySelector')?.value
  const fragmentQuery = descOf(frag, 'querySelector')?.value
  const elementQueryAll = descOf(el, 'querySelectorAll')?.value
  const remove = descOf(el, 'remove')?.value
  if (!nodeType || !localName || typeof elementQuery !== 'function' || typeof fragmentQuery !== 'function' || typeof elementQueryAll !== 'function' || typeof remove !== 'function') return null
  return { nodeType, localName, elementQuery: elementQuery as Method, fragmentQuery: fragmentQuery as Method, elementQueryAll: elementQueryAll as Method, remove: remove as Method }
}

/** The part of a node the fallback reads (no DOM: unit tests with plain objects). */
interface NodeLike {
  nodeType?: number
  localName?: string | null
  querySelector?: (s: string) => unknown
}

/**
 * True when `node` is a frame element or holds one. Text nodes, comments and strings never do.
 * With `natives`, the node is read only through the native accessors.
 */
export function holdsFrame (node: unknown, natives: Natives | null = null): boolean {
  if (node === null || typeof node !== 'object') return false
  if (natives !== null) {
    let type: unknown
    try {
      type = apply(natives.nodeType, node, [])
    } catch {
      return false // Not a DOM node: the native method it was passed to refuses it anyway.
    }
    try {
      // 1: element, 11: document fragment (also a template's content and a shadow root).
      if (type === 1) return isFrameTag(apply(natives.localName, node, [])) || apply(natives.elementQuery, node, [FRAME_SELECTOR]) !== null
      if (type === 11) return apply(natives.fragmentQuery, node, [FRAME_SELECTOR]) !== null
    } catch {
      return true // A node that cannot be searched is refused.
    }
    return false
  }
  const n = node as NodeLike
  if (n.nodeType === 1 && isFrameTag(n.localName)) return true
  if ((n.nodeType === 1 || n.nodeType === 11) && typeof n.querySelector === 'function') {
    try {
      return n.querySelector(FRAME_SELECTOR) !== null
    } catch {
      return true
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

/**
 * Wraps the method `name` of `proto` so it throws before running when any argument holds a frame.
 * Returns true when the method was wrapped. The wrapper cannot be replaced again.
 */
export function refuseFramesIn (proto: object | undefined, name: string, natives: Natives | null = null): boolean {
  if (proto === undefined) return false
  const desc = descOf(proto, name)
  const original = desc?.value as Method | undefined
  if (desc === undefined || typeof original !== 'function') return false
  const guarded = function (this: unknown, ...args: unknown[]): unknown {
    for (let i = 0; i < args.length; i++) if (holdsFrame(args[i], natives)) throw frameRefused()
    return apply(original, this, args)
  }
  try {
    define(proto, name, { value: guarded, writable: false, configurable: false, enumerable: desc.enumerable ?? false })
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
const isGuarded = descOf(WeakSet.prototype, 'has')?.value as Method
const markGuarded = descOf(WeakSet.prototype, 'add')?.value as Method

/**
 * Applies the full lockdown to a window: WebRTC removed (`block`), frames refused, no pop-ups,
 * frames that still appear locked and removed. Safe to call more than once and on any object.
 */
export function guardWindow (scope: object, block: (s: object) => unknown): void {
  if (apply(isGuarded, guarded, [scope])) return
  apply(markGuarded, guarded, [scope])
  const s = scope as Scope
  try {
    block(scope)
  } catch {
    // A window of another origin cannot be changed (and cannot be one of this app's frames).
    return
  }
  // Read before any wrapper below is installed, from this window's own prototypes.
  const natives = nativesOf(scope)
  // 1. No frame element can enter a document.
  const inserters = entries(INSERTERS)
  for (let i = 0; i < inserters.length; i++) {
    const [iface, names] = inserters[i] ?? ['', []]
    for (let j = 0; j < names.length; j++) refuseFramesIn(protoOf(s, iface), names[j] ?? '', natives)
  }
  // document.body = <frameset> would add frames too.
  const docProto = protoOf(s, 'Document')
  const body = docProto && descOf(docProto, 'body')
  const getBody = body?.get
  const setBody = body?.set
  if (docProto && getBody && setBody) {
    try {
      define(docProto, 'body', {
        get (this: unknown) { return apply(getBody, this, []) },
        set (this: unknown, v: unknown) { if (holdsFrame(v, natives)) throw frameRefused(); apply(setBody, this, [v]) },
        configurable: false,
        enumerable: body.enumerable ?? false,
      })
    } catch { /* left as it was */ }
  }
  // 2. No pop-up: window.open() and document.open(url, name, features) return null, as a blocked pop-up does.
  try {
    define(s, 'open', { value: () => null, writable: false, configurable: false })
  } catch { /* left as it was */ }
  const docOpen = docProto && descOf(docProto, 'open')
  if (docProto && typeof docOpen?.value === 'function') {
    const open = docOpen.value as Method
    try {
      define(docProto, 'open', {
        value: function (this: unknown, ...args: unknown[]) { return args.length >= 3 ? null : apply(open, this, args) },
        writable: false,
        configurable: false,
      })
    } catch { /* left as it was */ }
  }
  // 3. A frame that appears anyway: its window is locked before it is handed out...
  const lockFrameWindow = (w: unknown): void => { if (w !== null && typeof w === 'object') guardWindow(w, block) }
  const docProtoView = docProto && descOf(docProto, 'defaultView')?.get
  const viewOf = (d: unknown): unknown => {
    if (d === null || typeof d !== 'object' || !docProtoView) return null
    try { return apply(docProtoView, d, []) } catch { return null }
  }
  /** The native contentWindow getters, kept to lock a frame found by the observer. */
  const windowGetters: Getter[] = []
  const getters = entries(FRAME_GETTERS)
  for (let i = 0; i < getters.length; i++) {
    const [iface, names] = getters[i] ?? ['', []]
    const proto = protoOf(s, iface)
    for (let j = 0; j < names.length; j++) {
      const name = names[j] ?? ''
      const desc = proto && descOf(proto, name)
      const get = desc?.get
      if (proto === undefined || desc === undefined || get === undefined) continue
      if (name === 'contentWindow') windowGetters.push(get)
      try {
        define(proto, name, {
          get (this: unknown) {
            const v = apply(get, this, [])
            lockFrameWindow(name === 'contentDocument' ? viewOf(v) : v)
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
  if (doc === undefined || typeof MO !== 'function' || natives === null) return
  const lockAndRemove = (f: unknown): void => {
    for (let i = 0; i < windowGetters.length; i++) {
      const get = windowGetters[i]
      if (get === undefined) continue
      try { lockFrameWindow(apply(get, f, [])); break } catch { /* not this interface */ }
    }
    try { apply(natives.remove, f, []) } catch { /* already gone */ }
  }
  try {
    new MO((records) => {
      for (let i = 0; i < records.length; i++) {
        const added = records[i]?.addedNodes
        if (added === undefined) continue
        for (let j = 0; j < added.length; j++) {
          const node = added[j]
          if (!holdsFrame(node, natives)) continue
          if (isFrameTag(apply(natives.localName, node, []))) {
            lockAndRemove(node)
            continue
          }
          const inner = apply(natives.elementQueryAll, node, [FRAME_SELECTOR]) as ArrayLike<unknown>
          for (let k = 0; k < inner.length; k++) lockAndRemove(inner[k])
        }
      }
    }).observe(doc, { childList: true, subtree: true })
  } catch { /* no observer: rules 1 to 3 still hold */ }
}
