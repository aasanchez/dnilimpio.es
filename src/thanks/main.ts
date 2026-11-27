// SPDX-License-Identifier: AGPL-3.0-or-later
// Entry of the thanks page (thanks.html, ADR 0029). First import: removes WebRTC, as on the app page.
import { isFramed } from '../security/lockdown.ts'
import { mount } from 'svelte'
import Thanks from './Thanks.svelte'
import { readFragment } from './fragment.ts'
import { idleAnswer } from '../offline/update-rules.ts'

const target = document.getElementById('app')
// The fragment is read once and removed from the address at once: the figures do not stay in the
// browser's history, and a reload shows the page without them.
const session = readFragment(location.hash)
history.replaceState(null, '', location.pathname + location.search)
if (target && !isFramed(window)) mount(Thanks, { target, props: { session } })

// A waiting new build asks each window whether it is idle before it takes over (src/offline/takeover.ts,
// ADR 0030). This page holds no photo and has already loaded all its files, so it always is. Without
// this answer an open thanks page would count as a window that cannot answer and hold updates back.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<unknown>) => {
    const port = e.ports[0]
    const answer = idleAnswer(e.data, true)
    if (answer && port) port.postMessage(answer)
  })
  navigator.serviceWorker.startMessages()
}
