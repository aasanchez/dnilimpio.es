// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { coverShift, focusLost, rescueFocus, type FocusDoc } from '../../src/ui/focus-rescue.ts'

/** A stand-in page: `focus()` works only on enabled, connected controls, as in a browser. */
function page () {
  const body = { tag: 'body' } as unknown as HTMLElement
  const doc: { activeElement: Element | null; body: HTMLElement | null } = { activeElement: body, body }
  const control = (name: string, { disabled = false, isConnected = true } = {}) => {
    const c = {
      name,
      disabled,
      isConnected,
      focus () { if (!c.disabled && c.isConnected) doc.activeElement = c as unknown as Element },
    }
    return c
  }
  return { doc: doc as FocusDoc & typeof doc, body, control }
}

describe('focusLost', () => {
  it('is true when the body or nothing holds focus', () => {
    const { doc } = page()
    expect(focusLost(doc)).toBe(true)
    doc.activeElement = null
    expect(focusLost(doc)).toBe(true)
  })

  it('is false while an enabled control holds focus', () => {
    const { doc, control } = page()
    const b = control('b')
    b.focus()
    expect(focusLost(doc)).toBe(false)
    expect(focusLost(doc, b)).toBe(false)
  })

  it('is true while focus still sits on a control that disabled or removed itself', () => {
    const { doc, control } = page()
    const b = control('b')
    b.focus()
    b.disabled = true
    expect(focusLost(doc, b)).toBe(true)
    b.disabled = false
    b.isConnected = false
    expect(focusLost(doc, b)).toBe(true)
    // Without `from`, the same state does not count: another control may have taken focus on purpose.
    expect(focusLost(doc)).toBe(false)
  })
})

describe('rescueFocus', () => {
  it('focuses the first candidate that takes focus, skipping missing and disabled ones', () => {
    const { doc, control } = page()
    const off = control('off', { disabled: true })
    const gone = control('gone', { isConnected: false })
    const ok = control('ok')
    expect(rescueFocus([null, undefined, off, gone, ok], doc)).toBe(ok)
    expect(doc.activeElement).toBe(ok)
  })

  it('does nothing while a control holds focus', () => {
    const { doc, control } = page()
    const held = control('held')
    const other = control('other')
    held.focus()
    expect(rescueFocus([other], doc)).toBeNull()
    expect(doc.activeElement).toBe(held)
  })

  it('moves focus away from a control that disabled itself', () => {
    const { doc, control } = page()
    const undo = control('undo')
    const redo = control('redo')
    undo.focus()
    undo.disabled = true
    expect(rescueFocus([redo], doc, undo)).toBe(redo)
  })

  it('returns null when no candidate takes focus', () => {
    const { doc, control } = page()
    expect(rescueFocus([control('x', { disabled: true })], doc)).toBeNull()
    expect(doc.activeElement).toBe(doc.body)
  })
})

describe('coverShift', () => {
  const H = 800
  const box = (top: number, bottom: number, left = 0, right = 400) => ({ top, bottom, left, right })
  const bottomBar = box(700, 800)
  const topBar = box(0, 60)

  it('is 0 when no cover overlaps the control', () => {
    expect(coverShift(box(300, 340), [topBar, bottomBar], H)).toBe(0)
    // Beside a cover, not under it.
    expect(coverShift(box(720, 760, 500, 600), [bottomBar], H)).toBe(0)
  })

  it('scrolls down to lift a control out from under a bar at the bottom', () => {
    expect(coverShift(box(720, 760), [bottomBar], H)).toBe(760 - 700 + 8)
  })

  it('treats a tall cover in the lower half as a bottom bar, even with the control in its lower part', () => {
    // The wide-screen notice: 520 to 700, a link at 630 to 660.
    expect(coverShift(box(630, 660), [box(520, 700)], H)).toBe(660 - 520 + 8)
  })

  it('scrolls up to bring a control out from under the top bar', () => {
    expect(coverShift(box(20, 60), [topBar], H)).toBe(-(60 - 20 + 8))
  })

  it('takes the largest shift when several covers overlap', () => {
    expect(coverShift(box(720, 760), [bottomBar, box(650, 800)], H)).toBe(760 - 650 + 8)
  })

  it('never pushes the control out of the window on the other side', () => {
    // A control taller than the room above the bar: its top stops at the gap.
    expect(coverShift(box(50, 760), [bottomBar], H)).toBe(50 - 8)
    expect(coverShift(box(20, 790), [topBar], H)).toBe(-2)
  })
})
