// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { ReadyMemo } from '../../src/ocr/ready-memo.ts'

/** A question to the service worker that counts how often it was asked. */
function asker (answer: boolean): { ask: () => Promise<boolean>; count: () => number } {
  let n = 0
  return { ask: async () => { n++; return await Promise.resolve(answer) }, count: () => n }
}

describe('ReadyMemo', () => {
  it('asks a worker once after it said "ready"', async () => {
    const memo = new ReadyMemo<string>()
    const a = asker(true)
    expect(await memo.ready('sw1', a.ask)).toBe(true)
    expect(await memo.ready('sw1', a.ask)).toBe(true)
    expect(await memo.ready('sw1', a.ask)).toBe(true)
    expect(a.count()).toBe(1)
  })

  it('callers that ask together share one question', async () => {
    const memo = new ReadyMemo<string>()
    const a = asker(true)
    const answers = await Promise.all([memo.ready('sw1', a.ask), memo.ready('sw1', a.ask), memo.ready('sw1', a.ask)])
    expect(answers).toEqual([true, true, true])
    expect(a.count()).toBe(1)
  })

  it('keeps no "not ready" answer: the files may be downloaded next', async () => {
    const memo = new ReadyMemo<string>()
    const no = asker(false)
    expect(await memo.ready('sw1', no.ask)).toBe(false)
    expect(await memo.ready('sw1', no.ask)).toBe(false)
    expect(no.count()).toBe(2)
  })

  it('asks again when another worker controls the page (an update)', async () => {
    const memo = new ReadyMemo<string>()
    const a = asker(true)
    await memo.ready('sw1', a.ask)
    const b = asker(false)
    expect(await memo.ready('sw2', b.ask)).toBe(false)
    expect(b.count()).toBe(1)
  })

  it('asks again after forget() (OCR failed: a file may be gone or rewritten)', async () => {
    const memo = new ReadyMemo<string>()
    await memo.ready('sw1', asker(true).ask)
    memo.forget()
    const again = asker(false)
    expect(await memo.ready('sw1', again.ask)).toBe(false)
    expect(again.count()).toBe(1)
  })

  it('does not keep an answer that arrives after forget()', async () => {
    const memo = new ReadyMemo<string>()
    let answer: (ok: boolean) => void = () => {}
    const slow = memo.ready('sw1', async () => await new Promise<boolean>((resolve) => { answer = resolve }))
    memo.forget()
    answer(true)
    expect(await slow).toBe(true)
    const next = asker(false)
    expect(await memo.ready('sw1', next.ask)).toBe(false)
    expect(next.count()).toBe(1)
  })

  it('remember() keeps "ready" after a successful prepare, for that worker only', async () => {
    const memo = new ReadyMemo<string>()
    memo.remember('sw1')
    const a = asker(false)
    expect(await memo.ready('sw1', a.ask)).toBe(true)
    expect(a.count()).toBe(0)
    expect(await memo.ready('sw2', a.ask)).toBe(false)
    expect(a.count()).toBe(1)
  })

  it('a failed question is not kept, and the next caller asks again', async () => {
    const memo = new ReadyMemo<string>()
    await expect(memo.ready('sw1', async () => await Promise.reject(new Error('no answer')))).rejects.toThrow('no answer')
    const a = asker(true)
    expect(await memo.ready('sw1', a.ask)).toBe(true)
    expect(a.count()).toBe(1)
  })
})
