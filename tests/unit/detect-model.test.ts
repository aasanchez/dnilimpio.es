// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { MIN_SCORE, modelDetection } from '../../src/detect/result.ts'

// A card covering the middle of a 1000 × 800 photo, as the model reports it (0 to 1).
const CARD = [0.2, 0.25, 0.8, 0.25, 0.8, 0.75, 0.2, 0.75]
const SURE = 4 // logit: sigmoid(4) ≈ 0.98

describe('modelDetection', () => {
  it('maps normalised corners to image pixels', () => {
    const d = modelDetection(CARD, SURE, 1000, 800)
    expect(d?.source).toBe('model')
    expect(d?.score).toBeCloseTo(0.982, 3)
    expect(d?.quad).toEqual([{ x: 200, y: 200 }, { x: 800, y: 200 }, { x: 800, y: 600 }, { x: 200, y: 600 }])
  })
  it('drops answers below the confidence threshold', () => {
    expect(modelDetection(CARD, -1, 1000, 800)).toBeNull()
    expect(modelDetection(CARD, Math.log(MIN_SCORE / (1 - MIN_SCORE)) + 0.01, 1000, 800)).not.toBeNull()
    expect(modelDetection(CARD, Number.NaN, 1000, 800)).toBeNull()
  })
  it('drops crossed, tiny, far-outside or malformed quads', () => {
    expect(modelDetection([0.2, 0.25, 0.8, 0.75, 0.8, 0.25, 0.2, 0.75], SURE, 1000, 800)).toBeNull() // bow tie
    expect(modelDetection([0.5, 0.5, 0.52, 0.5, 0.52, 0.52, 0.5, 0.52], SURE, 1000, 800)).toBeNull() // tiny
    expect(modelDetection([-0.3, 0.25, 0.8, 0.25, 0.8, 0.75, 0.2, 0.75], SURE, 1000, 800)).toBeNull()
    expect(modelDetection(CARD.slice(0, 6), SURE, 1000, 800)).toBeNull()
    expect(modelDetection([Number.NaN, ...CARD.slice(1)], SURE, 1000, 800)).toBeNull()
    expect(modelDetection(CARD, SURE, 0, 800)).toBeNull()
  })
  it('clamps corners slightly outside the photo onto its edge', () => {
    const d = modelDetection([-0.02, 0.25, 1.03, 0.25, 0.8, 0.75, 0.2, 0.75], SURE, 1000, 800)
    expect(d?.quad[0]).toEqual({ x: 0, y: 200 })
    expect(d?.quad[1]).toEqual({ x: 1000, y: 200 })
  })
})
