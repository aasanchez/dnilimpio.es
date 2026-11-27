// SPDX-License-Identifier: AGPL-3.0-or-later
// When a new build may replace the one running in the app's open windows (src/sw.ts, 'activate').
// Pure rules, no worker globals, tested in Node.
//
// The new build deletes the old build's files when it takes over, so a window that is still working
// with the old build (photos in the page) could no longer load the code it needs next. So the new
// build asks every other window of the app first. A window answers 'idle' (start screen, no photos)
// or 'busy'. A window the phone has frozen in the background (a Chrome tab left open, the installed
// app behind another app) runs no code, so it cannot answer: it is 'silent'.

/** What one other window of the app answered, or 'silent' if it did not answer in time. */
export type WindowAnswer = 'idle' | 'busy' | 'silent'

/** How long the new build waits for each window's answer. A window that runs answers at once. */
export const ANSWER_TIMEOUT_MS = 1500

/**
 * Whether the new build takes over now.
 * - Asked by the person (they pressed "Update now"): yes. A busy window keeps its page and its photos,
 *   and reloads into the new build when it is back on the start screen (src/offline/update.ts).
 * - Asked by an idle page on its own: only if every other window answered 'idle'. A busy or silent
 *   window holds it back, and the asking page offers the "Update now" button instead.
 */
export function mayTakeOver (others: readonly WindowAnswer[], askedByPerson: boolean): boolean {
  return askedByPerson || others.every((a) => a === 'idle')
}
