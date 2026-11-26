<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0024. Visit counts from an isolated, cross-origin frame

- Status: superseded by [ADR 0027](0027-security-headers-from-the-host.md): the frame is removed, the host counts requests
- Date: 2026-11-26
- Decided by: Alexis

## Context

ADR 0023 removed Cloudflare Web Analytics from the page that holds the photos, because a script in
that page can read the photos and send them out. The owner still wants basic visit counts.

Options considered:

- **Host-side counts** after the move to Cloudflare Workers hosting. There would be no script at all.
  But the service worker answers repeat visits from its cache, so the host would undercount them, and
  page details would need custom Worker code. The owner chose the frame.
- **The beacon on a same-origin landing page.** A script on the same origin can open the app with
  `window.open` and read it. Rejected.
- **A cross-origin, sandboxed frame.** Chosen.

## Decision

- **A counter page on another site.** `https://aasanchez.github.io/dnitapado-stats/` (repository
  `aasanchez/dnitapado-stats`) is a blank page with a strict CSP. It loads only Cloudflare's beacon.
  `github.io` is on the Public Suffix List, so `aasanchez.github.io` is a different site from
  `dnitapado.es`. The browser's same-origin policy keeps the frame out of the app's DOM, canvas and
  files, and Chromium's site isolation can run it in another process.
- **Sandbox.** The frame has `sandbox="allow-scripts"` only: an opaque origin, no popups, no forms,
  no top-level navigation, no same-origin privileges.
- **Nothing from the app.** The frame address has no query string and no fragment. The frame has
  `referrerpolicy="no-referrer"`. The app sends no `postMessage` and has no `message` listener. So
  Cloudflare sees only the counter page's address, the browser and the IP address.
- **When.** The frame is shown on the start screen only, at most once per page load, before any
  photo is chosen. It is removed when the person presses Start and is not shown again in that page
  load, even if they return to the start screen. It is shown only in production builds, on
  `dnitapado.es` and `www.dnitapado.es`, online, and never when the browser sends Global Privacy
  Control or Do Not Track (`src/analytics/stats-frame.ts`).
- **CSP of the app:** `frame-src https://aasanchez.github.io/dnitapado-stats/` only. `script-src` and
  `connect-src 'none'` do not change (ADR 0023). The service worker is not involved: a frame's
  navigation to another origin is not handled by this site's worker.
- **Tests.** `tests/e2e/third-party.spec.ts` checks the frame's address, sandbox and referrer
  policy. A hostile script in the frame tries to read the app's preview and gets nothing. The frame
  is never present while a photo is loaded, and a frame placed next to a photo on purpose still reads
  nothing. The frame is not shown offline, under GPC or DNT, or on other hosts. The unit test
  `tests/unit/stats-frame.test.ts` checks the host rules and the CSP.

## Consequences

- The public site makes up to three requests to other hosts, all from the frame and only on the
  start screen: the counter page, the beacon and its report.
- Cloudflare counts the counter page, not the app's pages. There is no referrer and no path.
- The beacon still has no SRI hash. A hostile beacon in the frame can send only what the frame
  itself can see, which is a blank page.
- Anyone can embed the counter page and inflate the counts. GitHub Pages cannot send
  `frame-ancestors`. This affects only the statistics.
- Changes to the counter page are reviewed in its own repository. Its README states its rules: no
  other script, no `postMessage`, the same strict CSP.
