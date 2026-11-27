// SPDX-License-Identifier: AGPL-3.0-or-later
// A small property-based testing helper, written here so the project needs no extra dependency.
// Each case gets its own seeded generator (mulberry32). The seeds are fixed by default, so a run is
// repeatable and CI is stable. To explore other cases, or to repeat a failure:
//   PROPERTY_SEED=random pnpm test tests/unit/redaction.property.test.ts   (new cases each run; a failure prints its seed)
//   PROPERTY_SEED=123456 PROPERTY_RUNS=1 pnpm test ...                      (one case, from a failure)
//   PROPERTY_RUNS=5000 pnpm test ... --testTimeout=0                        (more cases per property)
// A failure names the property, the case seed, the command that repeats it and the generated input.

import { relative } from 'node:path'
import { expect } from 'vitest'

/** Seeded random source. Every method draws from the same stream, so a seed fixes the whole case. */
export interface Rng {
  /** The seed this case started from. */
  readonly seed: number
  /** Uniform in [0, 1). */
  next: () => number
  /** Uniform in [min, max). */
  float: (min: number, max: number) => number
  /** Integer in [min, max], both included. */
  int: (min: number, max: number) => number
  /** True with probability `p`. */
  bool: (p?: number) => boolean
  pick: <T>(items: readonly T[]) => T
  /** A random subset, each item kept with probability `p`. */
  subset: <T>(items: readonly T[], p?: number) => T[]
}

/** mulberry32: small, fast, and good enough to spread test inputs. Not for cryptography. */
export function rng (seed: number): Rng {
  let s = seed >>> 0
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
  const r: Rng = {
    seed: seed >>> 0,
    next,
    float: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor((max - min + 1) * next()),
    bool: (p = 0.5) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() from an empty list')
      return items[Math.floor(items.length * next())]!
    },
    subset: (items, p = 0.5) => items.filter(() => next() < p),
  }
  return r
}

const DEFAULT_SEED = 0x5eed_2026

function baseSeed (): number {
  const raw = process.env.PROPERTY_SEED
  if (raw === undefined || raw === '') return DEFAULT_SEED
  if (raw === 'random') {
    const seed = Math.floor(Math.random() * 2 ** 32) >>> 0
    console.info(`Property tests: PROPERTY_SEED=${String(seed)}`)
    return seed
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) throw new Error(`PROPERTY_SEED must be a whole number or "random", not "${raw}"`)
  return n >>> 0
}

/** Read once per test file, so every property in a file shares one base seed. */
const BASE = baseSeed()

function runCount (fallback: number): number {
  const raw = process.env.PROPERTY_RUNS
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) throw new Error(`PROPERTY_RUNS must be a whole number from 1, not "${raw}"`)
  return n
}

export interface CheckOptions {
  /** Cases to run when PROPERTY_RUNS is not set. */
  readonly runs?: number
}

function show (value: unknown): string {
  try {
    const text = JSON.stringify(value, (_, v: unknown) => (v instanceof Uint8Array || v instanceof Uint8ClampedArray ? `<${String(v.length)} bytes>` : v))
    return text.length > 2000 ? `${text.slice(0, 2000)}…` : text
  } catch {
    return String(value)
  }
}

function failure (name: string, seed: number, input: unknown, err: unknown): Error {
  const reason = err instanceof Error ? err.message : String(err)
  const path = expect.getState().testPath
  const file = path ? relative(process.cwd(), path) : '<this file>'
  const error = new Error(
    `Property "${name}" failed with seed ${String(seed)}.\n` +
    `Repeat this case: PROPERTY_SEED=${String(seed)} PROPERTY_RUNS=1 pnpm test ${file}\n` +
    `Input: ${show(input)}\n` +
    `Reason: ${reason}`,
    { cause: err }
  )
  console.error(error.message)
  return error
}

/** Case `i` uses seed BASE + i, so the seed in a failure message repeats exactly that case alone. */
const caseSeed = (i: number): number => (BASE + i) >>> 0

/**
 * Runs `property` on `runs` generated inputs. `property` throws (an `expect` failure, for example)
 * when the input breaks it. The first failure stops the run and reports its seed and input.
 */
export function check<T> (name: string, generate: (r: Rng) => T, property: (input: T, r: Rng) => void, opts: CheckOptions = {}): void {
  const runs = runCount(opts.runs ?? 200)
  for (let i = 0; i < runs; i++) {
    const r = rng(caseSeed(i))
    const input = generate(r)
    try {
      property(input, r)
    } catch (err) {
      throw failure(name, r.seed, input, err)
    }
  }
}

/** check() for a property that returns a promise. */
export async function checkAsync<T> (name: string, generate: (r: Rng) => T, property: (input: T, r: Rng) => Promise<void>, opts: CheckOptions = {}): Promise<void> {
  const runs = runCount(opts.runs ?? 200)
  for (let i = 0; i < runs; i++) {
    const r = rng(caseSeed(i))
    const input = generate(r)
    try {
      await property(input, r)
    } catch (err) {
      throw failure(name, r.seed, input, err)
    }
  }
}
