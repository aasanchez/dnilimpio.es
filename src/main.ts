// SPDX-License-Identifier: AGPL-3.0-or-later
import { mount } from 'svelte'
import App from './App.svelte'
import { loadExport } from './engine/load-export.ts'

const target = document.getElementById('app')
if (target) mount(App, { target })

// Load the PDF code in the background once the page is idle: the first render does not wait for it,
// and it is ready before the review step. A failure here is retried when the user downloads.
const preload = (): void => { void loadExport().catch(() => undefined) }
if ('requestIdleCallback' in window) window.requestIdleCallback(preload, { timeout: 5000 })
else setTimeout(preload, 2000)
