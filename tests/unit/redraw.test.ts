// SPDX-License-Identifier: AGPL-3.0-or-later
// Editor redraw scheduling (src/engine/redraw.ts): one render per frame, only the visible side,
// only on changed inputs, and flush() brings any side up to date at once.
import { describe, expect, it } from 'vitest'
import { createRedraw } from '../../src/engine/redraw.ts'

type Side = 'front' | 'back'

function setup () {
  const frames: Array<() => void> = []
  const inputs: Record<Side, number> = { front: 0, back: 0 }
  const draws: Side[] = []
  let visible: Side = 'front'
  let shown = 0
  const redraw = createRedraw<Side>({
    key: (s) => String(inputs[s]),
    draw: (s) => { draws.push(s) },
    visible: () => [visible],
    onFrame: () => { shown++ },
    schedule: (cb) => frames.push(cb),
    cancel: (id) => { frames[id - 1] = () => {} },
  })
  const tick = (): void => { for (const f of frames.splice(0)) f() }
  return {
    redraw,
    inputs,
    draws,
    tick,
    frames,
    show: (s: Side) => { visible = s },
    shown: () => shown,
  }
}

describe('createRedraw', () => {
  it('batches many changes in one frame into one render of the visible side', () => {
    const t = setup()
    for (let i = 1; i <= 30; i++) {
      t.inputs.front = i
      t.inputs.back = i
      t.redraw.request()
    }
    expect(t.frames).toHaveLength(1)
    expect(t.draws).toEqual([])
    t.tick()
    expect(t.draws).toEqual(['front'])
    expect(t.shown()).toBe(1)
  })

  it('renders the hidden side only when it is flushed, and only if it changed', () => {
    const t = setup()
    t.inputs.back = 1
    t.redraw.request()
    t.tick()
    expect(t.draws).toEqual(['front'])
    t.show('back')
    expect(t.redraw.flush(['back'])).toBe(1)
    expect(t.redraw.flush(['back'])).toBe(0)
    expect(t.redraw.flush(['front', 'back'])).toBe(0)
    expect(t.draws).toEqual(['front', 'back'])
  })

  it('flush before the review renders every stale side', () => {
    const t = setup()
    t.redraw.flush(['front', 'back'])
    t.inputs.front = 2
    t.inputs.back = 2
    t.redraw.request()
    // The review opens before the frame: both sides are rendered now; the frame then has nothing to do.
    expect(t.redraw.flush(['front', 'back'])).toBe(2)
    t.tick()
    expect(t.draws).toEqual(['front', 'back', 'front', 'back'])
    expect(t.shown()).toBe(0)
  })

  it('skips a frame with no change and does not call onFrame', () => {
    const t = setup()
    t.redraw.request()
    t.tick()
    t.redraw.request()
    t.tick()
    expect(t.draws).toEqual(['front'])
    expect(t.shown()).toBe(1)
  })

  it('retries a side whose render threw', () => {
    let fail = true
    const draws: string[] = []
    const r = createRedraw<'front'>({
      key: () => 'k',
      draw: (s) => {
        if (fail) throw new Error('self-check failed')
        draws.push(s)
      },
      visible: () => ['front'],
      schedule: () => 1,
      cancel: () => {},
    })
    expect(() => r.flush(['front'])).toThrow('self-check failed')
    fail = false
    expect(r.flush(['front'])).toBe(1)
    expect(draws).toEqual(['front'])
  })

  it('does nothing after dispose, and cancels the pending frame', () => {
    const t = setup()
    t.redraw.request()
    t.redraw.dispose()
    t.tick()
    t.redraw.request()
    expect(t.frames).toHaveLength(0)
    expect(t.redraw.flush(['front'])).toBe(0)
    expect(t.draws).toEqual([])
  })
})
