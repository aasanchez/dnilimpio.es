<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0027. Security headers from the host: dnitapado.es on Cloudflare Workers, with no analytics code

- Status: accepted. Changed by [ADR 0029](0029-opt-in-usage-stats.md): the host runs Worker code for `POST /stats` only.
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

The domain's DNS is already on Cloudflare (records in "DNS only" mode).

Visits were counted by Cloudflare Web Analytics in a sandboxed frame on another site
([ADR 0024](0024-visit-counter-in-isolated-frame.md)). That frame needed a second repository, a
second host and a `frame-src` exception in the CSP. The app passes it nothing, so it could report
only page loads, with a country and a device type. A host that serves the files can count requests
itself, with no code in the page.

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
- After the deploy, `smoke` checks that dnitapado.es serves this build byte for byte and sends
  exactly these headers.
- **One host.** CI no longer deploys to GitHub Pages. The old address
  <https://aasanchez.github.io/dnilimpio.es/> redirects to dnitapado.es, because the repository's
  Pages settings keep the custom domain. Two hosts would mean two policies to explain: one with
  headers and one without.
- The `<meta>` CSP stays as a fallback, with the service worker's headers, for any host that sends
  no headers (a fork, a local copy).
- The service worker now adds `frame-ancestors 'none'` as a second policy next to the host's CSP
  (`addPageHeaders()`), instead of replacing it.
- `vite preview` sends the same headers, so every e2e test runs under them.

**No analytics code.** The visit counter frame of ADR 0024 is removed, with its module, its
component, its `frame-src` exception and its tests. This supersedes ADR 0024.

- The site contains no script, frame, pixel or cookie that counts visits. Counts come from the
  host's own statistics of the requests it serves: requests, unique visitors by IP address and
  countries.
- The CSP has no `frame-src`, so `default-src 'none'` applies: the page can open no frame at all.
  The photo step's second policy ([ADR 0025](0025-intake-lockdown.md)) keeps its own
  `frame-src 'none'`.
- The no-cookies notice no longer mentions visit counts. The README says that the host counts
  requests.
- The counter page's repository (`aasanchez/dnitapado-stats`) and the Web Analytics site in
  Cloudflare are no longer used. The owner can delete both.
- `tests/e2e/third-party.spec.ts` fails if the page opens a frame, if a script from another site
  runs or if anything leaves for another site. The post-deploy check fails if the live site sets a
  cookie.

**HSTS preload** is not requested: leaving the preload list takes months.

**COEP is not set.** Assessed and left out: with the frame gone the page loads nothing from another
site, so `require-corp` would protect nothing more. Cross-origin isolation would only enable
`SharedArrayBuffer` and more precise timers. The app needs neither today; multithreaded OCR would be
the only reason. COEP would also have to be sent with the page and with both worker scripts, by the
host and by the service worker alike. A later ADR can add it, with a test.

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
- Visit counts are coarser than a script's. They include bots, and they undercount returning
  visitors, whose files come from the service worker's copy. Page views, paths and referrers need a
  paid Cloudflare plan. This is accepted for now: the site has no traffic to analyse yet.
- Cloudflare features that set a cookie (Bot Fight Mode and other bot or challenge features) must
  stay off for the zone, or the site would break its no-cookies promise. The post-deploy check
  fails on any `Set-Cookie` header.
- Any future counter that runs in the browser needs a new ADR and the owner's approval.
- A wrong header can break the app for everyone. The e2e suite runs under the same headers, and
  `pnpm test:e2e` was also run against `wrangler dev` (Cloudflare's local runtime).
- The repository now has a second lockfile, `deploy/pnpm-lock.yaml`. The weekly dependency check
  audits it too.
