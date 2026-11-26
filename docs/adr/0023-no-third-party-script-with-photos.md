<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0023. No third-party script in the page that holds the photos

- Status: accepted
- Date: 2026-11-26
- Decided by: Alexis
- Supersedes: [ADR 0015](0015-cookieless-analytics.md)

## Context

ADR 0015 added Cloudflare Web Analytics. Its beacon loaded from
`https://static.cloudflareinsights.com/beacon.min.js` into the same document as the photos. The
beacon had no SRI hash, because Cloudflare publishes it at an address without a version. The CSP
(`connect-src https://cloudflareinsights.com`), Trusted Types and the service worker all let it
send requests with any body to Cloudflare's report address.

An audit on 26 November 2026 showed the cost. A substitute beacon, served at the same address, read
the unredacted preview and sent 16,000 bytes of its PNG to the report address. This also worked
while the service worker controlled the page. So the claim "your photos never leave your device"
depended on Cloudflare's script, not on the browser's rules.

ADR 0015 had accepted this risk ("a compromised beacon could read the page"). The audit shows that
the risk breaks the product's main promise, so it cannot be accepted.

Options considered:

- **Self-host a pinned copy with SRI.** This stops a swapped script. But a script in the page still
  has the page's privileges: it can read the canvas and send what it reads to its report address.
  Pinning is not isolation. Rejected as a fix on its own.
- **Load the beacon only on the start screen, or remove it later.** A script keeps its privileges
  after its element is removed. A same-origin landing page can open the app with `window.open` and
  read it, and GitHub Pages cannot send COOP to prevent that. Rejected.
- **Cloudflare's proxy, with no script.** This gives server-side counts. But Cloudflare would
  terminate TLS and could change any file it serves, and GitHub's certificate renewal fails behind
  the proxy. Left for later, as an infrastructure decision.
- **A counter in a cross-origin, sandboxed frame.** The browser's same-origin policy keeps the frame
  out of the app's DOM and canvas. The owner chose this to keep basic visit counts. It comes in a
  separate change with its own ADR, because it needs a second site and a `frame-src` rule.

## Decision

- **No third-party script runs in the page that holds the photos.** The beacon, its loader
  (`src/analytics/`) and its constants are removed.
- **CSP:** `script-src 'self' 'wasm-unsafe-eval'` (plus the import map's hash) and
  `connect-src 'none'`. Every other directive is unchanged. The OCR worker keeps its own CSP
  (`workerCsp()` in `src/offline/precache.ts`).
- **Trusted Types:** the `default` policy accepts two same-origin script URLs only, `sw.js` and
  `ocr/worker.min.js`.
- **Service worker:** no exception. The `analytics` route and the manifest's `analytics` entry are
  removed. Every request to another origin is refused. A leftover `analytics` key in a manifest is
  ignored.
- **Test:** `tests/e2e/third-party.spec.ts` serves the build as the public site (`dnitapado.es` at
  the root and `aasanchez.github.io/dnilimpio.es/` under a subpath). It loads a card, with and
  without the service worker, and fails if any script from another origin is added or runs, or if
  any request leaves the site. It also repeats the audit's attack: adding the old beacon's address is
  refused, and page code that reads the preview cannot send it to Cloudflare. The spec fails on the
  build before this change.

## Consequences

- There are no visit counts until the cross-origin counter is added.
- The page can send nothing to anyone. The only requests are the site's own files.
- The notice, the README and the AI audit prompt no longer describe an analytics exception.
- Adding any third-party script to the page again needs a new ADR and the owner's approval, and it
  breaks `tests/e2e/third-party.spec.ts`.
