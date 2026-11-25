// SPDX-License-Identifier: AGPL-3.0-or-later
import { mount } from 'svelte'
import App from './App.svelte'
import { loadExport } from './engine/load-export.ts'
import { registerServiceWorker } from './offline/register.ts'

const target = document.getElementById('app')
if (target) mount(App, { target })

// Load the PDF code in the background once the page is idle: the first render does not wait for it,
// and it is ready before the review step. A failure here is retried when the user downloads.
const preload = (): void => { void loadExport().catch(() => undefined) }
if ('requestIdleCallback' in window) window.requestIdleCallback(preload, { timeout: 5000 })
else setTimeout(preload, 2000)

// Offline support: production builds only (the dev server has no worker and no CSP).
// A failure (private mode, file://, old browser) leaves the app working online.
if (import.meta.env.PROD) void registerServiceWorker().catch(() => undefined)
