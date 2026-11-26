<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0025. Security headers from the host: dnitapado.es on Cloudflare Workers

- Status: accepted
- Date: 2026-11-26
- Decided by: Alexis

## Context

GitHub Pages cannot send custom HTTP headers. The app's policy was therefore only a `<meta>` CSP,
plus a few headers that the service worker adds once it controls the page. This leaves gaps
(audit list of 26 November 2026, item 4):

- `frame-ancestors` works only as a header. A `<meta>` CSP ignores it. On a first visit, and in a
  frame on another site (which gets its own, empty service worker registration), only the page's
  own check in `src/security/lockdown.ts` stops framing.
- HSTS, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy`
  exist only as headers.
- A Web Worker takes its CSP from its own script's response. Before the service worker controls the
  page, the OCR worker ran with no CSP at all.

The domain's DNS is already on Cloudflare (records in "DNS only" mode). Visits are counted by
Cloudflare Web Analytics in a sandboxed frame on another site
([ADR 0024](0024-visit-counter-in-isolated-frame.md)).

## Decision

Serve <https://dnitapado.es> from **Cloudflare Workers static assets**, with no Worker code.

- `wrangler.jsonc` configures the host: files from `dist/`, every file at its own path with no
  redirect (`html_handling: none`), `/` and unknown paths answered with `index.html`, no
  `workers.dev` or preview address, and the custom domains `dnitapado.es` and `www.dnitapado.es`.
- `scripts/headers.ts` writes the `_headers` file at deploy time, from the build's `index.html`:
  - every response: the page CSP (the `<meta>` policy of `scripts/csp.ts` with the import map's hash,
    plus `frame-ancestors 'none'`), `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
    `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a `Permissions-Policy` that
    allows only the camera, clipboard writing and Web Share for the app itself,
    `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` and
    `X-Frame-Options: DENY`;
  - `sw.js`: its own CSP, `default-src 'none'; connect-src 'self'`;
  - `ocr/worker.min.js`: its own CSP, `default-src 'none'; script-src 'self' 'wasm-unsafe-eval';
    connect-src 'self'`. The service worker still replaces it with the narrower `workerCsp()`
    (the `ocr/` folder only).
- CI deploys the same tested `dist` artifact. `_headers` is added only in the deploy job, so the
  attested, reproducible artifact is unchanged. `wrangler` is pinned in `deploy/pnpm-lock.yaml`,
  installed without install scripts, and only by that job. The API token lives in the GitHub
  environment `cloudflare`.
- After the deploy, `smoke-cloudflare` checks that dnitapado.es serves this build byte for byte and
  sends exactly these headers.
- The `<meta>` CSP stays as a fallback. GitHub Pages keeps receiving the same build, so the old
  address <https://aasanchez.github.io/dnilimpio.es/> keeps working with the `<meta>` CSP and the
  service worker's headers.
- The service worker now adds `frame-ancestors 'none'` as a second policy next to the host's CSP
  (`addPageHeaders()`), instead of replacing it.
- `vite preview` sends the same headers, so every e2e test runs under them.

**HSTS preload** is not requested: leaving the preload list takes months.

**COEP is not set.** `require-corp` would block the visit counter's frame
([ADR 0024](0024-visit-counter-in-isolated-frame.md)) unless that page, on GitHub Pages, sent COEP and
CORP too, and GitHub Pages cannot send headers. `credentialless` is not available in Safari. Cross-origin isolation would only
enable `SharedArrayBuffer`, for multithreaded OCR, which the app does not need today. A later ADR can
add it, with a test.

## Alternatives

- **Cloudflare proxy in front of GitHub Pages, with Transform Rules.** The headers would live in the
  dashboard, not in the repository, so no pull request reviews them and no test covers them. GitHub
  cannot renew its certificate behind the proxy, so the Cloudflare-to-GitHub link would have to run
  in SSL "Full" mode, which does not check the certificate. Two parties would serve the site.
- **Netlify with a `_headers` file.** The headers would be in the repository too, but it adds a
  third provider and gains nothing over Cloudflare, which already runs the DNS.
- **Stay on GitHub Pages.** No host headers. The gaps above stay.

## Consequences

- Cloudflare terminates TLS and serves the files. It sees request metadata (IP address, browser,
  paths), as GitHub did. It never receives photos, which never leave the device. SRI, the service
  worker's hash checks, the provenance attestation and the byte-for-byte smoke test detect any file
  that the host changes.
- Cloudflare features that rewrite HTML (Rocket Loader, Email Obfuscation, automatic Web Analytics
  injection) must stay off for the zone. The smoke test fails if any of them changes a file.
- Cloudflare can count visits on the server side, so the counter frame could be removed later
  without losing visit counts.
- A wrong header can break the app for everyone. The e2e suite runs under the same headers, and
  `pnpm test:e2e` was also run against `wrangler dev` (Cloudflare's local runtime).
- The repository now has a second lockfile, `deploy/pnpm-lock.yaml`. The weekly dependency check
  audits it too.
