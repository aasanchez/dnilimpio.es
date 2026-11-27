// SPDX-License-Identifier: AGPL-3.0-or-later
// Opens the thanks page after "Clear everything" (ADR 0029). The session's usage figures travel in
// the address fragment (after #): a browser never sends the fragment to any server, so opening the
// page sends nothing. The thanks page reads it, checks it against the fixed list of src/stats/schema.ts,
// removes it from the address, and sends it only if the person taps Send.

import { encodeSession, type SessionStats } from './schema.ts'

/**
 * The thanks page's address, relative to the app (rule 6: relative URLs only). The same file as
 * THANKS_PAGE in src/offline/precache.ts (tests/unit/stats.test.ts checks it); not imported, so the
 * app's code shares no module with the service worker.
 */
export const THANKS_URL = './thanks.html'
export const thanksHref = (s: SessionStats): string => `${THANKS_URL}#${encodeSession(s)}`

/** Leaves the app for the thanks page. The app's pagehide handler clears what is still in memory. */
export function openThanks (s: SessionStats): void {
  location.assign(thanksHref(s))
}
