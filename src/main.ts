// SPDX-License-Identifier: AGPL-3.0-or-later
// First import: removes WebRTC before any other module (or library) runs.
import { isFramed } from './security/lockdown.ts'
import { mount } from 'svelte'
import App from './App.svelte'
import { blockStrayDrops } from './capture/input.ts'
import { loadExport } from './engine/load-export.ts'
import { registerServiceWorker } from './offline/register.ts'
import { watchForUpdates } from './offline/update.ts'
import { watchInstall } from './offline/install.ts'
import { installTrustedTypesPolicy } from './security/trusted-types.ts'
import { loadAllFonts } from './security/intake-lockdown.ts'
import { pickLang, t } from './i18n/index.ts'

/** Inside another page's frame the app does not start: it only offers to open itself in a tab. */
function showFramed (target: HTMLElement): void {
  const lang = pickLang(navigator.languages)
  const p = document.createElement('p')
  const a = document.createElement('a')
  a.href = location.href
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.textContent = t(lang, 'framed')
  p.append(a)
  target.replaceChildren(p)
}

// First, before any library can turn a string into a script URL.
installTrustedTypesPolicy()

// A file dropped by mistake must never replace the app (and the user's work) in the tab.
blockStrayDrops(window)

// Before mounting: Chromium can offer installation as soon as the page loads (offline/install.ts).
watchInstall()

const target = document.getElementById('app')
if (target && isFramed(window)) showFramed(target)
else if (target) mount(App, { target })

// Load the PDF code in the background once the page is idle: the first render does not wait for it,
// and it is ready before the review step. A failure here is retried when the user downloads.
const preload = (): void => {
  void loadExport().catch(() => undefined)
  // Every font face, before the photo step's policy allows none (ADR 0025), so Start does not wait.
  void loadAllFonts().catch(() => undefined)
}
if ('requestIdleCallback' in window) window.requestIdleCallback(preload, { timeout: 5000 })
else setTimeout(preload, 2000)

// Offline support: production builds only (the dev server has no worker and no CSP).
// A failure (private mode, file://, old browser) leaves the app working online.
// A new build is applied as soon as the page is idle and is the app's only tab (offline/update.ts).
if (import.meta.env.PROD) void registerServiceWorker().then(watchForUpdates).catch(() => undefined)
