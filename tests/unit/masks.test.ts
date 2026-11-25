// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { MIN_SIZE, fromPoints, grow, hitTest, isUsable, move, resize } from '../../src/engine/masks.ts'
import { HISTORY_LIMIT, canRedo, canUndo, commit, redo, start, undo } from '../../src/engine/history.ts'

const close = (a: object, b: object): void => {
  for (const [k, v] of Object.entries(b)) expect((a as Record<string, number>)[k]).toBeCloseTo(v as number, 9)
}

describe('manual boxes', () => {
  it('builds a box from two points in any order and clamps it to the card', () => {
    close(fromPoints({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 }), { x: 0.2, y: 0.1, w: 0.4, h: 0.4 })
    close(fromPoints({ x: -0.2, y: 0.5 }, { x: 1.3, y: 1.1 }), { x: 0, y: 0.5, w: 1, h: 0.5 })
    expect(isUsable(fromPoints({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }))).toBe(false)
  })
  it('moves a box without letting it leave the card', () => {
    close(move({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0.1, -0.05), { x: 0.2, y: 0.05 })
    close(move({ x: 0.9, y: 0.9, w: 0.2, h: 0.1 }, 0.5, 0.5), { x: 0.8, y: 0.9 })
    close(move({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, -1, -1), { x: 0, y: 0 })
  })
  it('resizes from a corner with the opposite corner fixed, and refuses to collapse', () => {
    const r = { x: 0.2, y: 0.2, w: 0.2, h: 0.2 }
    close(resize(r, 'se', { x: 0.5, y: 0.6 }), { x: 0.2, y: 0.2, w: 0.3, h: 0.4 })
    close(resize(r, 'nw', { x: 0.1, y: 0.1 }), { x: 0.1, y: 0.1, w: 0.3, h: 0.3 })
    // Dragging past the opposite corner flips the box instead of producing a negative size.
    close(resize(r, 'se', { x: 0.1, y: 0.1 }), { x: 0.1, y: 0.1, w: 0.1, h: 0.1 })
    expect(resize(r, 'se', { x: 0.2, y: 0.2 })).toBe(r)
  })
  it('grows from the keyboard within limits', () => {
    close(grow({ x: 0.9, y: 0.1, w: 0.05, h: 0.05 }, 0.5, -1), { w: 0.1, h: MIN_SIZE })
  })
  it('hits the selected box handles first, then the topmost box', () => {
    const boxes = [{ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, { x: 0.3, y: 0.3, w: 0.2, h: 0.2 }]
    expect(hitTest(boxes, null, { x: 0.35, y: 0.35 }, 0.01)).toEqual({ index: 1, handle: null })
    expect(hitTest(boxes, 0, { x: 0.105, y: 0.1 }, 0.01)).toEqual({ index: 0, handle: 'nw' })
    expect(hitTest(boxes, null, { x: 0.9, y: 0.9 }, 0.01)).toBeNull()
  })
})

describe('history', () => {
  it('undoes and redoes, and a new change drops the redo branch', () => {
    let h = start(0)
    h = commit(h, 1)
    h = commit(h, 2)
    h = undo(h)
    expect(h.present).toBe(1)
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present).toBe(2)
    h = undo(undo(h))
    expect(h.present).toBe(0)
    expect(canUndo(h)).toBe(false)
    expect(undo(h)).toBe(h)
    h = commit(redo(h), 5)
    expect(h.present).toBe(5)
    expect(canRedo(h)).toBe(false)
  })
  it('keeps at most HISTORY_LIMIT steps', () => {
    let h = start(0)
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
  })
})
