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

/** The part of a box the reveal reads: a DOMRect fits. */
export interface Box { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number }

/**
 * How far to scroll so that a focused control is not hidden behind bars that stay on screen: the
 * sticky top bar, the sticky action bar on phones and the fixed no-cookies notice on wide screens
 * (WCAG 2.4.11). Positive scrolls down, negative scrolls up, 0 means no scroll. Only covers that
 * overlap the control count: one in the lower half of the window (`height` tall) pushes the control
 * up, one in the upper half pushes it down. The control never leaves the window on the other side.
 */
export function coverShift (target: Box, covers: readonly Box[], height: number, gap = 8): number {
  let down = 0
  let up = 0
  for (const c of covers) {
    if (!(c.top < target.bottom && c.bottom > target.top && c.left < target.right && c.right > target.left)) continue
    if (c.top + c.bottom > height) down = Math.max(down, target.bottom - c.top + gap)
    else up = Math.max(up, c.bottom - target.top + gap)
  }
  if (down > 0) return Math.max(0, Math.min(down, target.top - gap))
  const lift = Math.max(0, Math.min(up, height - target.bottom - gap))
  return lift === 0 ? 0 : -lift
}

/** Bars that stay on screen while the page scrolls. */
const COVERS = 'header, .actionbar, #privacy-notice'

/**
 * Keeps the focused control in view, clear of the bars that stay on screen. The browser scrolls a
 * focused control into the window, but not out from under a sticky or fixed bar. Controls inside a
 * bar, or in a dialog (drawn above everything), are left alone.
 */
export function revealFocus (signal?: AbortSignal): void {
  document.addEventListener('focusin', (e) => {
    const target = e.target
    if (!(target instanceof Element) || target.closest(`dialog, ${COVERS}`)) return
    requestAnimationFrame(() => {
      if (document.activeElement !== target) return
      // A cover counts while it, or the bar around it, stays on screen. The notice inside the phone's
      // action bar reaches above the bar's top edge, so it counts on its own.
      const stays = (c: Element): boolean => ['sticky', 'fixed'].includes(getComputedStyle(c).position)
      const covers = [...document.querySelectorAll(COVERS)]
        .filter((c) => {
          const bar = c.closest('.actionbar')
          return !c.contains(target) && (stays(c) || (bar !== null && stays(bar)))
        })
        .map((c) => c.getBoundingClientRect())
      const shift = coverShift((target.closest('label') ?? target).getBoundingClientRect(), covers, window.innerHeight)
      if (shift !== 0) window.scrollBy({ top: shift, behavior: 'instant' })
    })
  }, signal ? { signal } : undefined)
}
