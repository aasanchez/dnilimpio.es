// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  CARD_ASPECT, Coach, LIMITS, clippedShare, frameDiff, guideRect, laplacianVariance, measure, tipFor, toGray,
  type Gray, type Rect,
} from '../../src/capture/coach.ts'

const W = 480
const H = 320

/** Deterministic noise so tests do not depend on Math.random. */
function rng (seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

interface Scene {
  /** Card rectangle; omitted = no card. */
  card?: Rect
  /** Rotation of the card about its centre, degrees. */
  angle?: number
  cardLevel?: number
  background?: number
  /** Box blur radius applied to the whole frame. */
  blur?: number
  /** Bright spot (glare) radius in px at the card centre. */
  glare?: number
  /** Global brightness factor. */
  gain?: number
  /** Shift the whole scene by this many px (motion). */
  shift?: number
  seed?: number
}

/** A synthetic photo: noisy background, a light card with dark "text" lines. */
function scene (o: Scene = {}): Gray {
  const r = rng(o.seed ?? 1)
  const bg = o.background ?? 60
  const level = o.cardLevel ?? 200
  const data = new Uint8Array(W * H)
  const c = o.card
  const a = ((o.angle ?? 0) * Math.PI) / 180
  const cx = c ? c.x + c.w / 2 : 0
  const cy = c ? c.y + c.h / 2 : 0
  const shift = o.shift ?? 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = bg + (r() - 0.5) * 12
      if (c) {
        // Rotate the point into card coordinates.
        const dx = x - shift - cx
        const dy = y - cy
        const u = dx * Math.cos(-a) - dy * Math.sin(-a) + c.w / 2
        const w = dx * Math.sin(-a) + dy * Math.cos(-a) + c.h / 2
        if (u >= 0 && u < c.w && w >= 0 && w < c.h) {
          v = level + (r() - 0.5) * 6
          // "Text": short dark dashes on every 9th row band, in the middle of the card.
          if (u > c.w * 0.35 && u < c.w * 0.9 && w > c.h * 0.2 && w < c.h * 0.85 && Math.floor(w) % 9 < 2 && Math.floor(u / 7) % 3 !== 0) v = 40
          if (o.glare && Math.hypot(u - c.w / 2, w - c.h / 2) < o.glare) v = 255
        }
      }
      data[y * W + x] = Math.max(0, Math.min(255, Math.round(v * (o.gain ?? 1))))
    }
  }
  let g: Gray = { width: W, height: H, data }
  for (let i = 0; i < (o.blur ?? 0); i++) g = boxBlur(g)
  return g
}

function boxBlur (g: Gray): Gray {
  const out = new Uint8Array(g.data.length)
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      let s = 0
      let n = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const yy = y + dy
          const xx = x + dx
          if (yy < 0 || yy >= g.height || xx < 0 || xx >= g.width) continue
          s += g.data[yy * g.width + xx]!
          n++
        }
      }
      out[y * g.width + x] = Math.round(s / n)
    }
  }
  return { width: g.width, height: g.height, data: out }
}

const guide = guideRect(W, H)
const inGuide = guide
const scaled = (f: number): Rect => {
  const w = guide.w * f
  const h = guide.h * f
  return { x: (W - w) / 2, y: (H - h) / 2, w, h }
}

describe('guideRect', () => {
  it('is centred with the ID-1 aspect ratio and fits both dimensions', () => {
    for (const [w, h] of [[480, 320], [320, 480], [480, 200]] as const) {
      const g = guideRect(w, h)
      expect(g.w / g.h).toBeCloseTo(CARD_ASPECT, 6)
      expect(g.w).toBeLessThanOrEqual(w * LIMITS.guideFill + 1e-9)
      expect(g.h).toBeLessThanOrEqual(h * LIMITS.guideFill + 1e-9)
      expect(g.x * 2 + g.w).toBeCloseTo(w, 6)
      expect(g.y * 2 + g.h).toBeCloseTo(h, 6)
    }
  })
})

describe('toGray', () => {
  it('weights green the most and keeps white white', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 255, 0, 255, 255, 0, 0, 255])
    const g = toGray(rgba, 3, 1)
    expect(g.data[0]).toBe(255)
    expect(g.data[1]!).toBeGreaterThan(g.data[2]!)
  })
})

describe('metrics', () => {
  it('blur lowers the Laplacian variance', () => {
    const sharp = laplacianVariance(scene({ card: inGuide }), inGuide)
    const soft = laplacianVariance(scene({ card: inGuide, blur: 2 }), inGuide)
    expect(soft).toBeLessThan(sharp / 4)
  })
  it('counts clipped highlights', () => {
    expect(clippedShare(scene({ card: inGuide }), inGuide)).toBe(0)
    expect(clippedShare(scene({ card: inGuide, glare: 30 }), inGuide)).toBeGreaterThan(LIMITS.maxClipped)
  })
  it('frame difference is near zero for the same scene and large for a moved one', () => {
    const a = scene({ card: inGuide, seed: 1 })
    expect(frameDiff(a, scene({ card: inGuide, seed: 2 }))).toBeLessThan(LIMITS.maxMotion)
    expect(frameDiff(a, scene({ card: inGuide, shift: 40, seed: 2 }))).toBeGreaterThan(LIMITS.maxMotion)
    expect(frameDiff(a, { width: 1, height: 1, data: new Uint8Array(1) })).toBe(Infinity)
  })
})

describe('tipFor', () => {
  const tip = (o: Scene, prev: Gray | null = scene({ ...o, seed: 99 }), sharp = true): string => tipFor(measure(scene(o), prev), sharp)

  it('is ready for a card that fills the guide, lit, steady and sharp', () => {
    expect(tip({ card: inGuide })).toBe('ready')
    // A little smaller or larger than the guide still counts.
    expect(tip({ card: scaled(0.94) })).toBe('ready')
    expect(tip({ card: scaled(1.06) })).toBe('ready')
  })
  it('asks to fit the card when there is none, or it is off to one side', () => {
    expect(tip({})).toBe('frame')
    expect(tip({ card: { ...inGuide, x: inGuide.x + inGuide.w * 0.3 } })).toBe('frame')
  })
  it('asks to move closer when the card is small in the frame', () => {
    expect(tip({ card: scaled(0.6) })).toBe('closer')
  })
  it('flags a tilted card', () => {
    expect(tip({ card: scaled(0.95), angle: 7 })).toBe('tilt')
    expect(tip({ card: scaled(0.95), angle: 2 })).toBe('ready')
    expect(tip({ card: scaled(0.95), angle: 15 })).not.toBe('ready')
  })
  it('flags a dark picture', () => {
    expect(tip({ card: inGuide, gain: 0.2 })).toBe('dark')
  })
  it('flags glare', () => {
    expect(tip({ card: inGuide, glare: 30 })).toBe('glare')
  })
  it('flags movement', () => {
    expect(tip({ card: inGuide }, scene({ card: inGuide, shift: 30 }))).toBe('steady')
    expect(tip({ card: inGuide }, null)).toBe('steady')
  })
  it('flags blur when the caller says the frame is not sharp enough', () => {
    expect(tip({ card: inGuide }, undefined, false)).toBe('blur')
  })
})

describe('Coach', () => {
  it('shoots once after a few ready frames, then waits for the card to change', () => {
    const coach = new Coach()
    const shots: number[] = []
    let t = 0
    const step = (o: Scene, seed: number): string => {
      const a = coach.feed(scene({ ...o, seed }), t)
      if (a.shoot) shots.push(t)
      t += 125
      return a.tip
    }
    for (let i = 0; i < 6; i++) step({ card: inGuide }, i)
    expect(shots).toHaveLength(1)
    // Same card still in place long after: no second shot.
    for (let i = 0; i < 60; i++) step({ card: inGuide }, 100 + i)
    expect(shots).toHaveLength(1)
    // The card leaves the frame (flip), then comes back: one more shot.
    for (let i = 0; i < 3; i++) step({}, 200 + i)
    for (let i = 0; i < 6; i++) step({ card: inGuide }, 300 + i)
    expect(shots).toHaveLength(2)
  })

  it('does not shoot a blurred frame right after sharp ones', () => {
    const coach = new Coach()
    let t = 0
    // Not steady yet (first frame), but framed: sets the sharpness peak.
    coach.feed(scene({ card: inGuide, seed: 1 }), t)
    t += 125
    const tips: string[] = []
    for (let i = 0; i < 5; i++) {
      const a = coach.feed(scene({ card: inGuide, blur: 2, seed: 2 + i }), t)
      tips.push(a.tip)
      expect(a.shoot).toBe(false)
      t += 125
    }
    expect(tips).toContain('blur')
  })

  it('a manual shot also disarms the automatic one', () => {
    const coach = new Coach()
    coach.shotTaken(0)
    let shots = 0
    for (let i = 0; i < 40; i++) if (coach.feed(scene({ card: inGuide, seed: i }), 125 * (i + 1)).shoot) shots++
    expect(shots).toBe(0)
  })
})
