<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0037. sw.js as a script source, so Firefox runs what the service worker answers

- Status: proposed (needs Alexis's approval: it changes two CSPs)
- Date: 2026-11-27
- Decided by: Alexis (asked for a separate fix after the cross-browser tests of PR #100 found the bug)

## Context

The cross-browser e2e run (PR #100) found that in Firefox, with the service worker in control, every
module loaded after the photo step fails: the OCR chunk, document detection and the corner model.
Each request ends with `NS_ERROR_CONTENT_BLOCKED`, an empty body and a failed integrity check. The
console says why:

> Content-Security-Policy: The page's settings blocked a script (script-src-elem) at
> http://localhost:4173/sw.js from being executed because it violates the following directive:
> "script-src http://localhost:4173/assets/… 'wasm-unsafe-eval'"

The service worker answers every cache hit with a response it builds from the checked bytes
(`verifiedHit()` in `src/sw.ts`, [ADR 0026](0026-recheck-cache-hits.md)). Such a response has no URL
of its own. Firefox checks it against the CSP as if it came from the service worker's script,
`sw.js`. Chromium and WebKit check the address the page asked for.

Two policies list scripts by exact address and do not list `sw.js`:

- the photo step's policy (`src/security/intake-lockdown.ts`, [ADR 0025](0025-intake-lockdown.md)),
  in `script-src`. It lists `sw.js` only in `worker-src`.
- the OCR worker's policy (`workerCsp()` in `src/offline/precache.ts`), which allows only the
  `ocr/` folder in `script-src` and `connect-src`. The worker imports the runtime's `.mjs` file and
  reads the models and the dictionary with `fetch()`. All of them are cache hits too.

The first policy explains the blocked chunks. The second explains why OCR still failed in Firefox
once the first was fixed (a CI experiment on PR #100): the worker could not load its own files.

Before the photo step, the page's first policy allows `script-src 'self'`, which covers `sw.js`, so
the start screen works in Firefox.

## Decision

Add the exact address of this build's `sw.js` to:

- `script-src` of the photo step's policy;
- `script-src` and `connect-src` of the OCR worker's policy.

Nothing else changes: no origin, no `'self'`, no other path. The host's own policy for the OCR worker
already allows `'self'`, which covers `sw.js`.

Rejected: answer cache hits with the cached response itself, which carries its own URL, instead of a
new response. That avoids the CSP change, but the cached entry's headers would then reach the page
and the OCR worker. ADR 0026 strips them on purpose: a rewritten entry could add, for example, a
reporting header that makes the worker send reports. Keeping the service worker unchanged is safer.

## Consequences

- In Firefox, OCR, document detection and the corner model work after the photo step, as in the
  other browsers. Before, Firefox users always got the manual path.
- What the extra source allows: the page, or the OCR worker, may load `sw.js` as a script, and the
  worker may read it with `fetch()`. `sw.js` is this build's own file, listed in the manifest and
  served by the same host. Run in a page or worker, it only adds service worker event listeners that
  never fire. It reaches no other address, so the photos still have no way out.
- `tests/unit/precache.test.ts` and `tests/e2e/intake-lockdown.spec.ts` pin the exact sources, so a
  wider source fails. The Firefox tests that PR #100 marked as known failures now run normally.
- If Firefox changes its behaviour, the extra source is harmless and can be removed in a later
  decision.
