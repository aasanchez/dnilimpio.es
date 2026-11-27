// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  CHECK_INTERVAL_MS, INITIAL_STATE, idleAnswer, mayOffer, step, wasActivated,
  type Effect, type Facts, type UpdateEvent, type UpdateState,
} from '../../src/offline/update-rules.ts'

const WAITING: Facts = { waiting: true, controlled: true }
const NONE: Facts = { waiting: false, controlled: true }
const FIRST_VISIT: Facts = { waiting: false, controlled: false }

/** Runs events in order from a state; returns the final state and every effect, in order. */
function run (events: ReadonlyArray<[UpdateEvent, Facts]>, from: UpdateState = INITIAL_STATE): { state: UpdateState; effects: Effect[] } {
  let state = from
  const effects: Effect[] = []
  for (const [event, facts] of events) {
    const next = step(state, event, facts)
    state = next.state
    effects.push(...next.effects)
  }
  return { state, effects }
}

const watching = (over: Partial<UpdateState> = {}): UpdateState => ({ ...INITIAL_STATE, hadController: true, ...over })
const idle = (value: boolean): UpdateEvent => ({ type: 'idle', idle: value })

describe('mayOffer', () => {
  it('offers only when idle, a build waits and a worker controls the page', () => {
    for (const isIdle of [false, true]) {
      for (const waiting of [false, true]) {
        for (const controlled of [false, true]) {
          expect(mayOffer({ ...INITIAL_STATE, idle: isIdle }, { waiting, controlled })).toBe(isIdle && waiting && controlled)
        }
      }
    }
  })
})

describe('start', () => {
  it('starts busy, with nothing ready and no check made', () => {
    expect(INITIAL_STATE).toEqual({ idle: false, hadController: false, reloading: false, reloadWhenIdle: false, ready: false, lastCheck: 0 })
  })

  it('remembers whether a worker controlled the page when watching started', () => {
    expect(step(INITIAL_STATE, { type: 'watch' }, WAITING).state.hadController).toBe(true)
    expect(step(INITIAL_STATE, { type: 'watch' }, FIRST_VISIT).state.hadController).toBe(false)
  })

  it('offers a build that already waits when watching starts on an idle page', () => {
    expect(run([[idle(true), NONE], [{ type: 'watch' }, WAITING]]).effects).toEqual(['offer'])
  })

  it('does not offer when watching starts on a busy page', () => {
    expect(step(INITIAL_STATE, { type: 'watch' }, WAITING).effects).toEqual([])
  })
})

describe('idle page', () => {
  it('offers a waiting build when the app becomes idle', () => {
    const r = step(watching(), idle(true), WAITING)
    expect(r.state.idle).toBe(true)
    expect(r.effects).toEqual(['offer'])
  })

  it('does nothing when no build waits', () => {
    expect(step(watching(), idle(true), NONE).effects).toEqual([])
  })

  it('does nothing when no worker controls the page', () => {
    expect(step(watching(), idle(true), { waiting: true, controlled: false }).effects).toEqual([])
  })

  it('offers a build as soon as it finishes installing, if the page is idle', () => {
    expect(step(watching({ idle: true }), { type: 'installed' }, WAITING).effects).toEqual(['offer'])
  })

  it('reloads once into a new build that took over', () => {
    const r = step(watching({ idle: true }), { type: 'controllerchange' }, NONE)
    expect(r.effects).toEqual(['reload'])
    expect(r.state.reloading).toBe(true)
  })
})

describe('busy page (photos or not on the start screen)', () => {
  it('never offers a build', () => {
    expect(step(watching(), idle(false), WAITING).effects).toEqual([])
    expect(step(watching(), { type: 'installed' }, WAITING).effects).toEqual([])
  })

  it('is not reloaded when a new build takes over: it reloads once back on the start screen', () => {
    const taken = step(watching(), { type: 'controllerchange' }, NONE)
    expect(taken.effects).toEqual([])
    expect(taken.state.reloadWhenIdle).toBe(true)
    // Still busy: nothing.
    expect(step(taken.state, idle(false), NONE).effects).toEqual([])
    // Back on the start screen: reload, and not an offer.
    expect(step(taken.state, idle(true), WAITING).effects).toEqual(['reload'])
  })

  it('becoming busy is noted, so the answer to the new build is "busy"', () => {
    const s = step(watching({ idle: true }), idle(false), WAITING).state
    expect(s.idle).toBe(false)
    expect(idleAnswer({ type: 'idle?' }, s.idle)).toEqual({ idle: false })
  })
})

describe('first visit', () => {
  it('does not reload when the first worker takes control: it is the same build', () => {
    const r = step(watching({ hadController: false, idle: true }), { type: 'controllerchange' }, FIRST_VISIT)
    expect(r.effects).toEqual([])
    expect(r.state.hadController).toBe(true)
    expect(r.state.reloadWhenIdle).toBe(false)
  })

  it('reloads on the next build that takes over', () => {
    const r = run([
      [{ type: 'watch' }, FIRST_VISIT],
      [idle(true), FIRST_VISIT],
      [{ type: 'controllerchange' }, NONE],
      [{ type: 'controllerchange' }, NONE],
    ])
    expect(r.effects).toEqual(['reload'])
  })
})

describe('reload', () => {
  it('reloads only once, whatever happens after', () => {
    const r = run([
      [{ type: 'controllerchange' }, NONE],
      [idle(true), NONE],
      [{ type: 'controllerchange' }, NONE],
      [idle(true), NONE],
    ], watching({ idle: true }))
    expect(r.effects).toEqual(['reload'])
  })
})

describe('answer to an offer ("Update now")', () => {
  it('shows "Update now" when another window held the build back', () => {
    expect(step(watching({ idle: true }), { type: 'answer', activated: false, stillWaiting: true }, WAITING).state.ready).toBe(true)
  })

  it('shows nothing when the build took over', () => {
    expect(step(watching({ idle: true }), { type: 'answer', activated: true, stillWaiting: true }, WAITING).state.ready).toBe(false)
  })

  it('shows nothing when another build replaced the one offered', () => {
    expect(step(watching({ idle: true }), { type: 'answer', activated: false, stillWaiting: false }, WAITING).state.ready).toBe(false)
  })

  it('hides "Update now" when a new build takes over, on an idle or a busy page', () => {
    expect(step(watching({ ready: true, idle: true }), { type: 'controllerchange' }, NONE).state.ready).toBe(false)
    expect(step(watching({ ready: true }), { type: 'controllerchange' }, NONE).state.ready).toBe(false)
  })
})

describe('the person presses "Update now"', () => {
  it('forces the waiting build to take over, even if the page is busy', () => {
    const r = step(watching({ ready: true }), { type: 'apply' }, WAITING)
    expect(r.effects).toEqual(['force'])
    expect(r.state.ready).toBe(true)
  })

  it('hides the button when no build waits any more', () => {
    const r = step(watching({ ready: true }), { type: 'apply' }, NONE)
    expect(r.effects).toEqual([])
    expect(r.state.ready).toBe(false)
  })

  it('reloads the idle page once the build takes over', () => {
    const r = run([
      [{ type: 'apply' }, WAITING],
      [{ type: 'controllerchange' }, NONE],
    ], watching({ idle: true, ready: true }))
    expect(r.effects).toEqual(['force', 'reload'])
    expect(r.state.ready).toBe(false)
  })
})

describe('tab back in the foreground', () => {
  it('checks for a new build the first time', () => {
    const r = step(watching(), { type: 'visible', now: 1_000_000 }, NONE)
    expect(r.effects).toEqual(['check'])
    expect(r.state.lastCheck).toBe(1_000_000)
  })

  it('offers a build held back earlier, then checks', () => {
    expect(step(watching({ idle: true }), { type: 'visible', now: 1_000_000 }, WAITING).effects).toEqual(['offer', 'check'])
  })

  it('checks at most once per interval, but still offers', () => {
    const s = watching({ idle: true, lastCheck: 1_000_000 })
    const soon = step(s, { type: 'visible', now: 1_000_000 + CHECK_INTERVAL_MS - 1 }, WAITING)
    expect(soon.effects).toEqual(['offer'])
    expect(soon.state.lastCheck).toBe(1_000_000)
    const later = step(s, { type: 'visible', now: 1_000_000 + CHECK_INTERVAL_MS }, NONE)
    expect(later.effects).toEqual(['check'])
    expect(later.state.lastCheck).toBe(1_000_000 + CHECK_INTERVAL_MS)
  })

  it('waits 15 minutes between checks', () => {
    expect(CHECK_INTERVAL_MS).toBe(15 * 60 * 1000)
  })
})

describe('idleAnswer', () => {
  it('answers the question "idle?" with the page state', () => {
    expect(idleAnswer({ type: 'idle?' }, true)).toEqual({ idle: true })
    expect(idleAnswer({ type: 'idle?' }, false)).toEqual({ idle: false })
  })

  it('ignores any other message', () => {
    for (const data of [null, undefined, 'idle?', 42, {}, { type: 'activate' }, { type: 'IDLE?' }]) {
      expect(idleAnswer(data, true)).toBeUndefined()
    }
  })
})

describe('wasActivated', () => {
  it('is true only for { activated: true }', () => {
    expect(wasActivated({ activated: true })).toBe(true)
    for (const data of [null, undefined, {}, { activated: false }, { activated: 'true' }, { activated: 1 }, true]) {
      expect(wasActivated(data)).toBe(false)
    }
  })
})

describe('step', () => {
  it('never changes the state it is given', () => {
    const s = Object.freeze(watching({ idle: true, ready: true }))
    const events: UpdateEvent[] = [
      { type: 'watch' }, idle(true), idle(false), { type: 'installed' }, { type: 'visible', now: 1 },
      { type: 'answer', activated: false, stillWaiting: true }, { type: 'apply' }, { type: 'controllerchange' },
    ]
    for (const e of events) expect(() => step(s, e, WAITING)).not.toThrow()
    expect(s).toEqual(watching({ idle: true, ready: true }))
  })
})
