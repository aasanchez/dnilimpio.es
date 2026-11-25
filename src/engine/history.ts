// SPDX-License-Identifier: AGPL-3.0-or-later
// Undo/redo for editor snapshots (spec §12, §13). Snapshots are replaced, never mutated, so a stored
// state cannot change behind the stack's back. Held in memory only; Reset drops it.

export interface History<T> { readonly past: readonly T[]; readonly present: T; readonly future: readonly T[] }

/** Most undo steps kept. Older ones are dropped. */
export const HISTORY_LIMIT = 100

export function start<T> (present: T): History<T> {
  return { past: [], present, future: [] }
}

/** Records a new state. A change after an undo discards the redo branch. */
export function commit<T> (h: History<T>, next: T): History<T> {
  if (Object.is(next, h.present)) return h
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] }
}

export function undo<T> (h: History<T>): History<T> {
  const prev = h.past.at(-1)
  if (prev === undefined) return h
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] }
}

export function redo<T> (h: History<T>): History<T> {
  const next = h.future[0]
  if (next === undefined) return h
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) }
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0
