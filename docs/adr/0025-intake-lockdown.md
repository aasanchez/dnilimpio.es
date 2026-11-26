<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0025. Intake lockdown: a stricter policy while photos are in the page

- Status: accepted
- Date: 2026-11-26
- Decided by: Alexis (asked for item 5 of the security review of 26 November 2026); details chosen below

## Context

The page's Content Security Policy (`scripts/csp.ts`) is written for the whole visit. The start
screen must load the app's images, fonts, styles and scripts from the site's own origin, and the
visit counter frame (ADR 0024). So the same rules stay in force while photos are in the page:

- `img-src 'self'`, `font-src 'self'`, `style-src 'self'` and `script-src 'self'` allow a load of
  any path on the site's own origin. A script in the page could put data in the address of such a
  load (`./icon.png?data`). The service worker refuses that (`route()`, ADR 0004), but it does not
  control the page on a first visit, after a forced reload, or where service workers are off.
- `frame-src` allows the visit counter page on another site.

ADR 0023 already removed every third-party script and set `connect-src 'none'`.

The review asked to load what the page needs before photo intake, then run with a tighter policy,
to narrow image sources to `blob:` and `data:`, to use exact files instead of origins, and to say
what happens without a verified service worker.

## Decision

**A second policy before the photo step.** The Start button first loads every font face of the
stylesheet (`document.fonts`, at most 3 seconds; the page also starts this when it is idle), then
adds a second `<meta http-equiv="Content-Security-Policy">` (`src/security/intake-lockdown.ts`).
Every other way to a screen after the start one adds it too. Browsers enforce every policy of a
page, so each load must pass both. A policy cannot be removed, so the page stays locked until it is
reloaded, and a reload drops the photos (`pagehide`). The second policy is:

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'none'` | Anything not named below stays closed |
| `script-src` | each script of this build by its exact address, `'wasm-unsafe-eval'` | Read from the page itself: entry module, preloaded modules and the import map. No origin, no `'self'`, no analytics beacon |
| `worker-src` | `sw.js` and `ocr/worker.min.js` by exact address | The only workers the app starts |
| `img-src` | `blob: data:` | Photos, canvases and CSS icons are in memory; no image comes from a server |
| `font-src`, `style-src`, `manifest-src` | `'none'` | Loaded before; nothing more is needed |
| `frame-src` | `'none'` | The counter frame shows on the start screen only, once per page load (ADR 0024) |
| `connect-src` | `'none'` | No `fetch`, XHR, `sendBeacon` or WebSocket (as in the first policy since ADR 0023) |

**Large AI files stay on demand.** The corner model (`assets/ml/`) and OCR (`ocr/`) are not loaded
before intake: CLAUDE.md rule 5 keeps them on demand, and offline users without them must still be
able to work. They do not need a looser policy: the corner model's modules are in the exact script
list, and the OCR worker reads its files under its own policy (`workerCsp()`, ADR 0019), which a
page policy does not change.

**The service worker as the second layer.** CSP compares addresses without their query string, so
`import('./assets/<build file>.js?data')` passes the exact script list. Workers are safe from this:
Trusted Types compares the whole address (`src/security/trusted-types.ts`). The service worker
refuses any address that is not an exact file of the build. The photo step checks that the worker
is in place (`src/offline/verify.ts`): a worker controls the page, its script is this site's
`sw.js`, and it answers the app's `status` message. If not, the step shows one calm line: the extra
network filter is not active on this visit, the app works the same and does not send the photo,
and a reload usually starts it. The app never blocks on it (rule 5).

## Consequences

- With photos in the page and the service worker in control, no tested channel reaches the network:
  image, CSS background, font, stylesheet, `fetch`, XHR, `sendBeacon`, WebSocket, a worker with a
  query string, and a script import with a query string (`tests/e2e/intake-lockdown.spec.ts`).
  Without the service worker, only the script import gets through, to this site's host, and the
  photo step says the filter is off.
- A whole workflow (corner model, OCR, guide, language change, watermark, PDF) runs under the second
  policy with no policy violation; the same test proves its listener does see violations.
- A future feature that loads an image, font or stylesheet from a server after the start screen will
  fail. Load it before intake, or change this decision.
- **Limits, stated plainly.** Neither layer is immune to code already running in the page with the
  page's privileges. Such code can navigate the tab away (no CSP rule covers navigation), unregister
  the service worker, delete its caches, or fake the worker check. The check guards against a
  missing or foreign worker, not against a compromised page. What keeps such code out is that only
  this build's verified code runs (CSP, SRI, the locked dependency list).
- The counter frame (ADR 0024) can no longer appear beside a photo at all: a frame added after
  Start is refused by `frame-src 'none'`. `tests/e2e/third-party.spec.ts` now checks that refusal
  instead of the frame's isolation next to a photo.
- Production builds only. The dev server has no CSP, no import map and needs its HMR connection,
  so `pnpm dev` never adds the second policy. Check it with `pnpm build` and the e2e tests.
- The script list holds only files inside the app's own folder. Another site's script that is
  already in the page (such as a script added by a browser extension) is never listed.
- The policy only gets stricter: a bug in it can break a feature, never open a channel. Firefox and
  Safari apply a `<meta>` policy added by script in the same way; the tests run in Chromium.
