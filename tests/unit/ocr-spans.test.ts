// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { wordSpans } from '../../src/ocr/spans.ts'

/** A white RGBA image with black rectangles (x0, x1) across rows 10–30. */
function image (w: number, h: number, blocks: ReadonlyArray<readonly [number, number]>): Uint8Array {
  const d = new Uint8Array(w * h * 4).fill(255)
  for (const [x0, x1] of blocks) {
    for (let y = 10; y < 30; y++) for (let x = x0; x < x1; x++) d.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3)
  }
  return d
}

describe('wordSpans', () => {
  const box = { x: 0, y: 5, w: 200, h: 30 }
  it('finds one span per word, ignoring narrow letter gaps', () => {
    // "DNI": three letters 3 px apart; then a wide gap; then the number.
    const d = image(200, 40, [[5, 15], [18, 28], [31, 35], [60, 190]])
    expect(wordSpans(d, 200, 40, box, 2)).toEqual([{ x0: 5, x1: 35 }, { x0: 60, x1: 190 }])
  })
  it('returns null when the ink does not split into that many words', () => {
    const d = image(200, 40, [[5, 190]])
    expect(wordSpans(d, 200, 40, box, 2)).toBeNull()
    expect(wordSpans(d, 200, 40, box, 0)).toBeNull()
  })
  it('clips the box to the image', () => {
    const d = image(200, 40, [[150, 199]])
    expect(wordSpans(d, 200, 40, { x: 100, y: 0, w: 300, h: 80 }, 1)).toEqual([{ x0: 150, x1: 199 }])
  })
})
