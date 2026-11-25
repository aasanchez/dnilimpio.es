// SPDX-License-Identifier: AGPL-3.0-or-later
// Editing choices (spec §12, §14, §15). Held in memory only and cleared by Reset (spec §20).

import { defaultHidden } from '../engine/fields.ts'
import { DNI_4_0, type ZoneId } from '../zones/dni.ts'

export interface EditState {
  /** Fields to hide: a field in this list is masked on every side where it appears. */
  hidden: ZoneId[];
  watermark: string;
  greyscale: boolean;
}

export function emptyEditState (): EditState {
  return { hidden: [...defaultHidden(DNI_4_0)], watermark: '', greyscale: false }
}
