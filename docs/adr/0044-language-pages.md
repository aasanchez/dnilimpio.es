<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0044. Language pages: each language's address sends HTML in that language

- Status: proposed
- Date: 2026-11-27
- Decided by: Alexis (second SEO review of 27 November 2026, item 1)

## Context

[ADR 0038](0038-one-address-per-language.md) gave each language its own address, such as `/en`. The
host answered every one of them with the same `index.html`, and
[ADR 0041](0041-prerendered-start-screen.md) put the Spanish start screen in it. So the HTML at
`/en` had `lang="es"`, the Spanish title, description and Open Graph tags, and no canonical address.
JavaScript replaced all of it after load.

Link previews (WhatsApp, Telegram, LinkedIn, Facebook, X) and many crawlers (Bing in many cases, AI
crawlers) run no JavaScript. They saw 13 copies of one Spanish page. Google renders JavaScript, but the
first HTML and the rendered page disagreed on language, title and canonical.

## Decision

- The build renders the start screen once per language (`renderHomes` in `scripts/prerender.ts`) and
  writes one page per language but Spanish: `dist/<tag>.html`, the address's tag in lowercase, such as
  `en.html` or `ca-es-valencia.html` (`scripts/language-pages.ts`).
- Each page is made from the final `dist/index.html`, after the integrity hashes and the import map
  are in place. Only text changes: `lang` and `dir`, title, description, Open Graph text and locale,
  the canonical address, the `<noscript>` line and the prerendered start screen. Every script, hash
  and the CSP stay byte for byte as in `index.html`, so the host's page CSP fits every page. The build
  fails if `index.html` does not hold exactly one of each piece it replaces.
- `index.html` now names its own canonical address (`/`) in the HTML too. `src/seo/head.ts` still
  updates the head when the person changes language.
- The host shows `<tag>.html` at `/<tag>` with a rewrite in `_redirects` (status 200, not a redirect;
  `scripts/headers.ts`). `/<tag>/` still redirects to `/<tag>`.
- The service worker does the same: a page load of a language's address gets that language's page
  (`route()` in `src/offline/precache.ts`). The pages are saved at install, like `index.html`, so
  the address works offline. `LANGUAGE_SEGMENTS` lists the addresses in `precache.ts`, because
  `sw.js` may share no module with the app; a unit test checks it against `LANGS`.

## Consequences

- A link to `/en` or `/ar` previews in that language, and crawlers without JavaScript read each
  language's own start screen, title and canonical address.
- The service worker saves 12 more HTML files at install, about 19 kB each before compression.
- The build renders the start screen 13 times instead of once. It takes about a second more.
- `/<tag>.html` is also reachable by its file name. Its canonical address is `/<tag>`, so search
  engines keep that one.
- An address in another case, such as `/EN`, still gets `index.html` and the app switches the
  language, as before.
