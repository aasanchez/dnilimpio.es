// SPDX-License-Identifier: AGPL-3.0-or-later
// "Install app" (ADR 0018). The manifest (public/manifest.webmanifest) and the service worker make the
// app installable; this module only decides whether to offer it, and how:
// - Chromium browsers (Android, desktop Chrome and Edge) fire `beforeinstallprompt`. The event is kept
//   and the button opens the browser's own install dialog.
// - iOS and iPadOS have no such event: every browser there installs through the Share menu, so the
//   button shows those steps instead.
// - Already installed (running in its own window), or any other browser: nothing is shown.
// main.ts calls watchInstall() before the app mounts, because the event can fire very early.

/** The non-standard event Chromium fires when the page can be installed. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>
}

/** What the start screen offers: the browser's dialog, the iOS steps, or nothing. */
export type InstallOffer = 'prompt' | 'ios' | 'none'

type Env = Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { readonly standalone?: boolean }

/** iPhone, iPod or iPad. iPadOS reports a Mac user agent, but a Mac has no touch screen. */
export function isIos (nav: Env): boolean {
  return /\b(iPhone|iPad|iPod)\b/.test(nav.userAgent) || (/\bMacintosh\b/.test(nav.userAgent) && nav.maxTouchPoints > 1)
}

/** True when the app already runs as an installed app, in its own window. */
export function isStandalone (win: Pick<Window, 'matchMedia'>, nav: Env): boolean {
  return nav.standalone === true || win.matchMedia('(display-mode: standalone)').matches
}

let deferred: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = (): void => { for (const l of listeners) l() }

/** Starts listening for the browser's install events. Call once, before the app mounts. */
export function watchInstall (): void {
  addEventListener('beforeinstallprompt', (e) => {
    // Keeps the browser's own mini bar away: the start screen shows a button instead.
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    notify()
  })
}

/** What to offer right now. */
export function installOffer (): InstallOffer {
  if (installed || isStandalone(window, navigator)) return 'none'
  if (deferred) return 'prompt'
  return isIos(navigator) ? 'ios' : 'none'
}

/** Calls `fn` whenever installOffer() may have changed. Returns the function that stops it. */
export function onInstallChange (fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Opens the browser's install dialog. The event can be used once, so it is dropped either way. */
export async function promptInstall (): Promise<void> {
  const e = deferred
  if (!e) return
  deferred = null
  notify()
  await e.prompt()
  if ((await e.userChoice).outcome === 'accepted') installed = true
  notify()
}
