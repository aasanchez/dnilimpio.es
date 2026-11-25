// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs first, before any other module of the app or its libraries (main.ts imports it first).
//
// WebRTC: the CSP's connect-src does not cover it, so RTCPeerConnection could send data to any
// server (ICE/STUN/TURN) even with connect-src 'none'. The app never uses it (the camera uses
// getUserMedia, which stays), so the constructors are removed from the page before any library runs.
// Limit: a script that already runs in the page could still reach a fresh copy through a new
// about:blank iframe. This closes the easy path; the CSP, SRI and the locked lockfile do the rest.

/** Constructors that open peer-to-peer connections outside the CSP. */
export const BLOCKED_GLOBALS = ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCRtpSender', 'RTCRtpReceiver', 'RTCRtpTransceiver', 'RTCIceTransport', 'RTCDtlsTransport', 'RTCSctpTransport'] as const

/** Replaces each blocked constructor on `scope` with a read-only undefined. Returns the names removed. */
export function blockGlobals (scope: object): string[] {
  const removed: string[] = []
  for (const name of BLOCKED_GLOBALS) {
    if (!(name in scope)) continue
    try {
      Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false, enumerable: false })
      removed.push(name)
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

blockGlobals(globalThis)
