// SPDX-License-Identifier: AGPL-3.0-or-later
// Loaded on demand by "Clear everything" (App.svelte finish()), so the start page does not carry the
// stats code (ADR 0029). Builds the session figures and opens the thanks page.

import { sessionStats, type SessionInput } from './session.ts'
import { openThanks } from './thanks-link.ts'

export function openThanksWith (input: SessionInput): void {
  openThanks(sessionStats(input))
}
