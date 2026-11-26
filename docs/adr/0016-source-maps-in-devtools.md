<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0016. Source maps readable in the developer tools: `connect-src 'self'`

- Status: superseded by [ADR 0022](0022-no-published-source-maps.md) (2026-11-26): no maps are published and `connect-src` has no `'self'`
- Date: 2026-11-26

## Context

The build is minified and publishes a source map (`.map`) next to every script, so anyone can read
the deployed code as the source in this repository. Since ADR 0015 the CSP said
`connect-src https://cloudflareinsights.com`. Browser developer tools (Chromium) load source maps
under the page's `connect-src`, so they refused every map:

> Connecting to 'https://aasanchez.github.io/dnilimpio.es/assets/index-….js.map' violates the
> following Content Security Policy directive: "connect-src https://cloudflareinsights.com".

The service worker would have refused them too: its deny-by-default rule (ADR 0004) answered only
the files it caches, and maps are not cached.

The owner wants the maps usable on purpose: they let people audit that the code running in their
browser is the code in the repository.

## Decision

- **CSP:** `connect-src 'self' https://cloudflareinsights.com`. Every other directive is unchanged.
  A CSP source with `'self'` cannot be narrowed to a path, and the build does not know its origin
  (it runs at the root and under a subpath, on several host names), so `'self'` is the smallest
  rule that works.
- **Service worker:** the build lists every source map that belongs to a file of this build, with
  its SHA-384, in the worker's manifest (`sourceMaps`). The worker answers a GET of exactly one of
  those URLs from the network, checked against its hash, and never caches it (`cache: 'no-store'`).
  A query string, another `.map`, or any other same-origin path is still refused without touching
  the network.
- **The app does not change.** It still never calls `fetch()` (lint bans), and the corner model still
  arrives as integrity-checked script modules (ADR 0007).

## Trade-off

`'self'` lets code in the page send requests to its own origin. GitHub Pages is static: it stores
nothing it receives, and the owner cannot read its access logs. GitHub itself, and a proxy in front
of a custom domain, would see the URL of such a request. So the remaining risk is that a compromised
script encodes data in a same-origin URL. The limits:

- Once the service worker controls the page, it refuses every same-origin request that is not a
  file or source map of this build, so such a request never leaves the browser.
- On the first visit and after a forced reload, the worker does not control the page; there only
  the CSP applies, and it now allows same-origin requests. This window already existed for
  same-origin images and scripts (`img-src 'self'`, `script-src 'self'`), so `'self'` in
  `connect-src` adds a new request type, not a new destination.
- The analytics beacon could already send to Cloudflare; `'self'` gives it no new third party.

## What the maps prove, and what they do not

A source map is produced by the same build as the script it describes. On its own it proves
nothing: a dishonest host could publish a map that does not match the code. It is a reading aid.
The proof comes from the files' hashes:

- The build is reproducible, and `scripts/build-manifest.ts` lists the SHA-384 of every file,
  maps included. Rebuild a commit and compare.
- Every deployed file, maps included, has signed build provenance (`gh attestation verify`).
- After each deploy, CI checks that the live site serves every built file byte for byte, maps
  included (`scripts/smoke.ts`).
- The page loads every script with an SRI hash, so the code that runs is the code those hashes
  cover.

## Alternatives

- **Keep `connect-src` without `'self'`.** Maps still download in a normal tab (a navigation is not
  under `connect-src`) and can be checked by hash, but the developer tools cannot use them. Rejected
  by the owner: the point of the maps is to read the running code in the developer tools.
- **Inline maps (`sourcemap: 'inline'`).** No request, but every script would grow several times in
  size for every visitor. Rejected.
- **The exact origin in `connect-src` instead of `'self'`.** It allows the same origin as `'self'`,
  so it is not stricter, and the same build serves several host names, so it would need one build
  per host. Rejected.
