// SPDX-License-Identifier: AGPL-3.0-or-later
// Entry of the thanks page (thanks.html, ADR 0029). First import: removes WebRTC, as on the app page.
import { isFramed } from '../security/lockdown.ts'
import { mount } from 'svelte'
import Thanks from './Thanks.svelte'
import { readFragment } from './fragment.ts'

const target = document.getElementById('app')
// The fragment is read once and removed from the address at once: the figures do not stay in the
// browser's history, and a reload shows the page without them.
const session = readFragment(location.hash)
history.replaceState(null, '', location.pathname + location.search)
if (target && !isFramed(window)) mount(Thanks, { target, props: { session } })
