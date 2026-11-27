// SPDX-License-Identifier: AGPL-3.0-or-later
// The session part of the opt-in usage stats (ADR 0029), built from the app's state when the person
// taps "Send anonymous data". Only ids, yes/no answers and small counts: nothing read from the
// document, no text (not even the watermark's), no position on the photo. The one position is where
// the person moved a cover box on the straightened card, in coarse steps (ADR 0047).

import { choiceOf, type DocChoice } from '../zones/documents.ts'
import type { DocModel, ModelZones, Rect, ZoneId } from '../zones/types.ts'
import { zoneKey, type Placement } from '../engine/fields.ts'
import { shortSha } from '../version/build-info.ts'
import { FIELDS, toSteps, type AiResult, type MovedBox, type PhotoSource, type SessionStats, type StatsField, type StatsLang } from './schema.ts'

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
  /** OCR read a photo in this session (detection, Find my data or Fit to the text): src/ocr/ran.ts. */
  readonly ocr: boolean
  /** The document's zones, as the editor placed them by default. */
  readonly zones: ModelZones
  /** The boxes the person moved or resized (EditState.placement), in normalised card coordinates. */
  readonly placement: Placement
  /** Keys of `placement` set by hand, not by Fit to the text (EditState.handPlaced). */
  readonly handPlaced: readonly string[]
}

const steps = (r: Rect): [number, number, number, number] => [toSteps(r.x), toSteps(r.y), toSteps(r.w), toSteps(r.h)]

/**
 * The boxes of covered fields moved by hand, in MOVED_STEPS steps. Left out: a box placed by Fit to
 * the text (it hugs the words OCR read), a box whose steps equal its default's (not moved by a
 * visible amount), and fields outside FIELDS (name, DNI/NIE number).
 * A box's number counts all of its field's boxes in zone order, front and back, so a field printed
 * on both sides (the support number on the DNI) gets a different number on each.
 */
export function movedBoxes (zones: ModelZones, placement: Placement, hidden: readonly ZoneId[], handPlaced: readonly string[]): MovedBox[] {
  const out: MovedBox[] = []
  const count = new Map<string, number>()
  zones.zones.forEach((z, zi) => {
    z.rects.forEach((r, ri) => {
      const rect = count.get(z.id) ?? 0
      count.set(z.id, rect + 1)
      const field = FIELDS.find((f) => f === z.id)
      if (field === undefined || !hidden.includes(z.id)) return
      const key = zoneKey(zi, ri)
      const moved = placement[key]
      if (moved === undefined || !handPlaced.includes(key)) return
      const [x, y, w, h] = steps(moved)
      if ([x, y, w, h].join() === steps(r).join()) return
      out.push({ field, rect, x, y, w, h })
    })
  })
  return out
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
    ocr: i.ocr,
    moved: movedBoxes(i.zones, i.placement, i.hidden, i.handPlaced),
  }
}
