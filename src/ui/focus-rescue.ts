// SPDX-License-Identifier: AGPL-3.0-or-later
// Keyboard focus must never fall back to the page. A button that disables itself (Undo at the end of
// the history, Delete once nothing is selected) or that leaves the page (the last "Choose a file")
// drops focus on <body>: a keyboard user then has to Tab again from the top, and a screen reader
// announces nothing. These helpers move focus to the next sensible control instead (WCAG 2.4.3).

/** The part of a document the helpers read: lets unit tests pass a stand-in. */
export interface FocusDoc { readonly activeElement: Element | null; readonly body: HTMLElement | null }

/** A control that can take focus, or nothing. */
export type Focusable = Pick<HTMLElement, 'focus'> | null | undefined

/** A control that may have just disabled or removed itself. */
export interface Leaving { readonly isConnected: boolean; readonly disabled?: boolean }

/**
 * True when no control holds focus: nothing, or the page body. Also true while focus still sits on
 * `from` after it was disabled or removed: the browser moves it to the body only at its next render.
 */
export function focusLost (doc: FocusDoc = document, from?: Leaving): boolean {
  const a = doc.activeElement
  if (a === null || a === doc.body) return true
  return from !== undefined && (a as unknown) === from && (from.disabled === true || !from.isConnected)
}

/**
 * If focus was lost, moves it to the first candidate that takes it (connected, shown, enabled).
 * Returns the control that got focus, or null when focus was not lost or no candidate took it.
 */
export function rescueFocus (candidates: readonly Focusable[], doc: FocusDoc = document, from?: Leaving): Focusable {
  if (!focusLost(doc, from)) return null
  for (const c of candidates) {
    if (!c) continue
    c.focus({ preventScroll: true })
    if ((doc.activeElement as unknown) === c) return c
  }
  return null
}

/**
 * Svelte attachment for a button that may disable or remove itself when used. After each click,
 * once the screen has updated, a lost focus goes to the first of `next()` that takes it.
 */
export function keepFocus (next: () => readonly Focusable[]): (node: HTMLButtonElement) => () => void {
  return (node) => {
    const onClick = (): void => { requestAnimationFrame(() => { rescueFocus(next(), document, node) }) }
    node.addEventListener('click', onClick)
    return () => { node.removeEventListener('click', onClick) }
  }
}

/** A control by its id, for the candidate lists above. */
export const byId = (id: string): HTMLElement | null => document.getElementById(id)
