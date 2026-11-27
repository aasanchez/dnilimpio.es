<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0045. Not-found pages: an unknown address gets status 404 and a static page in its folder's language

- Status: proposed
- Date: 2026-11-27
- Decided by: Alexis (second SEO review of 27 November 2026, item 4)

## Context

The host answered every unknown address with `index.html` and status 200
(`not_found_handling: "single-page-application"`). The service worker did the same. So:

- Search engines saw a working copy of the start page at any address, such as `/nope` or
  `/articles/old-slug`. That is a "soft 404": it wastes crawl budget and can put wrong addresses in
  the index.
- At a deeper address, such as `/a/b` or `/articles/nope`, the page's relative links (rule 6) pointed
  to the wrong folder. The page showed unstyled and its scripts did not load
  ([ADR 0039](0039-articles.md) named this as open work).

A page sent for any address cannot fix its relative links with `<base>`: the CSP has
`base-uri 'none'`. It cannot use inline styles either.

## Decision

- The build writes a static not-found page, `404.html`, into every folder people reach: the site's
  root and the Spanish articles folder (Spanish), and for every other language its folder and its
  articles folder (in that language). That is 26 pages (`src/notfound/page.ts`,
  `scripts/not-found-pages.ts`). Each page links the stylesheet, favicon and start page with `../`
  as many times as its folder is deep, so it is styled where it is sent.
- The page runs no script. It carries the CSP of the card guide pages (`NOT_FOUND_CSP` in
  `scripts/csp.ts` is `GUIDE_CSP`, `script-src 'none'`), so the CSP does not change. It tells search
  engines not to index it (`robots` `noindex`), and its one button goes to the start page in its
  language.
- The host sends the `404.html` of the nearest folder above the address, with status 404
  (`not_found_handling: "404-page"` in `wrangler.jsonc`). `/` and each language's address need a
  rewrite in `_redirects` in this mode; `scripts/headers.ts` writes them.
- The service worker does the same (`route()` in `src/offline/precache.ts`): a page load of an
  address it does not know gets the nearest saved `404.html` with status 404. The pages are saved at
  install, so this also works offline. An address with a query, such as `/?lang=en`, still gets the
  app. Only the start page, the language pages and the thanks page count as open app windows for the
  update check (`answersIdle`); a not-found page has no script to answer.
- `vite preview` picks the same page with the same status (`notFoundFor` in
  `scripts/vite-plugins.ts`), so the e2e tests see what the host sends. The post-deploy smoke test
  checks four unknown addresses on the live site.

## Consequences

- Unknown addresses are no longer indexed as copies of the start page.
- `/articles/nope`, `/en/nope` and `/en/articles/nope` show a styled page in the right language.
- An address deeper than a known folder, such as `/a/b/c` or `/en/x/y`, gets the root page with
  status 404. Its relative links point to the wrong folder, so it shows unstyled, but its text and
  status are right. Writing a page per depth would not end the problem, so the build does not.
- The service worker saves 26 more small HTML files at install, about 2 kB each before compression.
- Changing the host's `not_found_handling` back to `single-page-application` would bring the soft
  404s back; the smoke test fails then.
- Changes [ADR 0039](0039-articles.md): an unknown address in an articles folder no longer gets the
  app.
