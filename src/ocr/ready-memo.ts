// SPDX-License-Identifier: AGPL-3.0-or-later
// Remembers, for this page, that the service worker said "OCR is ready" (ADR 0033).
//
// The service worker's 'status' answer hashes every OCR file (about 20 MB, ADR 0026). Several screens
// ask, and starting OCR asks again. Once one worker has answered "ready", the page keeps that answer
// for that worker only. A new worker (an update, or the first one on a first visit) asks again, and so
// does the page after forget(). The page calls forget() when using OCR fails: the files may have been
// deleted or rewritten since.
//
// This saves only the status answer. Every file is still hashed when the service worker serves it
// (ensureOnDemand), so a rewritten entry never runs: a "ready" kept here can only lead to a clear
// failure, never to unchecked code.
//
// Only "ready" is kept. "Not cached yet" is cheap to answer (the worker stops at the first missing
// file), and it changes as soon as the files are downloaded.

export class ReadyMemo<K> {
  /** The worker whose "ready" answer is kept, or null. */
  #readyFor: K | null = null
  /** One question at a time per worker: callers that ask together share the answer. */
  #asking: { key: K; answer: Promise<boolean> } | null = null
  /** Bumped by forget(): an answer to a question asked before that is not kept. */
  #generation = 0

  /** Whether `key` said "ready". Asks with `ask` only when no answer for `key` is kept. */
  async ready (key: K, ask: () => Promise<boolean>): Promise<boolean> {
    if (this.#readyFor === key) return true
    if (this.#asking?.key === key) return await this.#asking.answer
    const mine = this.#generation
    const answer = ask().then((ok) => {
      if (ok && mine === this.#generation) this.#readyFor = key
      return ok
    }).finally(() => {
      if (this.#asking?.answer === answer) this.#asking = null
    })
    this.#asking = { key, answer }
    return await answer
  }

  /** Records that `key` has just checked and served every file (a successful 'prepare'). */
  remember (key: K): void {
    this.#readyFor = key
  }

  /** Drops the kept answer, and any answer still on its way. */
  forget (): void {
    this.#generation++
    this.#readyFor = null
    this.#asking = null
  }
}
