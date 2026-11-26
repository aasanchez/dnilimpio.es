// SPDX-License-Identifier: AGPL-3.0-or-later
// Best-effort clean-up of memory that held photo pixels (spec §4.8). Pure: no DOM import, so the
// unit tests run it in Node.
//
// Limits, stated plainly: JavaScript cannot erase memory securely. Zeroing a typed array overwrites
// that buffer, but the browser, the graphics driver and the operating system may hold other copies
// (decoded images, GPU textures, swap). Shrinking a canvas lets the browser free its backing store
// sooner; it does not overwrite it. These steps shorten how long the data stays reachable; they do
// not guarantee it is gone.

/** A canvas, an OffscreenCanvas or anything else with a pixel size. */
export interface Sized { width: number; height: number }

/** Anything that can be overwritten with zeros: typed arrays, ImageData's data. */
export interface Fillable { fill: (value: number) => unknown }

/** Shrinks a canvas to 0 × 0, which drops its pixels. Does nothing for null or undefined. */
export function shrink (...canvases: ReadonlyArray<Sized | null | undefined>): void {
  for (const c of canvases) {
    if (!c) continue
    c.width = 0
    c.height = 0
  }
}

/** Overwrites each array with zeros. Does nothing for null or undefined. */
export function wipe (...arrays: ReadonlyArray<Fillable | null | undefined>): void {
  for (const a of arrays) a?.fill(0)
}
