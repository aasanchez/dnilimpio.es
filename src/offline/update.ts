// SPDX-License-Identifier: AGPL-3.0-or-later
// Applies a new build without waiting for every tab to close.
//
// The service worker (src/sw.ts) serves the build it installed, from its cache, and a new build only
// takes over once no tab runs the old one. A reload does not count: while the reloading page is
// replaced, the old worker keeps control. So a tab that stays open (very common on phones) showed the
// old build indefinitely, even after reloads and new deploys.
//
// Now, when a new build has been installed and is waiting, this page asks it to take over, but only
// when it is safe:
// - this page is idle (start screen, no photos), so nothing in progress can be lost; and
// - the worker checks that this is the only tab of the app (sw.ts, message 'activate'), so no other
//   tab loses files it still needs.
// The page then reloads once, into the new build. A tab with work in progress keeps its build; the
// update is applied when it returns to the start screen.

let idle = false
let registration: ServiceWorkerRegistration | undefined
let reloading = false
let lastCheck = 0

/** Minimum time between update checks triggered by the tab becoming visible again. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000

/** Asks a waiting new build to take over, if the page is idle. */
function offer (): void {
  const waiting = registration?.waiting
  if (!idle || !waiting || navigator.serviceWorker.controller === null) return
  waiting.postMessage({ type: 'activate' })
}

/** The app tells whether it is idle: start screen with no photos. */
export function setAppIdle (value: boolean): void {
  idle = value
  if (idle) offer()
}

/** Starts watching for new builds. Call once, after the service worker is registered. */
export async function watchForUpdates (): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker
  registration = await sw.getRegistration()
  if (registration === undefined) return
  const reg = registration

  // The new build took over: show it, unless the user started working meanwhile. The first worker
  // taking control of a page that had none (first visit) is the same build: no reload then.
  let hadController = sw.controller !== null
  sw.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return }
    if (reloading || !idle) return
    reloading = true
    location.reload()
  })

  reg.addEventListener('updatefound', () => {
    const worker = reg.installing
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offer()
    })
  })

  // A tab left open for hours: look for a new build when it comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < CHECK_INTERVAL_MS) return
    lastCheck = Date.now()
    void reg.update().catch(() => undefined)
  })

  offer()
}
