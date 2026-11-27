<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0038. One address per language: `/` is Spanish, `/en` and so on for the others, hreflang

- Status: proposed
- Date: 2026-11-27
- Decided by: Alexis

## Context

The app picked its language from the browser (`navigator.languages`). Every language shared one
address. Search engines index one version per address, and Google's crawler reports English, so it
most likely indexed the English page at `/`, and Spanish searches had no Spanish page to show. The
SEO report of 27 November 2026 (item 6) asks for one address per language and hreflang links.

Options for the addresses:

1. A query string (`/?lang=en`). No hosting change, but Alexis prefers clean paths.
2. Folders with a page file each (`/en/` serving `en/index.html`). The host serves files by name
   (`html_handling: "none"`, because the service worker downloads `index.html` by name and a page
   load must never get a redirect), so `/en/` would get the root `index.html`, whose relative URLs
   then point at `/en/assets/…`. It needs Worker code or a change of `html_handling`.
3. A path without a trailing slash (`/en`). The host answers it with `index.html` (SPA fallback),
   and the page's relative URLs (`./assets/…`) still point at the site's folder, at the domain root
   and under a subpath (rule 6). The service worker already answers every page load with
   `index.html`, so it also works offline.

## Decision

Option 3. Alexis chose path addresses on 27 November 2026.

- `/` is Spanish, whatever the browser's language. Every other language is `/<tag>` in lowercase:
  `/en`, `/fr`, `/ar`, `/ca-es-valencia`. Paths are read in any case; an unknown path opens Spanish.
- `/en/` (with a slash) redirects to `/en`, and `/es` and `/es/` redirect to `/`, with a 301. The host
  does it with a `_redirects` file written at deploy time next to `_headers` (`scripts/headers.ts`),
  and the service worker does the same (`languageRedirect()` in `src/offline/precache.ts`), so it
  also works offline. The preview server copies the host.
- The address follows the selector (`history.replaceState`, no new history entry), so a copied link
  or a bookmark opens in the same language. The logo and the thanks page's links keep the language.
- Each language address is its own canonical page (`canonicalUrl(site, lang)`, set by
  `src/seo/head.ts`).
- The static HTML lists every language as `<link rel="alternate" hreflang>`, plus `x-default` on
  `/`. The list is the same on every version, so it is written at build time.
- `sitemap.xml` lists every language address, each with the same alternates.
- Valencian keeps its address but is not an hreflang alternate: search engines accept a language and
  a region, not the variant subtag of `ca-ES-valencia`.

## Consequences

- A visitor whose browser is in another language sees Spanish at `/` and switches with the selector.
  Links shared from the app, and search results in other languages, carry the language path.
- The page's first render no longer depends on the browser. The thanks page still uses the
  session's language, or the browser's when it has none.
- No new request, storage or CSP change. The language lives only in the address.
- Pages under a language, such as articles (ADR 0039), are their own files at deeper paths, for
  example `/en/articles/<slug>`; they do not depend on this page's relative URLs.
- e2e tests that need English open `/en` instead of setting the browser's locale.
