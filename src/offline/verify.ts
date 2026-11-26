// SPDX-License-Identifier: AGPL-3.0-or-later
// Is this page controlled by the app's own service worker (src/sw.ts)? ADR 0025.
//
// The intake policy (src/security/intake-lockdown.ts) cannot see query strings; the service worker
// refuses every request that is not an exact file of this build (route() in src/offline/precache.ts).
// Both together are the strong filter. Without the worker (first seconds of a first visit, a hard
// reload, private mode in some browsers, the tests) the app still works, and the photo step says
// that the extra filter is off.
//
// "Verified" means: a worker controls the page, its script is this site's sw.js, and it answers the
// app's own 'status' message. It is a check against a missing or foreign worker, not against code
// already running in the page: such code could fake the answer, unregister the worker or navigate away.

export interface WorkerLike {
  readonly scriptURL: string
  postMessage: (message: unknown, transfer: Transferable[]) => void
}

/** True when `worker` is this site's service worker and it answers within `timeoutMs`. */
export async function isVerifiedWorker (worker: WorkerLike | null | undefined, base: string, timeoutMs = 2000): Promise<boolean> {
  if (!worker) return false
  if (worker.scriptURL !== new URL('sw.js', base).href) return false
  return await new Promise<boolean>((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => { done(false) }, timeoutMs)
    function done (ok: boolean): void {
      clearTimeout(timer)
      channel.port1.close()
      resolve(ok)
    }
    channel.port1.onmessage = (e: MessageEvent) => { done((e.data as { ok?: unknown } | null)?.ok === true) }
    try {
      // An empty list: the worker only answers that it is there (src/sw.ts, 'status').
      worker.postMessage({ type: 'status', paths: [] }, [channel.port2])
    } catch {
      done(false)
    }
  })
}

/** Checks this page's controller now and again whenever it changes. Calls `on` with each answer. */
export function watchFilter (on: (active: boolean) => void, signal: AbortSignal): void {
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined
  const check = (): void => {
    void isVerifiedWorker(sw?.controller, document.baseURI).then((ok) => { if (!signal.aborted) on(ok) })
  }
  check()
  sw?.addEventListener('controllerchange', check, { signal })
}
