// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { focusLost, rescueFocus, type FocusDoc } from '../../src/ui/focus-rescue.ts'

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
