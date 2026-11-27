<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0030. A new version takes over when every window is idle, or when the person asks

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis (report of 27 November 2026: "I have to clear the app's data to get a new version")

## Context

The service worker ([ADR 0004](0004-offline-service-worker.md)) never calls `skipWaiting()` on its
own. A new build waits until no window runs the old one, because taking over deletes the old build's
files, and a window that is still working could no longer load the code it needs next (the card
guide, document detection, OCR, the corner model, another language).

Since PR #44, an idle page (start screen, no photos) could ask the waiting build to take over, but
only when it was the app's only window (`clients.matchAll()` returned one client). On a phone there
is almost always a second one: a browser tab left open weeks ago, the installed app (ADR 0018) plus a
tab, or a tab the phone froze in the background. Any of them held every update back for good. A
reload does not help, and closing a frozen tab is not obvious. The only way out was to clear the
site's data, which unregisters the worker. A test with two builds reproduced it: one frozen second
tab kept the old build through every relaunch.

The HTTP cache was not the cause. The worker is registered with `updateViaCache: 'none'` and
downloads every file with `cache: 'reload'`, so GitHub Pages' `max-age=600` and the headers planned
for Cloudflare (ADR 0027, PR #69) do not delay an update.

## Decision

- The waiting build asks every other window of the app whether it is idle (`{ type: 'idle?' }`,
  answered by `src/offline/update.ts`). It takes over only if every one answers "idle" within
  1.5 seconds (`mayTakeOver()` in `src/offline/takeover.ts`). Idle windows then reload into the new
  build, also in the background.
- A window that is busy, or that does not answer (frozen, stuck, or still running a build older than
  this one), holds the automatic switch back. The start screen of the asking page then shows
  **Update now**. Pressing it sends `{ type: 'activate', force: true }`, and the new build takes over
  at once.
- A busy window that loses its build this way keeps its page and its photos. It reloads into the new
  build when it is back on the start screen. Until then, a part it had not loaded yet may be missing;
  every AI part already falls back to the manual path (CLAUDE.md rule 5).
- Nothing else changes: the same files, the same integrity checks at install and on every cache hit
  (ADR 0026), and it works offline, because the new build is already installed when it is offered.

## Consequences

- One person with several windows gets updates by themselves when all of them are idle, and with one
  press otherwise. Clearing the site's data is no longer needed.
- The first update to this build still shows **Update now** if another window runs an older build,
  because older pages cannot answer.
- A window frozen with photos in it can lose parts it had not loaded when the person presses
  **Update now** in another window. This needs the person's own press, never happens by itself, and
  loses no photo.
- Updates add two strings in every language (`updateReady`, `updateNow`).
