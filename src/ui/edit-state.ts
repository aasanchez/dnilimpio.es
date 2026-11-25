// SPDX-License-Identifier: AGPL-3.0-or-later
// Editing choices (spec §12, §14, §15). Held in memory only and cleared by Reset (spec §20).

import { defaultHidden } from '../engine/fields.ts'
import { start, type History } from '../engine/history.ts'
import type { ModelZones, Rect, Side, ZoneId } from '../zones/types.ts'

/** Screen inside step 3: choosing what to hide, reviewing the result, or done after the download. */
export type Phase = 'edit' | 'review' | 'done'

/** Extra black boxes per side, in normalised card coordinates. */
export type Boxes = Readonly<Record<Side, readonly Rect[]>>

export interface EditState {
  /** Fields to hide: a field in this list is masked on every side where it appears. */
  hidden: ZoneId[];
  watermark: string;
  greyscale: boolean;
  /** Manual boxes with their undo/redo history. */
  boxes: History<Boxes>;
}

/** Fresh choices for one document: its recommended fields hidden, no boxes, no watermark. */
export function emptyEditState (model: ModelZones): EditState {
  return { hidden: [...defaultHidden(model)], watermark: '', greyscale: false, boxes: start<Boxes>({ front: [], back: [] }) }
}
