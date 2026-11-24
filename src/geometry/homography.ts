// SPDX-License-Identifier: AGPL-3.0-or-later
// Plane-to-plane homography from four point correspondences (spec §4.2), in plain TypeScript.
// Solves the 8×8 linear system of the direct linear transform with h33 = 1, using Gaussian
// elimination with partial pivoting.

export interface Point { readonly x: number; readonly y: number }
/** Row-major 3×3 matrix. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];
export type Quad = readonly [Point, Point, Point, Point];

/** Solves A·x = b in place. Returns null when A is singular (degenerate input). */
export function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    const rowC = a[col]!;
    for (let r = col + 1; r < n; r++) {
      const row = a[r]!;
      const f = row[col]! / rowC[col]!;
      for (let k = col; k < n; k++) row[k]! -= f * rowC[k]!;
      b[r]! -= f * b[col]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const row = a[r]!;
    let s = b[r]!;
    for (let k = r + 1; k < n; k++) s -= row[k]! * x[k]!;
    x[r] = s / row[r]!;
  }
  return x;
}

/** Homography H with H·src[i] ≅ dst[i]. Null if three of the points are collinear. */
export function homography(src: Quad, dst: Quad): Mat3 | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(a, b);
  if (!h) return null;
  const m: Mat3 = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
  // A singular H means one quad is degenerate (three collinear corners): no usable mapping.
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  return Math.abs(det) < 1e-12 ? null : m;
}

export function apply(m: Mat3, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

/** True if the quad is convex and its corners are in a consistent winding order. */
export function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!, b = q[(i + 1) % 4]!, c = q[(i + 2) % 4]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
