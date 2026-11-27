// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs first, before any other module of the app or its libraries (main.ts imports it first).
//
// WebRTC: the CSP's connect-src does not cover it, so RTCPeerConnection could send data to any
// server (ICE/STUN/TURN) even with connect-src 'none'. The app never uses it (the camera uses
// getUserMedia, which stays), so the constructors are removed from the page before any library runs.
// A new frame or pop-up would bring a fresh copy, so the same module also refuses frames and pop-ups
// and locks any frame window that appears anyway (frames.ts, ADR 0034).

import { guardWindow } from './frames.ts'

/** Constructors that open peer-to-peer connections outside the CSP. */
const defineProperty = Object.defineProperty

export const BLOCKED_GLOBALS = ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCRtpSender', 'RTCRtpReceiver', 'RTCRtpTransceiver', 'RTCIceTransport', 'RTCDtlsTransport', 'RTCSctpTransport'] as const

/** Replaces each blocked constructor on `scope` with a read-only undefined. Returns the names removed. */
export function blockGlobals (scope: object): string[] {
  const removed: string[] = []
  // Indexed loop and a captured defineProperty: this also runs on a new frame's window, after page
  // code could have replaced Array iterators or Object.defineProperty (ADR 0034).
  for (let i = 0; i < BLOCKED_GLOBALS.length; i++) {
    const name = BLOCKED_GLOBALS[i]
    if (name === undefined || !(name in scope)) continue
    try {
      defineProperty(scope, name, { value: undefined, writable: false, configurable: false, enumerable: false })
      removed[removed.length] = name
    } catch {
      // A non-configurable property cannot be replaced; nothing else to do.
    }
  }
  return removed
}

/**
 * True when the page is shown inside a frame of another page. The app then refuses to run, so no
 * page can show it under its own, invisible controls (clickjacking). GitHub Pages cannot send
 * frame-ancestors, and a <meta> CSP ignores it; the service worker adds it only for same-site frames
 * (src/sw.ts). This check covers every case, including the first visit.
 */
export function isFramed (win: Pick<Window, 'self' | 'top'>): boolean {
  try {
    return win.top !== win.self
  } catch {
    return true // A cross-origin top that cannot even be compared is a frame.
  }
}

// In a browser: the whole lockdown. In Node (unit tests) there is no DOM to guard.
if (typeof document === 'undefined') blockGlobals(globalThis)
else guardWindow(globalThis, blockGlobals)
