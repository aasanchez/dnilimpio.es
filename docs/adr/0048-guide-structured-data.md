<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0048. Structured data on the card guide pages: Article and BreadcrumbList, never run

- Status: accepted
- Date: 2026-11-28
- Decided by: Alexis (second SEO review of 27 November 2026, remaining item 3, chosen 28 November 2026)

## Context

[ADR 0046](0046-structured-data.md) added one JSON-LD data block to the start pages and left it out
of the pages with no script: card guide, articles and not-found pages.

The card guide pages ([ADR 0040](0040-card-guide-pages.md)) are the pages people find through
search. Structured data tells search engines what they are: an article by the site, dated, that
cites official sources, and where it sits in the site (a breadcrumb trail). Without it, a search
engine has to guess both.

The guide pages have `script-src 'none'`. A JSON-LD element is a data block: the browser never runs
it, so the CSP does not apply to it and reports nothing. This holds under `script-src 'none'` too.
`tests/e2e/security.spec.ts` checks it in Chromium, Firefox and WebKit.

## Decision

- Each guide page carries one JSON-LD data block in its head (`guideStructuredData()` in
  `src/guide/page.ts`), with two items in `@graph`:
  - `Article`: the page heading as headline, its description, `inLanguage`, canonical address,
    preview image, `dateModified` (the newest day its sources were checked, the same day as the
    sitemap's `<lastmod>`), the site as author and publisher, and every cited source's address as
    `citation`.
  - `BreadcrumbList`: the site, then the document.
- All text comes from the guide data and the build, never from a person. `jsonLd()` in
  `src/seo/site.ts`, shared with the start pages, writes `<` as `<`, so no text can close the
  element.
- The CSP does not change. The build still refuses a guide page with any other `<script>` element
  (`withoutDataBlocks()` in `src/seo/site.ts`, used in `scripts/vite-plugins.ts`).
- Articles and not-found pages still get no block.

## Consequences

- Search engines can show a guide page as a dated article with a breadcrumb trail.
- `tests/unit/guide-page.test.ts` checks the block's content, that it is the page's only `<script>`
  element and that a translation cannot close it. `tests/unit/seo.test.ts` checks that
  `withoutDataBlocks()` removes nothing else. `tests/e2e/guide-pages.spec.ts` and
  `tests/e2e/security.spec.ts` check that the served page has one data block and no CSP report.
- Rule 3 of `CLAUDE.md` now names the build's JSON-LD data blocks, on the start pages and the guide
  pages, as its one exception.
