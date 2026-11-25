// SPDX-License-Identifier: AGPL-3.0-or-later
// Capture coach: classical image metrics on live camera frames, no model and no network.
// Everything here is pure (no DOM), so it runs the same online and offline and is unit tested.
//
// Each analysed frame is a small greyscale copy of the camera image. On it we measure, inside an
// on-screen guide frame shaped like an ID-1 card (85.6 × 54 mm):
// - framing: are there four straight card edges near the guide's four sides (and how far inside)?
// - tilt: does the top or bottom edge slope?
// - exposure: mean brightness (too dark) and clipped highlights (glare);
// - sharpness: variance of the Laplacian, compared with the best value seen in the last seconds;
// - steadiness: mean difference from the previous frame.
// The coach turns these into one tip at a time and says when to take the shot by itself.

/** ID-1 card aspect ratio (width / height): DNI, TIE, driving licence, bank card. */
export const CARD_ASPECT = 85.6 / 54

export interface Gray { readonly width: number; readonly height: number; readonly data: Uint8Array }
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** One tip at a time, in priority order. `ready` means hold still: the shot is about to happen. */
export type Tip = 'frame' | 'closer' | 'tilt' | 'dark' | 'glare' | 'steady' | 'blur' | 'ready'

/** Tunable limits. Values are for frames about 480 px on the long side. */
export const LIMITS = {
  /** Guide size: the card frame takes this share of the image's width (or height, if that is tighter). */
  guideFill: 0.84,
  /** Mean luminance (0–255) inside the guide below this is too dark. */
  minMean: 50,
  /** Share of guide pixels at or above `clipLevel` that counts as glare. */
  maxClipped: 0.015,
  clipLevel: 250,
  /** Absolute floor for Laplacian variance; below this the image is blurred whatever else happens. */
  minSharpness: 20,
  /** Sharp enough when at least this share of the best sharpness in the recent window. */
  peakRatio: 0.8,
  peakWindowMs: 2500,
  /** Mean absolute difference from the previous frame (0–255) above this means the phone moves. */
  maxMotion: 6,
  /** Share of a guide side's length that must show a strong edge to count as the card edge. */
  edgeCoverage: 0.55,
  /** Gradient (0–255) that counts as an edge pixel. */
  edgeGradient: 18,
  /** Card edges may sit this share of the guide outside it, and this share inside it, to count as framed. */
  outside: 0.08,
  inside: 0.12,
  /** Search depth inside the guide for an edge (beyond `inside` means "move closer"). */
  searchInside: 0.3,
  /** Slope of the top or bottom edge, in degrees, above which the card is tilted. */
  maxTiltDeg: 4,
  /** Frames in a row with every check passed before the automatic shot. */
  readyFrames: 3,
  /**
   * After a shot, wait at least this long, and for the card to leave the frame or move a lot (the
   * flip to the other side), before the next automatic shot. No timer re-arms it: a card left in
   * place must never be shot twice as both sides.
   */
  cooldownMs: 1500,
} as const
export type Limits = typeof LIMITS

/** The card guide, centred in a `width` × `height` image. */
export function guideRect (width: number, height: number, fill: number = LIMITS.guideFill): Rect {
  let w = width * fill
  let h = w / CARD_ASPECT
  if (h > height * fill) {
    h = height * fill
    w = h * CARD_ASPECT
  }
  return { x: (width - w) / 2, y: (height - h) / 2, w, h }
}

/** RGBA (from canvas getImageData) to luminance, Rec. 601 weights in integers. */
export function toGray (rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = ((rgba[p] ?? 0) * 77 + (rgba[p + 1] ?? 0) * 150 + (rgba[p + 2] ?? 0) * 29) >> 8
  }
  return { width, height, data }
}

/** Integer pixel bounds of `r`, clamped to the image. */
function bounds (g: Gray, r: Rect): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.max(0, Math.round(r.x)),
    y0: Math.max(0, Math.round(r.y)),
    x1: Math.min(g.width, Math.round(r.x + r.w)),
    y1: Math.min(g.height, Math.round(r.y + r.h)),
  }
}

export function meanLuma (g: Gray, r: Rect): number {
  const { x0, y0, x1, y1 } = bounds(g, r)
  let sum = 0
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += (g.data[y * g.width + x] ?? 0); n++ }
  return n === 0 ? 0 : sum / n
}

/** Share of pixels in `r` at or above `level` (blown-out highlights). */
export function clippedShare (g: Gray, r: Rect, level: number = LIMITS.clipLevel): number {
  const { x0, y0, x1, y1 } = bounds(g, r)
  let hit = 0
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if ((g.data[y * g.width + x] ?? 0) >= level) hit++; n++ }
  return n === 0 ? 0 : hit / n
}

/** Variance of the 4-neighbour Laplacian inside `r`: high for crisp detail, low for blur. */
export function laplacianVariance (g: Gray, r: Rect): number {
  const { x0, y0, x1, y1 } = bounds(g, r)
  const w = g.width
  const d = g.data
  let sum = 0
  let sq = 0
  let n = 0
  for (let y = Math.max(1, y0); y < Math.min(g.height - 1, y1); y++) {
    for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x++) {
      const i = y * w + x
      const v = (d[i - w] ?? 0) + (d[i + w] ?? 0) + (d[i - 1] ?? 0) + (d[i + 1] ?? 0) - 4 * (d[i] ?? 0)
      sum += v
      sq += v * v
      n++
    }
  }
  if (n === 0) return 0
  const mean = sum / n
  return sq / n - mean * mean
}

/** Mean absolute difference between two frames of the same size; Infinity if sizes differ. */
export function frameDiff (a: Gray, b: Gray): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity
  let sum = 0
  // Every second pixel in each direction is plenty for motion.
  let n = 0
  for (let y = 0; y < a.height; y += 2) {
    for (let x = 0; x < a.width; x += 2) {
      const i = y * a.width + x
      sum += Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0))
      n++
    }
  }
  return n === 0 ? 0 : sum / n
}

type Side = 'top' | 'bottom' | 'left' | 'right'

/**
 * Looks for a straight edge parallel to one side of the guide, over the span [from, to) of that
 * side (0–1 along it). Scans from outside the guide inwards and returns the first line where at
 * least `edgeCoverage` of the span shows a strong gradient across it, as an inset (share of the
 * guide's size; negative = outside the guide), or null if there is none.
 * Each position along the span may match within ±3 px, so a slightly tilted edge still counts.
 */
export function findEdge (g: Gray, guide: Rect, side: Side, from = 0.1, to = 0.9, limits: Limits = LIMITS): number | null {
  const horizontal = side === 'top' || side === 'bottom'
  const across = horizontal ? guide.h : guide.w // the direction we scan
  const along0 = horizontal ? guide.x + guide.w * from : guide.y + guide.h * from
  const along1 = horizontal ? guide.x + guide.w * to : guide.y + guide.h * to
  const start = Math.round(across * -limits.outside * 1.25)
  const end = Math.round(across * limits.searchInside)
  const pos = (inset: number): number => {
    switch (side) {
      case 'top': return Math.round(guide.y) + inset
      case 'bottom': return Math.round(guide.y + guide.h) - inset
      case 'left': return Math.round(guide.x) + inset
      case 'right': return Math.round(guide.x + guide.w) - inset
    }
  }
  const limit = horizontal ? g.height : g.width
  const grad = (p: number, q: number): number => {
    // Gradient across the edge at line p, position q along it.
    if (p < 1 || p >= limit - 1) return 0
    const d = g.data
    return horizontal
      ? Math.abs((d[(p + 1) * g.width + q] ?? 0) - (d[(p - 1) * g.width + q] ?? 0))
      : Math.abs((d[q * g.width + p + 1] ?? 0) - (d[q * g.width + p - 1] ?? 0))
  }
  const q0 = Math.max(0, Math.round(along0))
  const q1 = Math.min(horizontal ? g.width : g.height, Math.round(along1))
  if (q1 - q0 < 4) return null
  // Strong-gradient mask per line, computed once.
  const lines: Uint8Array[] = []
  for (let inset = start - 3; inset <= end + 3; inset++) {
    const p = pos(inset)
    const row = new Uint8Array(q1 - q0)
    for (let q = q0; q < q1; q++) row[q - q0] = grad(p, q) >= limits.edgeGradient ? 1 : 0
    lines.push(row)
  }
  for (let inset = start; inset <= end; inset++) {
    const k = inset - start + 3
    let hits = 0
    for (let j = 0; j < q1 - q0; j++) {
      for (let dk = -3; dk <= 3; dk++) {
        if (lines[k + dk]?.[j] === 1) { hits++; break }
      }
    }
    if (hits / (q1 - q0) >= limits.edgeCoverage) {
      // Refine: within the ±3 window, the line with the most edge pixels is the edge itself.
      let best = inset
      let bestCount = -1
      for (let dk = 0; dk <= 3 && inset + dk <= end + 3; dk++) {
        let c = 0
        for (const v of lines[k + dk] ?? []) c += v
        if (c > bestCount) { bestCount = c; best = inset + dk }
      }
      return best / across
    }
  }
  return null
}

export interface Framing {
  /** Insets per side (share of guide size, negative = outside), null where no edge was found. */
  readonly insets: Readonly<Record<Side, number | null>>
  /** Slope of the card's long edges in degrees (0 when unknown). */
  readonly tiltDeg: number
}

export function measureFraming (g: Gray, guide: Rect, limits: Limits = LIMITS): Framing {
  const insets = {
    top: findEdge(g, guide, 'top', 0.1, 0.9, limits),
    bottom: findEdge(g, guide, 'bottom', 0.1, 0.9, limits),
    left: findEdge(g, guide, 'left', 0.15, 0.85, limits),
    right: findEdge(g, guide, 'right', 0.15, 0.85, limits),
  }
  // Tilt: the same long edge measured on short stretches near both ends. Short, so that even a
  // clearly sloped edge stays within the ±3 px tolerance on each stretch.
  let tiltDeg = 0
  for (const side of ['top', 'bottom'] as const) {
    const a = findEdge(g, guide, side, 0.06, 0.2, limits)
    const b = findEdge(g, guide, side, 0.8, 0.94, limits)
    if (a === null || b === null) continue
    const rise = (b - a) * guide.h
    const run = guide.w * 0.74
    const deg = Math.abs(Math.atan2(rise, run) * 180 / Math.PI)
    tiltDeg = Math.max(tiltDeg, deg)
  }
  return { insets, tiltDeg }
}

export interface Metrics {
  readonly framing: Framing
  readonly mean: number
  readonly clipped: number
  readonly sharpness: number
  /** Mean difference from the previous frame; Infinity for the first frame. */
  readonly motion: number
}

export function measure (g: Gray, prev: Gray | null, limits: Limits = LIMITS): Metrics {
  const guide = guideRect(g.width, g.height, limits.guideFill)
  // Exposure and sharpness inside the guide, a little inset so the background does not count.
  const inner: Rect = { x: guide.x + guide.w * 0.06, y: guide.y + guide.h * 0.08, w: guide.w * 0.88, h: guide.h * 0.84 }
  return {
    framing: measureFraming(g, guide, limits),
    mean: meanLuma(g, inner),
    clipped: clippedShare(g, inner, limits.clipLevel),
    sharpness: laplacianVariance(g, inner),
    motion: prev ? frameDiff(g, prev) : Infinity,
  }
}

/**
 * The single most useful tip for these metrics, ignoring sharpness history.
 * `sharpEnough` is decided by the caller (the Coach compares against recent peaks).
 */
export function tipFor (m: Metrics, sharpEnough: boolean, limits: Limits = LIMITS): Tip {
  const { insets, tiltDeg } = m.framing
  // A sloped card also hides its full-length edges, so tilt comes before framing.
  if (tiltDeg > limits.maxTiltDeg) return 'tilt'
  const found = Object.values(insets).filter((v): v is number => v !== null)
  if (found.length < 4) {
    // Two opposite edges found well inside the guide: the card is small in the frame.
    const deepV = insets.top !== null && insets.bottom !== null && insets.top > limits.inside && insets.bottom > limits.inside
    const deepH = insets.left !== null && insets.right !== null && insets.left > limits.inside && insets.right > limits.inside
    return deepV || deepH ? 'closer' : 'frame'
  }
  if (found.every((v) => v > limits.inside) || found.filter((v) => v > limits.inside).length >= 3) return 'closer'
  if (found.some((v) => v > limits.inside || v < -limits.outside)) return 'frame'
  if (m.mean < limits.minMean) return 'dark'
  if (m.clipped > limits.maxClipped) return 'glare'
  if (m.motion > limits.maxMotion) return 'steady'
  if (!sharpEnough) return 'blur'
  return 'ready'
}

export interface Advice { readonly tip: Tip; readonly shoot: boolean; readonly metrics: Metrics }

/**
 * Stateful coach for one camera session. Feed it frames; it answers with a tip and, when the card
 * has been framed, lit, steady and sharp for a few frames in a row, `shoot: true` (once).
 */
export class Coach {
  private prev: Gray | null = null
  private peaks: { t: number; v: number }[] = []
  private readyRun = 0
  private lastShot = -Infinity
  private armed = true
  private readonly limits: Limits

  constructor (limits: Limits = LIMITS) {
    this.limits = limits
  }

  /** Call after any shot, automatic or manual, so the next automatic one waits for a new card. */
  shotTaken (now: number): void {
    this.lastShot = now
    this.armed = false
    this.readyRun = 0
    this.peaks = []
  }

  feed (g: Gray, now: number): Advice {
    const L = this.limits
    const metrics = measure(g, this.prev, L)
    this.prev = g
    const placement = tipFor(metrics, true, L)
    const framed = placement !== 'frame' && placement !== 'closer'
    // Sharpness peaks only count while the card is framed, so a busy background does not set the bar.
    this.peaks = this.peaks.filter((p) => now - p.t <= L.peakWindowMs)
    if (framed) this.peaks.push({ t: now, v: metrics.sharpness })
    const peak = this.peaks.reduce((m, p) => Math.max(m, p.v), 0)
    const sharpEnough = metrics.sharpness >= L.minSharpness && metrics.sharpness >= peak * L.peakRatio
    const tip = tipFor(metrics, sharpEnough, L)

    // Re-arm after a shot once the card moved a lot or left the frame (a flip to the other side).
    if (!this.armed && now - this.lastShot >= L.cooldownMs && (!framed || metrics.motion > L.maxMotion * 2)) {
      this.armed = true
    }
    this.readyRun = tip === 'ready' ? this.readyRun + 1 : 0
    const shoot = this.armed && this.readyRun >= L.readyFrames
    if (shoot) this.shotTaken(now)
    return { tip, shoot, metrics }
  }
}
