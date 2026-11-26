// SPDX-License-Identifier: AGPL-3.0-or-later
// Fits the template field boxes to the text that OCR finds on the card (ADR 0019). Pure: template
// rectangles and word boxes in, new rectangles out, all in normalised card coordinates.
//
// The template positions come from one specimen; a real card can print a field a little elsewhere
// or longer. Each template box grows to take in the words that belong to it, so the copy never shows
// a sliver of the data. A box never shrinks and never moves away from where the template puts it,
// so the result covers at least what the template covers.

import { sideRects, type Placement } from './fields.ts'
import type { ModelZones, Rect, Side, ZoneId } from '../zones/types.ts'

/** A word belongs to a box when its centre lies within the box widened by these amounts. */
const REACH_X = 0.02 // share of the card's width
const REACH_Y = 0.15 // share of the box's height
/** Margin added around a word, as a share of its height (find.ts uses the same idea). */
const WORD_MARGIN = 0.25
/** A box grows by at most this share of its own size on each side. */
const MAX_GROWTH = 0.5
/** Changes smaller than this (share of the card) are ignored. */
const EPSILON = 0.002

const right = (r: Rect): number => r.x + r.w
const bottom = (r: Rect): number => r.y + r.h

/** True when the word's centre lies within `rect` widened by the reach, and the word is not much taller. */
function isNear (rect: Rect, w: Rect): boolean {
  const cx = w.x + w.w / 2
  const cy = w.y + w.h / 2
  // A word much taller than the box is a different line (or a whole block): not this field.
  if (w.h > rect.h * 2.5) return false
  return cx >= rect.x - REACH_X && cx <= right(rect) + REACH_X && cy >= rect.y - rect.h * REACH_Y && cy <= bottom(rect) + rect.h * REACH_Y
}

/** How far the word's centre is from the box, in box sizes: 0 inside its middle line. */
function distance (rect: Rect, w: Rect): number {
  const cx = w.x + w.w / 2
  const cy = w.y + w.h / 2
  const dx = Math.max(0, rect.x - cx, cx - right(rect)) / rect.w
  const dy = Math.abs(cy - (rect.y + rect.h / 2)) / rect.h
  return dx + dy
}

/** `rect` grown to take in the words whose centre lies near it. Returns `rect` itself when none do. */
export function fitRect (rect: Rect, words: readonly Rect[]): Rect {
  const near = words.filter((w) => isNear(rect, w))
  if (near.length === 0) return rect
  let x0 = rect.x
  let y0 = rect.y
  let x1 = right(rect)
  let y1 = bottom(rect)
  for (const w of near) {
    const m = w.h * WORD_MARGIN
    x0 = Math.min(x0, w.x - m)
    y0 = Math.min(y0, w.y - m)
    x1 = Math.max(x1, right(w) + m)
    y1 = Math.max(y1, bottom(w) + m)
  }
  // Bounded growth, inside the card.
  x0 = Math.max(0, rect.x - rect.w * MAX_GROWTH, x0)
  y0 = Math.max(0, rect.y - rect.h * MAX_GROWTH, y0)
  x1 = Math.min(1, right(rect) + rect.w * MAX_GROWTH, x1)
  y1 = Math.min(1, bottom(rect) + rect.h * MAX_GROWTH, y1)
  if (rect.x - x0 < EPSILON && rect.y - y0 < EPSILON && x1 - right(rect) < EPSILON && y1 - bottom(rect) < EPSILON) return rect
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * New positions for the boxes of one side that the words make grow, keyed like Placement. Each word
 * belongs to the one box it is nearest to, among every field on the side, so a box never grows over
 * the next line or over a field that stays visible. Only the fields in `only` are fitted: the ones
 * the user ticked to hide.
 */
export function fitSide (model: ModelZones, side: Side, words: readonly Rect[], only: ReadonlySet<ZoneId>): Placement {
  const rects = sideRects(model, side)
  const mine = new Map<string, Rect[]>()
  for (const w of words) {
    let best: { key: string; d: number } | null = null
    for (const { key, rect } of rects) {
      if (!isNear(rect, w)) continue
      const d = distance(rect, w)
      if (!best || d < best.d) best = { key, d }
    }
    if (best) mine.set(best.key, [...(mine.get(best.key) ?? []), w])
  }
  const out: Record<string, Rect> = {}
  for (const { key, id, rect } of rects) {
    const own = mine.get(key)
    if (!only.has(id) || !own) continue
    const fitted = fitRect(rect, own)
    if (fitted !== rect) out[key] = fitted
  }
  return out
}
