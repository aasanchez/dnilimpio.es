<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0040. Card guide pages: static, crawlable, no script

- Status: proposed
- Date: 2026-11-27
- Decided by: Alexis (pending review of the pull request)

## Context

The card guide ([ADR 0014](0014-card-guide.md)) is the site's most useful text: every element of the
DNI 4.0, DNI 3.0 and TIE, what it is, how a copy can be misused, with official citations. It lives in
a dialog of the app. The dialog has no address, and the app writes its text with JavaScript, so a
search engine sees little of it and cannot link to it. The SEO analysis of 2026-11-27 lists this as
fix 5: publish the guide as pages of their own.

These pages must keep the site's promises: no tracking, no cookies, a strict CSP, files checked by
hash, relative URLs (rule 6), and every claim cited (rule 9).

## Decision

1. **One page per document**, at the root of the site next to `index.html`, like `thanks.html`:
   `guia-dni-4.html`, `guia-dni-3.html` and `guia-tie.html`. Flat `.html` files: the host serves
   them as files (`html_handling: none` in `wrangler.jsonc`), with no rewrite rule.
2. **Written by the build from the guide data**, not by hand and not from Markdown:
   `src/guide/page.ts` renders a page from `entries.ts`, `sources.ts` and the locale files, and the
   Vite plugin `scripts/guide-pages.ts` writes the three pages. The page and the dialog say the same
   thing, with the same citation numbers. A page cannot cite less than the dialog: the unit test
   checks every entry and every citation.
3. **Spanish only for now.** The site's main language. The page text (title, description, links)
   is in all 13 guide locale files (rule 8), so pages per language can follow with the per-language
   URLs work.
4. **No script at all.** Their own policy, `GUIDE_CSP` in `scripts/csp.ts`: `script-src 'none'`,
   `connect-src 'none'`, only this site's stylesheet, fonts and icons. The build checks each page has
   no `<script>` and links its stylesheet with an SRI hash. The host sends the same policy plus
   `frame-ancestors 'none'` (`scripts/headers.ts`), instead of the app's.
5. **Served by the service worker, from one list of static pages.** `STATIC_PAGES` in
   `src/offline/precache.ts` lists every page that is not the app: the thanks page and the guide
   pages. Other static pages, such as articles ([ADR 0039](0039-articles.md)), join the same list.
   `route()` answers a page load of exactly one listed path, in this build's manifest and without a
   query string, with that page. A page may be marked `onDemand`: it is then saved on its first visit
   instead of at install, still checked against its hash. The guide pages are saved at install
   (about 100 kB in total), so they also open offline. Every other page load still gets `index.html`.
6. **Updates.** Before a new build takes over, the service worker asks every window whether it is
   idle ([ADR 0030](0030-update-with-other-windows-open.md)). A guide page runs no script, so it
   cannot answer. It holds no photo and loads nothing later, so the worker does not ask it
   (`answersIdle()` in `src/offline/precache.ts`), and an open guide page never holds an update back.
7. **Links.** The pages link to each other and to the app, by relative URLs. Source links go to the
   official sites, with `rel="noopener noreferrer"`, and the page sends no referrer.
8. **Search.** `sitemap.xml` lists each page (`searchFiles` in `scripts/vite-plugins.ts`), and each
   page has a `<link rel="canonical">` with its absolute address (`SITE_URL`). The sitemap gives each
   page a `<lastmod>`: the newest `checked` day of its sources, because the text comes only from them.
   The `<title>` is a short form of about 60 characters (`pageSeoTitle`); the heading keeps the long
   one. Link preview tags (Open Graph) repeat the title, the description and the canonical address,
   and name the site's preview image. The canonical address, `og:url` and `og:image` are the only
   absolute links to the site itself; they are read by search engines and link previews, never
   loaded by the page. Every other link stays relative, so the build still works under a subpath.

## Consequences

- Search engines can read and link the guide; each page has its own title and description.
- The pages hold no photo and run no code, so they add nothing to the attack surface of the app.
- A change to the guide data changes the pages in the same build. There is nothing to keep in sync
  by hand.
- The install download grows by about 100 kB (the three pages, uncompressed).
- Pages in other languages are separate work (the per-language URLs of ADR 0038). This record does
  not decide them.
