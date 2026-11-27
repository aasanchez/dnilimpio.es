// SPDX-License-Identifier: AGPL-3.0-or-later
// When an open page switches to a new build of the app (src/offline/update.ts, ADR 0030).
// Pure rules, no browser globals, tested in Node. update.ts feeds each browser event to step() and
// carries out the effects it returns.
//
// The rules:
// - The page offers a waiting new build only when it is idle (start screen, no photos) and a
//   service worker controls it. The new build then asks the other windows (src/offline/takeover.ts).
// - If the new build does not take over, and is still the one waiting, the start screen shows
//   "Update now". Pressing it applies the build at once.
// - When the new build takes over, an idle page reloads once into it. A busy page never reloads,
//   because a reload drops its photos: it reloads when it is back on the start screen.
// - The first worker that takes control of a page that had none (first visit) is the same build:
//   no reload then.
// - When the tab comes back to the foreground, the page offers a waiting build again, and looks for
//   a new build at most once every CHECK_INTERVAL_MS.

/** Minimum time between update checks triggered by the tab becoming visible again. */
export const CHECK_INTERVAL_MS = 15 * 60 * 1000

export interface UpdateState {
  /** The app is on the start screen with no photos. */
  readonly idle: boolean
  /** A service worker controlled this page when watching started, or took control since. */
  readonly hadController: boolean
  /** The page asked the browser to reload: never twice. */
  readonly reloading: boolean
  /** A new build took over while this page was busy: reload once it is idle. */
  readonly reloadWhenIdle: boolean
  /** A new build waits for the person: the start screen shows "Update now". */
  readonly ready: boolean
  /** Time of the last update check (ms since the epoch); 0 before the first one. */
  readonly lastCheck: number
}

export const INITIAL_STATE: UpdateState = {
  idle: false,
  hadController: false,
  reloading: false,
  reloadWhenIdle: false,
  ready: false,
  lastCheck: 0,
}

/** What the page knows about the service worker when an event arrives. */
export interface Facts {
  /** A new build is installed and waiting. */
  readonly waiting: boolean
  /** A service worker controls this page. */
  readonly controlled: boolean
}

export type UpdateEvent =
  /** Watching starts (the service worker is registered). */
  | { readonly type: 'watch' }
  /** The app says whether it is idle. */
  | { readonly type: 'idle'; readonly idle: boolean }
  /** A new build finished installing. */
  | { readonly type: 'installed' }
  /** The tab came back to the foreground, at time now. */
  | { readonly type: 'visible'; readonly now: number }
  /** The waiting build answered an offer. stillWaiting: that same build still waits. */
  | { readonly type: 'answer'; readonly activated: boolean; readonly stillWaiting: boolean }
  /** The person pressed "Update now". */
  | { readonly type: 'apply' }
  /** A service worker took control of the page. */
  | { readonly type: 'controllerchange' }

/**
 * What update.ts does next:
 * - 'offer': ask the waiting build to take over if every window is idle ({ type: 'activate' }).
 * - 'force': ask the waiting build to take over at once ({ type: 'activate', force: true }).
 * - 'reload': reload the page into the new build.
 * - 'check': ask the browser to look for a new build.
 */
export type Effect = 'offer' | 'force' | 'reload' | 'check'

export interface Step {
  readonly state: UpdateState
  readonly effects: readonly Effect[]
}

/** Whether the page may offer the waiting build now. */
export function mayOffer (state: UpdateState, facts: Facts): boolean {
  return state.idle && facts.waiting && facts.controlled
}

function reload (state: UpdateState): Step {
  if (state.reloading) return { state, effects: [] }
  return { state: { ...state, reloading: true }, effects: ['reload'] }
}

function offer (state: UpdateState, facts: Facts): Step {
  return { state, effects: mayOffer(state, facts) ? ['offer'] : [] }
}

/** The next state, and what to do, after one event. */
export function step (state: UpdateState, event: UpdateEvent, facts: Facts): Step {
  switch (event.type) {
    case 'watch':
      return offer({ ...state, hadController: facts.controlled }, facts)
    case 'idle': {
      const next = { ...state, idle: event.idle }
      if (!next.idle) return { state: next, effects: [] }
      return next.reloadWhenIdle ? reload(next) : offer(next, facts)
    }
    case 'installed':
      return offer(state, facts)
    case 'visible': {
      const offered = offer(state, facts)
      if (event.now - state.lastCheck < CHECK_INTERVAL_MS) return offered
      return { state: { ...state, lastCheck: event.now }, effects: [...offered.effects, 'check'] }
    }
    case 'answer':
      // Another window is busy or did not answer: the new build waits, and the person may apply it.
      if (event.activated || !event.stillWaiting) return { state, effects: [] }
      return { state: { ...state, ready: true }, effects: [] }
    case 'apply':
      if (!facts.waiting) return { state: { ...state, ready: false }, effects: [] }
      return { state, effects: ['force'] }
    case 'controllerchange': {
      if (!state.hadController) return { state: { ...state, hadController: true }, effects: [] }
      const next = { ...state, ready: false }
      return next.idle ? reload(next) : { state: { ...next, reloadWhenIdle: true }, effects: [] }
    }
  }
}

/**
 * The answer of a window to the waiting build's question 'idle?' (src/sw.ts), or undefined when the
 * message is not that question.
 */
export function idleAnswer (data: unknown, idle: boolean): { idle: boolean } | undefined {
  return (data as { type?: unknown } | null)?.type === 'idle?' ? { idle } : undefined
}

/** Whether the waiting build's reply to an offer says it took over. */
export function wasActivated (data: unknown): boolean {
  return (data as { activated?: unknown } | null)?.activated === true
}
