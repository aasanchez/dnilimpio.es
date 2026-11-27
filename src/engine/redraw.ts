// SPDX-License-Identifier: AGPL-3.0-or-later
// Redraw scheduling for the editor's sanitised rasters. Pure: no DOM import, so the unit tests run
// it in Node with a fake frame clock.
//
// One sanitised render reads and copies every pixel of a side (about 7.4 MB for a 1712 × 1080 card)
// and draws the watermark. Doing that for both sides on every change, such as each step of a slider
// drag, makes the editor slow on phones. So:
//   - changes only ask for a redraw; at most one redraw runs per animation frame;
//   - a redraw renders only the sides on screen (the editor shows one side at a time);
//   - a side is rendered again only when its inputs changed (compared by key);
//   - flush() renders the given sides at once, before anything reads them: the side being shown,
//     and every side before the review, the share and the PDF.

export interface Redraw<S extends string> {
  /** Asks for a redraw of the visible sides on the next frame. Calls in the same frame share it. */
  request: () => void
  /** Renders each of `sides` whose inputs changed since its last render, now. Returns how many. */
  flush: (sides: readonly S[]) => number
  /** Cancels a pending frame. Later requests do nothing: call it when the editor goes away. */
  dispose: () => void
}

export interface RedrawOptions<S extends string> {
  /** The current inputs of a side, as a string: equal keys mean an equal render. */
  key: (side: S) => string
  /** Renders a side from its current inputs. */
  draw: (side: S) => void
  /** The sides on screen now. */
  visible: () => readonly S[]
  /** Called after a frame rendered at least one side, so the screen can show the new pixels. */
  onFrame?: () => void
  schedule?: (cb: () => void) => number
  cancel?: (id: number) => void
}

export function createRedraw<S extends string> (opts: RedrawOptions<S>): Redraw<S> {
  const schedule = opts.schedule ?? ((cb: () => void) => requestAnimationFrame(cb))
  const cancel = opts.cancel ?? ((id: number) => { cancelAnimationFrame(id) })
  const drawn = new Map<S, string>()
  let frame: number | null = null
  let disposed = false

  function flush (sides: readonly S[]): number {
    let n = 0
    for (const s of sides) {
      const k = opts.key(s)
      if (drawn.get(s) === k) continue
      // Forget the old key first: if draw() throws, the side counts as stale and the next flush retries.
      drawn.delete(s)
      opts.draw(s)
      drawn.set(s, k)
      n++
    }
    return n
  }

  return {
    request () {
      if (disposed || frame !== null) return
      frame = schedule(() => {
        frame = null
        if (disposed) return
        if (flush(opts.visible()) > 0) opts.onFrame?.()
      })
    },
    flush (sides) {
      return disposed ? 0 : flush(sides)
    },
    dispose () {
      disposed = true
      if (frame !== null) cancel(frame)
      frame = null
      drawn.clear()
    },
  }
}
