// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure helpers for the guide screen: citation numbering and what the app does with each element.

import type { ModelZones, ZoneId } from '../zones/types.ts'
import { GENERAL_RISK, type Cite, type Entry } from './entries.ts'
import type { SourceId } from './sources.ts'

/** Sources in order of first citation (general risks first, then entries), numbered from 1. */
export function sourceOrder (entries: readonly Entry[]): SourceId[] {
  const out: SourceId[] = []
  const add = (cites: readonly Cite[]): void => {
    for (const c of cites) if (!out.includes(c.src)) out.push(c.src)
  }
  add(GENERAL_RISK)
  for (const e of entries) {
    add(e.what)
    add(e.risk)
  }
  return out
}

export type AppState = 'mandatory' | 'hidden' | 'visible' | 'none'

/** What the editor does with an element by default: the strictest default among its zones. */
export function appState (doc: ModelZones, field: ZoneId | undefined): AppState {
  if (field === undefined) return 'none'
  const zones = doc.zones.filter((z) => z.id === field)
  if (zones.length === 0) return 'none'
  if (zones.some((z) => z.default === 'mandatory')) return 'mandatory'
  return zones.some((z) => z.default === 'hidden') ? 'hidden' : 'visible'
}

/** First entry of a document that a field links to (the editor's "About" button opens it). */
export function entryForField (entries: readonly Entry[], field: ZoneId): Entry | undefined {
  return entries.find((e) => e.field === field)
}
