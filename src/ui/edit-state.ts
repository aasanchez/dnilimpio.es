// SPDX-License-Identifier: AGPL-3.0-or-later
// Editing choices (spec §12, §14, §15). Held in memory only and cleared by Reset (spec §20).

import { defaultHidden, type Placement } from '../engine/fields.ts'
import { start, type History } from '../engine/history.ts'
import { DEFAULT_WATERMARK_STYLE } from '../engine/watermark.ts'
import type { ModelZones, Rect, Side, ZoneId } from '../zones/types.ts'

/** Screen inside step 3: choosing what to hide, reviewing the result, or done after the download. */
export type Phase = 'edit' | 'review' | 'done'

/** Extra black boxes per side, in normalised card coordinates. */
export type Boxes = Readonly<Record<Side, readonly Rect[]>>

export interface EditState {
  /** Fields to hide: a field in this list is masked on every side where it appears. */
  hidden: ZoneId[];
  watermark: string;
  /** Watermark text size, as a multiple of the default size. */
  watermarkScale: number;
  /** Watermark opacity, 0 to 1 (1 is solid black). */
  watermarkOpacity: number;
  greyscale: boolean;
  /** Manual boxes with their undo/redo history. */
  boxes: History<Boxes>;
  /** Field boxes the user moved or resized from the template position (memory only, Reset clears it). */
  placement: Placement;
}

/** Fresh choices for one document: its recommended fields hidden, no boxes, no watermark. */
export function emptyEditState (model: ModelZones): EditState {
  return { hidden: [...defaultHidden(model)], watermark: '', watermarkScale: DEFAULT_WATERMARK_STYLE.scale, watermarkOpacity: DEFAULT_WATERMARK_STYLE.opacity, greyscale: false, boxes: start<Boxes>({ front: [], back: [] }), placement: {} }
}
