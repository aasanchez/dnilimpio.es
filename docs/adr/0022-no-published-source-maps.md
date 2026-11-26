<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0022. No published source maps; no `'self'` in `connect-src`

- Status: accepted
- Date: 2026-11-26
- Supersedes: [ADR 0016](0016-source-maps-in-devtools.md)

## Context

ADR 0016 published a source map next to every script and added `'self'` to `connect-src`, so that
the browser's developer tools could load the maps. A security review (finding PRIV-003,
"Same-origin network exposure", 26 November 2026) pointed out the cost:

- `connect-src 'self'` lets any script in the page send a request to the site's own origin, with
  data in the URL, the headers or the body.
- The server does not need an upload endpoint to receive it. The host, or a proxy in front of a
  custom domain, sees the request even when the answer is 404.
- The service worker refuses such requests once it controls the page. It does not cover the first
  visit, a failed worker installation, a forced reload (which bypasses the worker), or a browser
  where service workers are off or missing.

ADR 0016 already named this limit. The owner decided that reading the maps in the developer tools
is not worth that exposure.

## Decision

- **No source maps.** `build.sourcemap` is `false`, and the OCR worker bundle is built without a
  map and without a `sourceMappingURL` comment. The build fails if any `.map` file ends up in
  `dist/` (`writePrecacheManifest()` in `scripts/vite-plugins.ts`).
- **CSP:** `connect-src https://cloudflareinsights.com` only, as before ADR 0016 (ADR 0015). Every
  other directive is unchanged.
- **Service worker:** the `sourceMaps` list and the `source-map` route are removed. A `.map` URL is
  an unknown path, so the worker refuses it like any other.
- **The OCR worker is not affected.** A dedicated worker does not inherit the page's CSP: its
  policy comes from its own script's response. The service worker gives it `connect-src <scope>ocr/`
  (`workerCsp()`, ADR 0009), which is what lets it `fetch()` its model, dictionary and WebAssembly
  files. The page never needed `connect-src` for them.

### What else loads from the same origin, and under which rule

Checked before removing `'self'`, against the code on `master`:

| Request | Context | Rule that applies |
| --- | --- | --- |
| Page scripts and the PDF chunk (`import()`), corner model and its runtime (`assets/ml/`, base64 in script modules, ADR 0007) | page | `script-src 'self'` + SRI |
| Corner model WebAssembly | page | compiled from bytes in memory (`wasmBinary`), `'wasm-unsafe-eval'`; no request |
| Styles, fonts, images | page | `style-src`, `font-src`, `img-src 'self'` |
| Web app manifest and its icons | page / browser | `manifest-src 'self'`; icons are fetched by the browser |
| Service worker registration and update checks | browser | `worker-src 'self'`; the update check is made by the browser, not by page code |
| OCR worker script | page | `worker-src 'self'` + Trusted Types policy |
| OCR models, dictionary, ONNX Runtime `.mjs` and `.wasm` (`ocr/`) | OCR worker | the worker's own CSP (`workerCsp()`): `script-src` and `connect-src` limited to `ocr/` |
| Precache and on-demand downloads | service worker | the page's CSP does not apply to the worker's own requests (ADR 0004) |

No row needs `connect-src` in the page. The app's code never calls `fetch()`, `XMLHttpRequest`,
`EventSource` or `navigator.sendBeacon` (lint bans in `eslint.config.js`).

## How to verify the deployed code without maps

A map was a reading aid, never proof: the same build makes it, so a dishonest host could publish a
map that does not match the code (ADR 0016 said so). The proof stays the same:

- **Reproducible build.** Rebuild a commit and compare: `scripts/build-manifest.ts` lists the
  SHA-384 of every file.
- **Provenance.** Every deployed file has signed build provenance (`gh attestation verify`).
- **Post-deploy check.** After each deploy, CI checks that the live site serves every built file
  byte for byte (`scripts/smoke.ts`).
- **SRI.** The page loads every script with an integrity hash, so the code that runs is the code
  those hashes cover.

To read the code, check out the commit: the source is `src/`. A local build with `build.sourcemap`
turned on is for reading only. Its chunk names and hashes differ from the deployed build, so the
hash comparison uses a build with the committed settings. (A local map build also trips the
build's no-maps check; turn that off in the same local change.)

## What remains

`'self'` stays in `script-src`, `style-src`, `img-src`, `font-src`, `manifest-src` and `worker-src`.
A compromised script could still try to encode data in the URL of an image or script from the
same origin while the service worker does not control the page. That window is unchanged by this
decision; it is described in the README ("What it cannot guarantee"). The page can no longer send
a request body or custom headers to its own origin, and no `fetch()`-class request at all.

The OCR worker gets its CSP from the service worker. While the worker does not control the page
(the same moments as above), GitHub Pages serves the OCR worker script without a CSP. This is also
unchanged by this decision.

## Alternatives

- **Keep ADR 0016.** Rejected by the owner after PRIV-003.
- **Publish maps but not reference them** (`sourcemap: 'hidden'`). The developer tools would not
  load them, and a person could still download and compare them. Rejected: the maps add nothing
  that rebuilding the commit does not give, and they are more files to serve, attest and check.
- **Inline maps** (`sourcemap: 'inline'`). No request, but every script would grow several times in
  size for every visitor. Rejected, as in ADR 0016.
