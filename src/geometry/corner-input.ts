// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure input maths of the corner editor (spec §4.2): screen to photo pixels, which corner a pointer
// grabs, where a drag or an arrow key puts it, canvas size and magnifier position. No DOM, so the
// unit tests run it in Node. src/ui/corner-editor.ts draws and wires the events.

import type { Point, Quad } from './homography.ts'
import { moveCorner, nearestCorner } from './quad-edit.ts'

export type PointerKind = 'touch' | 'pen' | 'mouse'

/** Hit radius in CSS pixels. Touch gets a larger target than a mouse (WCAG 2.5.5). */
export const HIT_R: Readonly<Record<PointerKind, number>> = { touch: 36, pen: 24, mouse: 18 }

/** Pointer kind for the hit radius. Unknown types count as a mouse, the smallest target. */
export function pointerKind (pointerType: string): PointerKind {
  return pointerType === 'touch' || pointerType === 'pen' ? pointerType : 'mouse'
}

export interface Scales {
  /** Canvas pixels per CSS pixel. */
  readonly cssToCanvas: number;
  /** Photo (source) pixels per CSS pixel. */
  readonly cssToSrc: number;
}

/** Scale factors from the canvas's laid-out CSS width. A zero width (hidden canvas) counts as 1. */
export function scales (cssWidth: number, canvasWidth: number, srcWidth: number): Scales {
  const w = cssWidth > 0 ? cssWidth : 1
  return { cssToCanvas: canvasWidth / w, cssToSrc: srcWidth / w }
}

/** A pointer position in CSS pixels of the viewport, mapped to photo pixels. */
export function toSource (clientX: number, clientY: number, left: number, top: number, cssToSrc: number): Point {
  return { x: (clientX - left) * cssToSrc, y: (clientY - top) * cssToSrc }
}

/** Index of the corner a pointer of this kind grabs at `p`, or null when it is too far from all four. */
export function pickCorner (q: Quad, p: Point, kind: PointerKind, cssToSrc: number): number | null {
  return nearestCorner(q, p, HIT_R[kind] * cssToSrc)
}

export interface GrabOffset { readonly dx: number; readonly dy: number }

/** Offset from the pointer to the grabbed corner, kept during the drag so the corner does not jump. */
export function grabOffset (corner: Point, p: Point): GrabOffset {
  return { dx: corner.x - p.x, dy: corner.y - p.y }
}

/** The quad after corner `i` follows the pointer at `p`, with the grab offset, clamped to the photo. */
export function dragCorner (q: Quad, i: number, p: Point, grab: GrabOffset, width: number, height: number): Quad {
  return moveCorner(q, i, { x: p.x + grab.dx, y: p.y + grab.dy }, width, height)
}

/**
 * Where an arrow key moves corner `c`: one CSS pixel, or ten with Shift, in photo pixels.
 * Null for any other key. The caller clamps with moveCorner.
 */
export function arrowTarget (c: Point, key: string, shift: boolean, cssToSrc: number): Point | null {
  const step = (shift ? 10 : 1) * cssToSrc
  switch (key) {
    case 'ArrowLeft': return { x: c.x - step, y: c.y }
    case 'ArrowRight': return { x: c.x + step, y: c.y }
    case 'ArrowUp': return { x: c.x, y: c.y - step }
    case 'ArrowDown': return { x: c.x, y: c.y + step }
    default: return null
  }
}

/** The corner after `active` in the order TL, TR, BR, BL; `back` (Shift+N) goes the other way. */
export function nextCorner (active: number, back: boolean): number {
  return (active + (back ? 3 : 1)) % 4
}

/**
 * Canvas size in device pixels: the photo scaled to fit `maxW` × `maxH` CSS pixels, at `dpr`.
 * Null when there is no width to fit in yet (not laid out). Never smaller than 1 × 1.
 */
export function canvasSize (srcW: number, srcH: number, maxW: number, maxH: number, dpr: number): { width: number; height: number } | null {
  if (maxW <= 0) return null
  const d = dpr || 1
  const s = Math.min(maxW / srcW, maxH / srcH)
  return { width: Math.max(1, Math.round(srcW * s * d)), height: Math.max(1, Math.round(srcH * s * d)) }
}

/**
 * Centre of the magnifier, radius `r`, in canvas pixels: top corner on the side away from the
 * dragged corner at x = `atX`, so the finger never hides it.
 */
export function loupeCentre (atX: number, canvasWidth: number, r: number, margin: number): Point {
  const left = atX > canvasWidth / 2
  return { x: left ? margin + r : canvasWidth - margin - r, y: margin + r }
}
