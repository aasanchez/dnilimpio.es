# 0004. Offline mode with a verified service worker

- Status: accepted; the Trusted Types policy is now `default` ([ADR 0009](0009-on-device-ocr.md)); cache hits are hashed again before use ([ADR 0026](0026-recheck-cache-hits.md))
- Date: 2026-11-25

## Context

The spec asks for the tool to work without a network after one visit (§18). The page's CSP is strict:
`connect-src 'none'`, and Trusted Types with no policy allowed (`trusted-types 'none'`). Two
questions were open (PLAN decision 4): does a service worker need `connect-src`, and can the page
register one under Trusted Types?

## Decision

- Add a service worker, `sw.js`, next to `index.html` (source: `src/sw.ts`).
- At build time, write into `sw.js` the list of every file of the build (except source maps and
  `sw.js` itself) with its SHA-384 hash, and a version derived from all of them.
- On install, the worker downloads each file with `fetch(url, { integrity })`. The browser checks
  every file against its hash. If one file fails, the install fails and the partial cache is deleted.
- The worker answers GET requests in its scope from that cache, and page loads from the cached
  `index.html`.
- Deny by default (added after the security audit of 2026-11-25, finding SEC-001): the worker
  answers only the exact URLs listed in its manifest and page loads inside its scope. Every other
  request from the page or its workers is answered with a network error and never reaches the
  network: another origin, another path, a query string, a method other than GET. Before, unknown
  requests went to the network, so code that the CSP lets load same-origin images or scripts could
  have encoded data in a URL. The rule is a pure function (`route()` in `src/offline/precache.ts`)
  with unit tests; an e2e test checks that such requests never leave the browser.
- The cache name comes from the hashes of all files and of the worker's own code, so every new
  worker fills a new cache. A failed install deletes only its own cache, never the active one.
- No automatic `skipWaiting()`: a new build activates only when no tab runs the old one, or when the
  only tab is idle and asks for it (see Consequences). Open tabs keep their
  worker and their cache, including the PDF chunk they may still load. The new build then deletes the
  old caches.
- Change one CSP directive: `trusted-types 'none'` becomes `trusted-types dnilimpio-sw`. The page
  creates that one policy at start-up. Its only function returns the URL of `sw.js` and throws for
  anything else. A second policy with that name, or any other name, is refused by the browser.
- `connect-src 'none'` stays. The page's CSP does not apply to the worker's own requests, and the
  worker only requests this build's files from the same origin.

## Reasons

- Offline after one visit, with no download and no launcher ([ADR 0002](0002-no-standalone-release.md)).
- The cache can only ever hold the exact bytes of one build: integrity is checked by the browser when
  the cache is filled, not only when the page loads.
- `navigator.serviceWorker.register()` requires a `TrustedScriptURL` when Trusted Types are enforced.
  A single named policy, restricted to one URL, is the smallest change that allows it.

## Consequences

- The browser stores the app's files in Cache Storage. It never stores user data: photos, choices,
  the watermark and PDFs stay in memory.
- A new deploy reaches an open tab without closing it (amended 2026-11-25). The browser checks
  `sw.js` for changes (bypassing the HTTP cache) and installs the new build in the background. A
  reload alone does not switch builds, so a tab left open (common on phones) kept the old build
  indefinitely. Now `src/offline/update.ts` asks the waiting build to take over when the page is
  idle (start screen, no photos); the worker calls `skipWaiting()` only if this is the only tab of
  the app, and the page reloads once into the new build. A tab with work in progress, or a second
  open tab, keeps the old build until it is safe. The page also checks for a new build when it
  returns to the foreground, at most every 15 minutes. `tests/e2e/update.spec.ts` covers the three
  cases.
- e2e tests block service workers by default, so `page.route()` sees every request.
  `tests/e2e/offline.spec.ts` turns them on and checks the offline flow up to the PDF download, and
  that a tampered file stops the install.
- The source map of `sw.js` does not cover the inlined file list (it is written after bundling).
