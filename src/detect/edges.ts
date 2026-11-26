// SPDX-License-Identifier: AGPL-3.0-or-later
// Automatic card edge detection with classic image processing: no model, no library, no network.
//   1. Downscale to at most WORK_PX on the long side and convert to greyscale.
//   2. Sobel gradients; keep the strongest edge pixels.
//   3. Hough transform: vote for straight lines (angle, distance).
//   4. Take the strongest distinct lines, pair roughly parallel ones, and combine two pairs into
//      four-sided candidates.
//   5. Score each candidate by how much of its outline lies on real edges and how close its shape is
//      to the document's aspect ratio. Return the best one, in the input image's pixels, or null.
// Pure TypeScript on RGBA buffers, so it runs in Node tests, on the main thread or in a worker.

import { isConvex, type Point, type Quad } from '../geometry/homography.ts'

export interface RGBA { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }

/** ID-1 card (DNI, TIE): 85.60 × 53.98 mm. Other documents pass their own ratio. */
export const ID1_ASPECT = 85.6 / 53.98

export interface DetectOptions {
  /** Width / height of the document, landscape (≥ 1). Default: ID-1. */
  readonly aspect?: number
}

export interface Detection {
  /** Corners in input pixels, clockwise from the top-left of the card as seen in the photo. */
  readonly quad: Quad
  /** 0–1: share of the outline on strong edges, reduced by shape mismatch. */
  readonly confidence: number
}

/** Long side of the working image. Enough for corners within ~1 % and fast on phones. */
export const WORK_PX = 400
/** Below this confidence, detect() returns null and the user places the corners. */
export const MIN_CONFIDENCE = 0.45

const THETA_BINS = 180
const MAX_LINES = 16

interface Grey { readonly w: number; readonly h: number; readonly v: Float32Array }
interface Line { readonly theta: number; readonly rho: number; readonly votes: number }

/** Box-filter downscale to fit WORK_PX, with BT.601 luma. */
export function toWorkGrey (img: RGBA, maxSide = WORK_PX): { grey: Grey; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const v = new Float32Array(w * h)
  const n = new Float32Array(w * h)
  const d = img.data
  for (let y = 0; y < img.height; y++) {
    const ty = Math.min(h - 1, Math.floor(y * scale))
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4
      const t = ty * w + Math.min(w - 1, Math.floor(x * scale))
      v[t] = (v[t] ?? 0) + 0.299 * (d[o] ?? 0) + 0.587 * (d[o + 1] ?? 0) + 0.114 * (d[o + 2] ?? 0)
      n[t] = (n[t] ?? 0) + 1
    }
  }
  for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / Math.max(1, n[i] ?? 1)
  return { grey: { w, h, v }, scale }
}

/** Sobel gradient magnitude after a 3 × 3 box blur. */
export function gradient (g: Grey): Float32Array {
  const { w, h, v } = g
  const b = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      let c = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy
          const xx = x + dx
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue
          s += v[yy * w + xx] ?? 0
          c++
        }
      }
      b[y * w + x] = s / c
    }
  }
  const mag = new Float32Array(w * h)
  const at = (x: number, y: number): number => b[y * w + x] ?? 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
      mag[y * w + x] = Math.hypot(gx, gy)
    }
  }
  return mag
}

/** Threshold that keeps roughly the strongest `share` of non-zero gradient pixels. */
function strongThreshold (mag: Float32Array, share = 0.12): number {
  let max = 0
  for (const m of mag) if (m > max) max = m
  if (max === 0) return Infinity
  const bins = new Uint32Array(256)
  let count = 0
  for (const m of mag) {
    if (m <= 0) continue
    bins[Math.min(255, Math.floor((m / max) * 255))]!++
    count++
  }
  let acc = 0
  for (let i = 255; i >= 0; i--) {
    acc += bins[i]!
    if (acc >= count * share) return Math.max((i / 255) * max, max * 0.08)
  }
  return max * 0.08
}

/** Hough lines (normal form x·cosθ + y·sinθ = ρ), strongest first, with near-duplicates removed. */
export function houghLines (mag: Float32Array, w: number, h: number, maxLines = MAX_LINES): Line[] {
  const thr = strongThreshold(mag)
  const diag = Math.ceil(Math.hypot(w, h))
  const rhoBins = 2 * diag + 1
  const acc = new Float32Array(THETA_BINS * rhoBins)
  const cos = Float64Array.from({ length: THETA_BINS }, (_, t) => Math.cos((t * Math.PI) / THETA_BINS))
  const sin = Float64Array.from({ length: THETA_BINS }, (_, t) => Math.sin((t * Math.PI) / THETA_BINS))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((mag[y * w + x] ?? 0) < thr) continue
      for (let t = 0; t < THETA_BINS; t++) {
        const r = Math.round(x * cos[t]! + y * sin[t]!) + diag
        acc[t * rhoBins + r]! += 1
      }
    }
  }
  const peaks: Line[] = []
  for (let t = 0; t < THETA_BINS; t++) {
    for (let r = 0; r < rhoBins; r++) {
      const v = acc[t * rhoBins + r]!
      if (v < Math.min(w, h) * 0.15) continue
      peaks.push({ theta: (t * Math.PI) / THETA_BINS, rho: r - diag, votes: v })
    }
  }
  peaks.sort((a, b) => b.votes - a.votes)
  const out: Line[] = []
  const minRho = Math.max(4, Math.min(w, h) * 0.04)
  for (const p of peaks) {
    if (out.some((q) => sameLine(p, q, minRho))) continue
    out.push(p)
    if (out.length >= maxLines) break
  }
  return out
}

const angleDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % Math.PI
  return Math.min(d, Math.PI - d)
}

function sameLine (a: Line, b: Line, minRho: number): boolean {
  if (angleDiff(a.theta, b.theta) > (6 * Math.PI) / 180) return false
  // θ near 0 and near π describe the same direction with opposite ρ.
  const flipped = Math.abs(a.theta - b.theta) > Math.PI / 2
  return Math.abs(a.rho - (flipped ? -b.rho : b.rho)) < minRho
}

function intersect (a: Line, b: Line): Point | null {
  const ca = Math.cos(a.theta)
  const sa = Math.sin(a.theta)
  const cb = Math.cos(b.theta)
  const sb = Math.sin(b.theta)
  const det = ca * sb - sa * cb
  if (Math.abs(det) < 1e-6) return null
  return { x: (a.rho * sb - b.rho * sa) / det, y: (ca * b.rho - cb * a.rho) / det }
}

/** Orders four points clockwise, starting with the one closest to the top-left. */
export function orderQuad (pts: readonly Point[]): Quad {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const sorted = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
  let start = 0
  sorted.forEach((p, i) => { if (p.x + p.y < sorted[start]!.x + sorted[start]!.y) start = i })
  const r = [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]!)
  return [r[0]!, r[1]!, r[2]!, r[3]!]
}

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Share of sample points along the outline that sit on a strong edge (within 1 px). */
function edgeSupport (q: Quad, mag: Float32Array, w: number, h: number, thr: number): number {
  let hit = 0
  let total = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]!
    const b = q[(i + 1) % 4]!
    const n = Math.max(8, Math.round(dist(a, b)))
    for (let k = 1; k < n; k++) {
      const x = Math.round(a.x + ((b.x - a.x) * k) / n)
      const y = Math.round(a.y + ((b.y - a.y) * k) / n)
      total++
      let best = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) best = Math.max(best, mag[yy * w + xx] ?? 0)
        }
      }
      if (best >= thr) hit++
    }
  }
  return total === 0 ? 0 : hit / total
}

/** Aspect ratio (≥ 1) of a quad from the mean lengths of its opposite sides. */
export function quadAspect (q: Quad): number {
  const a = (dist(q[0], q[1]) + dist(q[2], q[3])) / 2
  const b = (dist(q[1], q[2]) + dist(q[3], q[0])) / 2
  const lo = Math.min(a, b)
  return lo === 0 ? Infinity : Math.max(a, b) / lo
}

function area (q: Quad): number {
  let s = 0
  for (let i = 0; i < 4; i++) s += q[i]!.x * q[(i + 1) % 4]!.y - q[(i + 1) % 4]!.x * q[i]!.y
  return Math.abs(s) / 2
}

/**
 * Finds the document's four corners in a photo. Returns null when no convincing card outline is
 * found (low contrast with the background, card cut off, heavy clutter): the user then places the
 * corners by hand, as today.
 */
export function detectCard (img: RGBA, opts: DetectOptions = {}): Detection | null {
  const aspect = Math.max(1, opts.aspect ?? ID1_ASPECT)
  const { grey, scale } = toWorkGrey(img)
  const mag = gradient(grey)
  try {
    return bestOutline(img, grey, mag, scale, aspect)
  } finally {
    // The grey copy of the photo and its gradient are not needed once the outline is chosen.
    grey.v.fill(0)
    mag.fill(0)
  }
}

/** The best four-sided outline on the grey copy, in the input image's pixels, or null. */
function bestOutline (img: RGBA, grey: Grey, mag: Float32Array, scale: number, aspect: number): Detection | null {
  const { w, h } = grey
  const thr = strongThreshold(mag)
  const lines = houghLines(mag, w, h)
  const margin = Math.max(w, h) * 0.02
  const inside = (p: Point): boolean => p.x >= -margin && p.y >= -margin && p.x <= w + margin && p.y <= h + margin

  // Pairs of roughly parallel lines, at least 15 % of the short side apart.
  const pairs: Array<[Line, Line]> = []
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!
      const b = lines[j]!
      if (angleDiff(a.theta, b.theta) > (25 * Math.PI) / 180) continue
      const flipped = Math.abs(a.theta - b.theta) > Math.PI / 2
      if (Math.abs(a.rho - (flipped ? -b.rho : b.rho)) < Math.min(w, h) * 0.15) continue
      pairs.push([a, b])
    }
  }

  let best: { quad: Quad; score: number } | null = null
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [a1, a2] = pairs[i]!
      const [b1, b2] = pairs[j]!
      if (angleDiff(a1.theta, b1.theta) < (50 * Math.PI) / 180) continue
      const pts = [intersect(a1, b1), intersect(a1, b2), intersect(a2, b2), intersect(a2, b1)]
      if (pts.some((p) => p === null || !inside(p))) continue
      const quad = orderQuad(pts as Point[])
      if (!isConvex(quad) || area(quad) < w * h * 0.08) continue
      const support = edgeSupport(quad, mag, w, h, thr)
      const shape = Math.min(1, Math.abs(Math.log(quadAspect(quad) / aspect)) / Math.log(1.6))
      const score = support * (1 - 0.6 * shape) * (0.85 + 0.15 * Math.min(1, area(quad) / (w * h * 0.5)))
      if (!best || score > best.score) best = { quad, score }
    }
  }
  if (!best || best.score < MIN_CONFIDENCE) return null
  const clamp = (p: Point): Point => ({
    x: Math.min(img.width, Math.max(0, p.x / scale)),
    y: Math.min(img.height, Math.max(0, p.y / scale)),
  })
  const q = best.quad
  return { quad: [clamp(q[0]), clamp(q[1]), clamp(q[2]), clamp(q[3])], confidence: Math.min(1, best.score) }
}
