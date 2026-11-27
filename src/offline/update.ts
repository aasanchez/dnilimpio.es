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

import { INITIAL_STATE, idleAnswer, step, wasActivated, type Facts, type UpdateEvent } from './update-rules.ts'

// The decisions are in update-rules.ts (pure, unit-tested). This file connects them to the browser.

let state = INITIAL_STATE
let registration: ServiceWorkerRegistration | undefined

const listeners = new Set<() => void>()

function facts (): Facts {
  return {
    waiting: registration?.waiting != null,
    controlled: registration !== undefined && navigator.serviceWorker.controller !== null,
  }
}

/** Feeds one event to the rules and carries out what they decide. */
function dispatch (event: UpdateEvent): void {
  const before = state.ready
  const result = step(state, event, facts())
  state = result.state
  if (state.ready !== before) for (const l of listeners) l()
  for (const effect of result.effects) run(effect)
}

function run (effect: 'offer' | 'force' | 'reload' | 'check'): void {
  const reg = registration
  switch (effect) {
    case 'reload':
      location.reload()
      return
    case 'check':
      void reg?.update().catch(() => undefined)
      return
    case 'force':
      reg?.waiting?.postMessage({ type: 'activate', force: true })
      return
    case 'offer': {
      const waiting = reg?.waiting
      if (!waiting) return
      const channel = new MessageChannel()
      channel.port1.onmessage = (e: MessageEvent<unknown>) => {
        dispatch({ type: 'answer', activated: wasActivated(e.data), stillWaiting: registration?.waiting === waiting })
      }
      waiting.postMessage({ type: 'activate' }, [channel.port2])
    }
  }
}

/** True when a new build is ready and waits for the person ("Update now" on the start screen). */
export function updateReady (): boolean {
  return state.ready
}

/** Calls fn whenever updateReady() changes. Returns a function that stops it. */
export function onUpdateReady (fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The person pressed "Update now": the waiting build takes over at once, and this page reloads. */
export function applyUpdate (): void {
  dispatch({ type: 'apply' })
}

/** The app tells whether it is idle: start screen with no photos. */
export function setAppIdle (value: boolean): void {
  dispatch({ type: 'idle', idle: value })
}

/** Starts watching for new builds. Call once, after the service worker is registered. */
export async function watchForUpdates (): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker

  // A waiting new build asks each window whether it is idle before it takes over (sw.ts).
  sw.addEventListener('message', (e: MessageEvent<unknown>) => {
    const port = e.ports[0]
    const answer = idleAnswer(e.data, state.idle)
    if (answer && port) port.postMessage(answer)
  })
  sw.startMessages()

  registration = await sw.getRegistration()
  if (registration === undefined) return
  const reg = registration

  // The new build took over: show it, unless the page is busy (update-rules.ts).
  sw.addEventListener('controllerchange', () => { dispatch({ type: 'controllerchange' }) })

  reg.addEventListener('updatefound', () => {
    const worker = reg.installing
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') dispatch({ type: 'installed' })
    })
  })

  // A tab left open for hours: look for a new build when it comes back to the foreground. A build
  // that is already waiting (held back earlier by another window) is offered again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') dispatch({ type: 'visible', now: Date.now() })
  })

  dispatch({ type: 'watch' })
}
