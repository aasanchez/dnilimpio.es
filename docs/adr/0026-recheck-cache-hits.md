<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0026. The service worker hashes every cache hit again

- Status: accepted
- Date: 2026-11-26
- Decided by: Alexis (security review list of 26 November 2026, item 3)

## Context

[ADR 0004](0004-offline-service-worker.md) checks every file against its SHA-384 hash when it enters
the cache: at install, and on first use for the on-demand files (`ocr/`, `assets/ml/`). After that,
the worker answered cache hits as they were.

Cache Storage is not private to the worker. Any script that runs on the page's origin (a compromised
dependency, for example) can call
`caches.open(...).put(...)` and replace an entry. The review showed that a rewritten `index.html` or
OCR worker script stays in the cache and is served on every later visit, even offline. `index.html`
has no SRI of its own, and the OCR worker is started with `new Worker(url)`, which takes no integrity.
So a one-time rewrite could become code that runs on every visit.

## Decision

- Before the worker answers a cache hit, it hashes the entry's bytes and compares them with the hash
  in its manifest. This covers page loads (`index.html`), the files saved at install, the on-demand
  files (`ensureOnDemand`) and the `status` answer that tells the page whether OCR is ready offline.
- A mismatch, a non-OK response or a missing entry is deleted from the cache at once. The worker then
  downloads the same fixed URL again, with `fetch(url, { integrity, cache: 'reload', credentials:
  'omit' })`, so the browser checks the new bytes, and stores them. Offline, that download fails and
  the request gets a network error: the rewritten file never runs.
- The answer is a new response built from the bytes that were hashed, so what runs is exactly what was
  checked. Only the entry's `Content-Type` is kept; no other header of the entry reaches the page.
- The check runs on every hit, not once per worker lifetime. A check kept in memory would not see a
  rewrite made after it, and the worker often lives across several page loads.

## Consequences

- Cost: one SHA-384 per answered file. Most files are a few kilobytes. The largest, the OCR engine's
  WebAssembly file (about 13 MB), is hashed when OCR starts and when the page asks whether OCR is
  ready, in tens of milliseconds on a desktop and somewhat more on a phone.
- A rewritten entry repairs itself online. Offline, the affected file is refused: a rewritten
  `index.html` means the app does not open offline until the next online visit, and a rewritten OCR
  or model file means that AI feature is switched off and the manual path stays (rule 5).
- This does not make Cache Storage private, and it does not stop same-origin code from deleting the
  cache or acting inside the page while it runs. It stops one rewrite from persisting as code that
  runs later.
- `tests/e2e/offline.spec.ts` rewrites the cached `index.html` and `ocr/worker.min.js`, online and
  offline, and checks that neither ever runs. The tests fail against the previous worker.
