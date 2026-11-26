// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { fitRect, fitSide } from '../../src/engine/snap.ts'
import { sideRects } from '../../src/engine/fields.ts'
import { DNI_4_0 } from '../../src/zones/dni.ts'
import type { Rect } from '../../src/zones/types.ts'

const box: Rect = { x: 0.4, y: 0.5, w: 0.2, h: 0.05 }
const covers = (outer: Rect, inner: Rect): boolean =>
  outer.x <= inner.x + 1e-9 && outer.y <= inner.y + 1e-9 && outer.x + outer.w >= inner.x + inner.w - 1e-9 && outer.y + outer.h >= inner.y + inner.h - 1e-9

describe('fitRect', () => {
  it('returns the same box when no word is near', () => {
    expect(fitRect(box, [{ x: 0.05, y: 0.1, w: 0.1, h: 0.04 }])).toBe(box)
    expect(fitRect(box, [])).toBe(box)
  })
  it('returns the same box when the words already lie inside it', () => {
    expect(fitRect(box, [{ x: 0.45, y: 0.51, w: 0.05, h: 0.02 }])).toBe(box)
  })
  it('grows to cover a word that runs past the right edge, with a margin', () => {
    const word = { x: 0.5, y: 0.51, w: 0.15, h: 0.03 }
    const r = fitRect(box, [word])
    expect(covers(r, box)).toBe(true)
    expect(covers(r, word)).toBe(true)
    expect(r.x + r.w).toBeCloseTo(0.65 + 0.03 * 0.25)
  })
  it('follows a field printed a little lower than the template', () => {
    const word = { x: 0.41, y: 0.52, w: 0.15, h: 0.05 }
    const r = fitRect(box, [word])
    expect(covers(r, box)).toBe(true)
    expect(covers(r, word)).toBe(true)
  })
  it('never shrinks the box', () => {
    const r = fitRect(box, [{ x: 0.55, y: 0.51, w: 0.1, h: 0.02 }])
    expect(covers(r, box)).toBe(true)
  })
  it('ignores a word much taller than the box (another block)', () => {
    expect(fitRect(box, [{ x: 0.45, y: 0.3, w: 0.1, h: 0.45 }])).toBe(box)
  })
  it('grows by at most half its size on each side, and stays on the card', () => {
    const r = fitRect(box, [{ x: 0.45, y: 0.5, w: 0.3, h: 0.05 }])
    expect(r.x + r.w).toBeCloseTo(0.7)
    const edge = { x: 0.9, y: 0.9, w: 0.1, h: 0.08 }
    const e = fitRect(edge, [{ x: 0.92, y: 0.93, w: 0.2, h: 0.06 }])
    expect(e.x + e.w).toBeLessThanOrEqual(1)
    expect(e.y + e.h).toBeLessThanOrEqual(1)
  })
})

describe('fitSide', () => {
  const front = sideRects(DNI_4_0, 'front')
  const target = front.find((r) => r.id === 'expiryDate')
  if (!target) throw new Error('DNI 4.0 front has no expiry date')
  const word = { x: target.rect.x + target.rect.w * 0.5, y: target.rect.y, w: target.rect.w * 0.8, h: target.rect.h * 0.8 }

  it('fits only the ticked fields, keyed like the placement', () => {
    const out = fitSide(DNI_4_0, 'front', [word], new Set(['expiryDate']))
    expect(Object.keys(out)).toEqual([target.key])
    const fitted = out[target.key]
    expect(fitted && covers(fitted, target.rect)).toBe(true)
    expect(fitted && covers(fitted, word)).toBe(true)
  })
  it('leaves unticked fields alone', () => {
    expect(fitSide(DNI_4_0, 'front', [word], new Set(['signature']))).toEqual({})
  })
  it('gives a word between two fields only to the nearer one', () => {
    const issue = front.find((r) => r.id === 'issueDate')
    const support = front.find((r) => r.id === 'supportNumber')
    if (!issue || !support) throw new Error('DNI 4.0 front lacks the issue date or support number')
    // A support number printed a little high: its centre sits near the bottom of the issue date box.
    const h = support.rect.h * 0.6
    const w = { x: support.rect.x, y: issue.rect.y + issue.rect.h - h * 0.4, w: support.rect.w * 0.9, h }
    const out = fitSide(DNI_4_0, 'front', [w], new Set(['issueDate', 'supportNumber']))
    expect(Object.keys(out)).toEqual([support.key])
  })
  it('does not grow a ticked box over a field that stays visible', () => {
    const birth = front.find((r) => r.id === 'dateOfBirth')
    if (!birth) throw new Error('DNI 4.0 front has no date of birth')
    const w = { x: birth.rect.x, y: birth.rect.y + birth.rect.h * 0.3, w: birth.rect.w * 0.9, h: birth.rect.h * 0.5 }
    expect(fitSide(DNI_4_0, 'front', [w], new Set(['expiryDate', 'issueDate', 'supportNumber', 'can', 'signature']))).toEqual({})
  })
})
