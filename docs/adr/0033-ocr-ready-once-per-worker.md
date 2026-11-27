<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0033. The page asks once per service worker whether OCR is ready

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis (code review of 27 November 2026, suggestion 5: "ask once per screen")

## Context

[ADR 0026](0026-recheck-cache-hits.md) makes the service worker hash every cache hit, and also every
file when the page asks whether OCR is ready (`status`). The OCR files are about 20 MB. Document
detection, Find my data and Fit to the text each ask, and starting OCR asks again. So one card could
hash the 20 MB four or more times only to learn the same answer. On a phone that is noticeable.

The `status` answer runs no code. What protects the person is the check when a file is served:
`ensureOnDemand` hashes every OCR file again before the OCR worker gets it.

## Decision

- The page keeps the service worker's "ready" answer in memory (`src/ocr/ready-memo.ts`), for the
  worker that gave it. A page controlled by another worker (an update, or the first worker of a first
  visit) asks again. `controllerchange` also drops the kept answer.
- A successful `prepare` (every file checked and in the cache) also counts as "ready" for that worker.
- When `prepare` fails, or an OCR job fails for any reason other than `stopOcr()`, the page drops the
  kept answer. The next question goes to the service worker again.
- Callers that ask at the same time share one question.
- Only "ready" is kept. "Not cached yet" is cheap to answer and changes once the files are downloaded.
- Nothing changes in the service worker. Every cache hit is still hashed before it is served or run,
  as ADR 0026 says.

## Consequences

- The 20 MB are hashed once for the status per worker, plus when OCR starts (`prepare` and the
  worker's own requests, as before).
- A kept "ready" can be out of date: the browser may evict the cache, or same-origin code may rewrite
  an entry. Online, the file is downloaded again when OCR starts. Offline, OCR fails with the usual
  "failed" note, the manual path stays (rule 5), and the next status question says OCR is
  unavailable. The forged bytes never run.
- `tests/unit/ready-memo.test.ts` checks the memo. `tests/e2e/ocr.spec.ts` checks that three status
  questions after a download reach the worker zero times, and that a rewritten model, offline, is
  refused and the status is asked again.
