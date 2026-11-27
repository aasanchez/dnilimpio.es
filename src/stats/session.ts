// SPDX-License-Identifier: AGPL-3.0-or-later
// The session part of the opt-in usage stats (ADR 0029), built from the app's state when the person
// presses "Clear everything". Only ids, yes/no answers and small counts: nothing read from the
// document, no position, no text (not even the watermark's).

import { choiceOf, type DocChoice } from '../zones/documents.ts'
import type { DocModel, ZoneId } from '../zones/types.ts'
import { shortSha } from '../version/build-info.ts'
import { FIELDS, type AiResult, type PhotoSource, type SessionStats, type StatsField, type StatsLang } from './schema.ts'

/** What document detection answered: the document it read, 'none' (read, no answer), 'off' (could not run). */
export type DetectOutcome = DocChoice | 'none' | 'off'

/** How one photo reached the app. */
export type PhotoVia = 'camera' | 'file' | 'paste'

export interface SessionInput {
  readonly doc: DocModel
  readonly outcome: DetectOutcome | null
  readonly back: boolean
  readonly hidden: readonly ZoneId[]
  readonly boxes: number
  readonly watermark: string
  readonly greyscale: boolean
  readonly lang: StatsLang
  /** Full commit SHA of the build, or '' when unknown. */
  readonly sha: string
  readonly via: readonly PhotoVia[]
}

export function aiResult (doc: DocModel, outcome: DetectOutcome | null): AiResult {
  if (outcome === null || outcome === 'off') return 'off'
  if (outcome === 'none') return 'none'
  return outcome === choiceOf(doc) ? 'right' : 'wrong'
}

export function photoSource (via: readonly PhotoVia[]): PhotoSource {
  const kinds = [...new Set(via)]
  return kinds.length === 1 && kinds[0] !== undefined ? kinds[0] : kinds.length === 0 ? 'file' : 'mixed'
}

export function sessionStats (i: SessionInput): SessionStats {
  return {
    doc: i.doc,
    ai: aiResult(i.doc, i.outcome),
    back: i.back,
    fields: FIELDS.filter((f): f is StatsField => (i.hidden as readonly string[]).includes(f)),
    boxes: i.boxes,
    mark: i.watermark.trim() !== '',
    grey: i.greyscale,
    lang: i.lang,
    app: i.sha === '' ? 'dev' : shortSha(i.sha),
    src: photoSource(i.via),
    ocr: i.outcome !== null && i.outcome !== 'off',
  }
}
