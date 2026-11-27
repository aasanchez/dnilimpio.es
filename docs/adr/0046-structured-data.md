<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0046. Structured data: one JSON-LD data block on the start pages, never run

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis (second SEO review of 27 November 2026, item 5)

## Context

Search engines read structured data (schema.org) to know what a page is: here, a free web app. The
usual form is JSON-LD, a `<script type="application/ld+json">` element in the page.

Rule 3 of `CLAUDE.md` says "no inline scripts", and the CSP allows one inline script only, the
import map, by its hash. A JSON-LD element is not a script the browser runs. HTML calls it a "data
block": the browser does not run it, so the CSP does not apply to it and reports nothing. A test in
Chromium with `script-src 'none'` and Trusted Types confirmed this before the decision.

The other ways to add structured data are worse: microdata or RDFa attributes would have to go into
the prerendered start screen, which the app replaces, and a separate file is not read by search
engines.

## Decision

- The build writes one JSON-LD data block into the head of `index.html`, in place of the
  `<!-- structured-data -->` marker (`structuredData()` in `src/seo/site.ts`). The language pages
  ([ADR 0044](0044-language-pages.md)) copy it unchanged.
- It describes the site as a `WebApplication`: name, address, preview image, category, any
  operating system, the 13 languages, free (`price` 0), and the licence. It holds no text that
  depends on the language, so the app never has to change it when the person switches language.
- The CSP does not change. Rule 3 now names this block as its one exception: a data block of type
  `application/ld+json`, written by the build, with no text from a person. `<` is written as
  `<`, so no text can close the element.
- Pages with no script (card guide, articles, not-found pages) get no block.

## Consequences

- Search engines can show the site as a free app.
- `tests/unit/seo.test.ts` checks the block's type and content and that nothing can close it.
  `tests/e2e/security.spec.ts` checks that `/`, `/en` and `/ar` hold the same single block, that
  no other inline script exists but the import map, and that the browser reports no CSP violation.
- Any future block must also be a data block of a type the browser does not run. A block of type
  `text/javascript` or `module` would run, and the CSP would refuse it.
