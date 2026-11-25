// SPDX-License-Identifier: AGPL-3.0-or-later
// The only thing the app keeps in the browser: when the person last closed the no-cookies notice,
// so it shows at most once every 4 days. One key holding one date: no document, photo or field
// data, no identifier. Remembering a choice the person made needs no consent (ePrivacy art. 5(3),
// "strictly necessary" for the service they asked for). If storage is blocked, the notice simply
// shows again on the next visit.
export const NOTICE_KEY = 'dnilimpio.noticeDismissedAt'
export const NOTICE_INTERVAL_MS = 4 * 24 * 60 * 60 * 1000

/** True when the notice was never closed, closed 4 days ago or more, or storage cannot be read. */
export function noticeDue (now: number = Date.now()): boolean {
  try {
    const at = Date.parse(localStorage.getItem(NOTICE_KEY) ?? '')
    return !Number.isFinite(at) || now - at >= NOTICE_INTERVAL_MS || at > now
  } catch {
    return true
  }
}

/** Remembers that the notice was closed now. Fails silently: it then shows on the next visit. */
export function rememberNoticeClosed (now: number = Date.now()): void {
  try {
    localStorage.setItem(NOTICE_KEY, new Date(now).toISOString())
  } catch {
    // Storage blocked (private mode, a strict browser setting): nothing to do.
  }
}
