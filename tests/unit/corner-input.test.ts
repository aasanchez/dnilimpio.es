// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { isConvex, type Quad } from '../../src/geometry/homography.ts'
import {
  arrowTarget, canvasSize, dragCorner, grabOffset, HIT_R, loupeCentre, nextCorner, pickCorner, pointerKind, scales, toSource,
} from '../../src/geometry/corner-input.ts'
import { leaveSide } from '../../src/ui/align-state.ts'

// A 1000 × 600 photo shown 500 CSS pixels wide: 2 photo pixels per CSS pixel.
const W = 1000
const H = 600
const q: Quad = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 500 }, { x: 100, y: 500 }]

describe('pointerKind and hit radius', () => {
  it('keeps touch and pen, and treats every other type as a mouse', () => {
    expect(pointerKind('touch')).toBe('touch')
    expect(pointerKind('pen')).toBe('pen')
    expect(pointerKind('mouse')).toBe('mouse')
    expect(pointerKind('')).toBe('mouse')
    expect(pointerKind('stylus')).toBe('mouse')
  })

  it('gives touch the largest target (at least 44 CSS pixels across) and a mouse the smallest', () => {
    expect(HIT_R.touch).toBeGreaterThan(HIT_R.pen)
    expect(HIT_R.pen).toBeGreaterThan(HIT_R.mouse)
    expect(HIT_R.touch * 2).toBeGreaterThanOrEqual(44)
  })
})

describe('scales and toSource', () => {
  it('maps CSS pixels to canvas and photo pixels', () => {
    expect(scales(500, 1000, W)).toEqual({ cssToCanvas: 2, cssToSrc: 2 })
    expect(scales(500, 1500, W)).toEqual({ cssToCanvas: 3, cssToSrc: 2 })
  })

  it('does not divide by zero for a canvas with no width yet', () => {
    const s = scales(0, 300, W)
    expect(s).toEqual({ cssToCanvas: 300, cssToSrc: W })
    expect(Number.isFinite(s.cssToSrc)).toBe(true)
  })

  it('subtracts the canvas position and scales to photo pixels', () => {
    expect(toSource(60, 45, 10, 20, 2)).toEqual({ x: 100, y: 50 })
    expect(toSource(10, 20, 10, 20, 2)).toEqual({ x: 0, y: 0 })
  })

  it('gives negative or out-of-photo points when the pointer is outside the canvas', () => {
    expect(toSource(0, 0, 10, 20, 2)).toEqual({ x: -20, y: -40 })
  })
})

describe('pickCorner', () => {
  it('grabs the nearest corner within the radius of the pointer kind', () => {
    // 15 CSS px from the top-left corner = 30 photo px.
    expect(pickCorner(q, { x: 130, y: 100 }, 'mouse', 2)).toBe(0)
    expect(pickCorner(q, { x: 880, y: 490 }, 'touch', 2)).toBe(2)
  })

  it('misses with a mouse where a finger still hits', () => {
    // 30 CSS px away: beyond the mouse radius (18), inside the touch radius (36).
    const p = { x: 100, y: 160 }
    expect(pickCorner(q, p, 'mouse', 2)).toBeNull()
    expect(pickCorner(q, p, 'pen', 2)).toBeNull()
    expect(pickCorner(q, p, 'touch', 2)).toBe(0)
  })

  it('scales the radius with the zoom: the same CSS distance always hits', () => {
    for (const cssToSrc of [0.5, 1, 4]) {
      const p = { x: 100 + 17 * cssToSrc, y: 100 }
      expect(pickCorner(q, p, 'mouse', cssToSrc)).toBe(0)
      expect(pickCorner(q, { x: 100 + 19 * cssToSrc, y: 100 }, 'mouse', cssToSrc)).toBeNull()
    }
  })

  it('picks the closer corner when two are in range', () => {
    const tight: Quad = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]
    expect(pickCorner(tight, { x: 14, y: 1 }, 'touch', 1)).toBe(1)
    expect(pickCorner(tight, { x: 4, y: 18 }, 'touch', 1)).toBe(3)
  })
})

describe('drag with grab offset', () => {
  it('keeps the corner where it was on the first move: no jump under the finger', () => {
    const p = { x: 120, y: 110 }
    const grab = grabOffset(q[0], p)
    expect(grab).toEqual({ dx: -20, dy: -10 })
    expect(dragCorner(q, 0, p, grab, W, H)).toEqual(q)
  })

  it('moves the corner by the pointer movement and leaves the other three', () => {
    const grab = grabOffset(q[2], { x: 905, y: 495 })
    const next = dragCorner(q, 2, { x: 855, y: 445 }, grab, W, H)
    expect(next[2]).toEqual({ x: 850, y: 450 })
    expect([next[0], next[1], next[3]]).toEqual([q[0], q[1], q[3]])
    expect(q[2]).toEqual({ x: 900, y: 500 }) // input not mutated
  })

  it('clamps to the photo when the finger leaves it', () => {
    const grab = grabOffset(q[1], q[1])
    expect(dragCorner(q, 1, { x: 5000, y: -300 }, grab, W, H)[1]).toEqual({ x: W, y: 0 })
    expect(dragCorner(q, 3, { x: -1, y: 601 }, grab, W, H)[3]).toEqual({ x: 0, y: H })
  })
})

describe('arrowTarget', () => {
  const c = { x: 500, y: 300 }

  it('moves one CSS pixel per arrow, in photo pixels', () => {
    expect(arrowTarget(c, 'ArrowLeft', false, 2)).toEqual({ x: 498, y: 300 })
    expect(arrowTarget(c, 'ArrowRight', false, 2)).toEqual({ x: 502, y: 300 })
    expect(arrowTarget(c, 'ArrowUp', false, 2)).toEqual({ x: 500, y: 298 })
    expect(arrowTarget(c, 'ArrowDown', false, 2)).toEqual({ x: 500, y: 302 })
  })

  it('moves ten times as far with Shift', () => {
    expect(arrowTarget(c, 'ArrowLeft', true, 2)).toEqual({ x: 480, y: 300 })
    expect(arrowTarget(c, 'ArrowDown', true, 0.5)).toEqual({ x: 500, y: 305 })
  })

  it('ignores every other key, including names of object properties', () => {
    for (const key of ['n', 'Enter', 'Tab', ' ', 'arrowleft', 'toString', 'constructor', '__proto__']) {
      expect(arrowTarget(c, key, false, 2)).toBeNull()
    }
  })
})

describe('nextCorner', () => {
  it('cycles TL, TR, BR, BL forward and back', () => {
    expect([0, 1, 2, 3].map((i) => nextCorner(i, false))).toEqual([1, 2, 3, 0])
    expect([0, 1, 2, 3].map((i) => nextCorner(i, true))).toEqual([3, 0, 1, 2])
  })

  it('returns to the start after four steps', () => {
    let a = 2
    for (let i = 0; i < 4; i++) a = nextCorner(a, false)
    expect(a).toBe(2)
  })
})

describe('canvasSize', () => {
  it('fits the width when the photo is wide', () => {
    expect(canvasSize(W, H, 500, 1000, 1)).toEqual({ width: 500, height: 300 })
  })

  it('fits the height when the photo is tall', () => {
    expect(canvasSize(600, 1000, 500, 400, 1)).toEqual({ width: 240, height: 400 })
  })

  it('multiplies by the device pixel ratio and treats 0 as 1', () => {
    expect(canvasSize(W, H, 500, 1000, 2)).toEqual({ width: 1000, height: 600 })
    expect(canvasSize(W, H, 500, 1000, 0)).toEqual({ width: 500, height: 300 })
  })

  it('keeps the photo aspect ratio within a pixel', () => {
    const s = canvasSize(4032, 3024, 357, 460, 3)
    expect(s).not.toBeNull()
    expect(Math.abs((s?.width ?? 0) / (s?.height ?? 1) - 4032 / 3024)).toBeLessThan(0.01)
  })

  it('is null before layout and never below 1 × 1', () => {
    expect(canvasSize(W, H, 0, 400, 1)).toBeNull()
    expect(canvasSize(W, H, -5, 400, 1)).toBeNull()
    expect(canvasSize(10_000, 10, 1, 0.0001, 1)).toEqual({ width: 1, height: 1 })
  })
})

describe('loupeCentre', () => {
  it('sits in the top corner away from the dragged corner, inside the canvas', () => {
    expect(loupeCentre(900, 1000, 64, 12)).toEqual({ x: 76, y: 76 })
    expect(loupeCentre(100, 1000, 64, 12)).toEqual({ x: 924, y: 76 })
  })

  it('goes right when the corner is exactly in the middle', () => {
    expect(loupeCentre(500, 1000, 64, 12).x).toBe(924)
  })
})

describe('leaveSide (switching front and back)', () => {
  it('saves moved, valid corners and marks the side done', () => {
    expect(leaveSide(true, true, false)).toEqual({ save: true, done: true })
    expect(leaveSide(true, true, true)).toEqual({ save: true, done: true })
  })

  it('does not save crossed corners and marks the side not done, even if it was', () => {
    expect(leaveSide(true, false, false)).toEqual({ save: false, done: false })
    expect(leaveSide(true, false, true)).toEqual({ save: false, done: false })
  })

  it('leaves untouched corners as they were: a default frame never counts as confirmed', () => {
    expect(leaveSide(false, true, false)).toEqual({ save: false, done: false })
    expect(leaveSide(false, true, true)).toEqual({ save: false, done: true })
    expect(leaveSide(false, false, true)).toEqual({ save: false, done: true })
  })

  it('matches isConvex: a dragged corner that crosses an edge makes the side not done', () => {
    const grab = grabOffset(q[0], q[0])
    const crossed = dragCorner(q, 0, { x: 950, y: 550 }, grab, W, H)
    expect(isConvex(crossed)).toBe(false)
    expect(leaveSide(true, isConvex(crossed), true).done).toBe(false)
    const moved = dragCorner(q, 0, { x: 150, y: 120 }, grab, W, H)
    expect(isConvex(moved)).toBe(true)
    expect(leaveSide(true, isConvex(moved), false)).toEqual({ save: true, done: true })
  })
})
