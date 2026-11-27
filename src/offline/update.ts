// SPDX-License-Identifier: AGPL-3.0-or-later
// Applies a new build without waiting for every window of the app to close.
//
// The service worker (src/sw.ts) serves the build it installed, from its cache, and a new build only
// takes over once no window runs the old one. A reload does not count: while the reloading page is
// replaced, the old worker keeps control. So a window that stays open (very common on phones) showed
// the old build indefinitely, even after reloads and new deploys.
//
// When a new build has been installed and is waiting, this page asks it to take over, but only when
// it is safe:
// - this page is idle (start screen, no photos), so nothing in progress can be lost; and
// - every other window of the app answers that it is idle too (sw.ts, message 'activate'), so no
//   window loses files it still needs.
// The page then reloads once, into the new build.
//
// A window the phone froze in the background (a browser tab left open, the installed app behind
// another app) cannot answer. Before, such a window held every update back until the person cleared
// the site's data. Now the start screen shows "Update now" instead (onUpdateReady()). Pressing it
// applies the new build at once. A window that is busy keeps its page and its photos, and reloads
// into the new build when it is back on the start screen.

let idle = false
let registration: ServiceWorkerRegistration | undefined
let reloading = false
/** This page asked the waiting build to take over, and it may have agreed. */
let requested = false
/** Another window applied the new build while this page was busy: reload once it is idle. */
let reloadWhenIdle = false
/** The waiting build did not take over by itself: the start screen offers "Update now". */
let ready = false
let lastCheck = 0

const listeners = new Set<() => void>()

/** Minimum time between update checks triggered by the tab becoming visible again. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000

function setReady (value: boolean): void {
  if (ready === value) return
  ready = value
  for (const l of listeners) l()
}

function reload (): void {
  if (reloading) return
  reloading = true
  location.reload()
}

/** Asks a waiting new build to take over, if the page is idle. */
function offer (): void {
  const waiting = registration?.waiting
  if (!idle || !waiting || navigator.serviceWorker.controller === null) return
  const channel = new MessageChannel()
  channel.port1.onmessage = (e: MessageEvent<unknown>) => {
    if ((e.data as { activated?: unknown } | null)?.activated === true) return
    // Another window is busy or did not answer: the new build waits, and the person may apply it.
    requested = false
    if (registration?.waiting === waiting) setReady(true)
  }
  requested = true
  waiting.postMessage({ type: 'activate' }, [channel.port2])
}

/** True when a new build is ready and waits for the person ("Update now" on the start screen). */
export function updateReady (): boolean {
  return ready
}

/** Calls fn whenever updateReady() changes. Returns a function that stops it. */
export function onUpdateReady (fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The person pressed "Update now": the waiting build takes over at once, and this page reloads. */
export function applyUpdate (): void {
  const waiting = registration?.waiting
  if (!waiting) { setReady(false); return }
  requested = true
  waiting.postMessage({ type: 'activate', force: true })
}

/** The app tells whether it is idle: start screen with no photos. */
export function setAppIdle (value: boolean): void {
  idle = value
  if (!idle) return
  if (reloadWhenIdle) reload()
  else offer()
}

/** Starts watching for new builds. Call once, after the service worker is registered. */
export async function watchForUpdates (): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker

  // A waiting new build asks each window whether it is idle before it takes over (sw.ts).
  sw.addEventListener('message', (e: MessageEvent<unknown>) => {
    const port = e.ports[0]
    if ((e.data as { type?: unknown } | null)?.type === 'idle?' && port) port.postMessage({ idle })
  })
  sw.startMessages()

  registration = await sw.getRegistration()
  if (registration === undefined) return
  const reg = registration

  // The new build took over: show it. The first worker taking control of a page that had none (first
  // visit) is the same build: no reload then. When this page asked for the switch, it reloads even if
  // the user left the start screen in the few milliseconds since: the new build has already deleted
  // the old build's files, so this page could no longer load its on-demand code. No photo can have
  // been chosen in that time. A switch another window asked for keeps a busy page as it is, until it
  // is back on the start screen.
  let hadController = sw.controller !== null
  sw.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return }
    setReady(false)
    if (idle || requested) reload()
    else reloadWhenIdle = true
  })

  reg.addEventListener('updatefound', () => {
    const worker = reg.installing
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offer()
    })
  })

  // A tab left open for hours: look for a new build when it comes back to the foreground. A build
  // that is already waiting (held back earlier by another window) is offered again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    offer()
    if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return
    lastCheck = Date.now()
    void reg.update().catch(() => undefined)
  })

  offer()
}
