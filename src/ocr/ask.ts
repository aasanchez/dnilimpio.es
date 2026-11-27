// SPDX-License-Identifier: AGPL-3.0-or-later
// One question to the service worker about the OCR files, with a time limit (same pattern as
// src/offline/verify.ts). A worker that was stopped or is being replaced may never answer; without a
// limit, document detection, Find automatically and Fit to the text would wait forever. After the
// limit the caller treats OCR as unavailable and the person does that step by hand.

export interface AskTarget {
  postMessage: (message: unknown, transfer: Transferable[]) => void
}

export type AskMessage = { readonly type: 'status' | 'prepare'; readonly paths: readonly string[] }
export interface AskReply { ok: boolean; cached?: boolean; error?: string }

/**
 * Time limits in milliseconds. 'status' only re-hashes cached files (about 20 MB, a few seconds on a
 * slow phone). 'prepare' may download about 9 MB the first time: 3 minutes covers about 0.4 Mbit/s.
 * The service worker keeps downloading after the limit, so a later try finds the files cached.
 */
export const ASK_TIMEOUT_MS: Readonly<Record<AskMessage['type'], number>> = { status: 15_000, prepare: 180_000 }

/** Thrown when the service worker does not answer in time. */
export class AskTimeout extends Error {
  constructor (type: AskMessage['type']) { super(`OCR unavailable: the service worker did not answer '${type}' in time`) }
}

/** Sends `msg` to `target` and waits for its answer, at most `timeoutMs`. Throws AskTimeout after that. */
export async function askWorker (target: AskTarget, msg: AskMessage, timeoutMs = ASK_TIMEOUT_MS[msg.type]): Promise<AskReply> {
  return await new Promise<AskReply>((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => { done(() => { reject(new AskTimeout(msg.type)) }) }, timeoutMs)
    function done (settle: () => void): void {
      clearTimeout(timer)
      channel.port1.close()
      settle()
    }
    channel.port1.onmessage = (e: MessageEvent) => {
      const data = e.data as Partial<AskReply> | null
      done(() => { resolve({ ok: data?.ok === true, cached: data?.cached === true, ...(typeof data?.error === 'string' ? { error: data.error } : {}) }) })
    }
    try {
      target.postMessage(msg, [channel.port2])
    } catch (e) {
      done(() => { reject(e instanceof Error ? e : new Error(String(e))) })
    }
  })
}
