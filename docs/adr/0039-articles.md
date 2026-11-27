<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0039. Articles: Markdown written by the build into static pages with no script

- Status: proposed
- Date: 2026-11-27
- Decided by: Alexis

## Context

The site needs a place for news, information and guides: text that people search for and share,
such as "how to send a copy of your DNI safely". The app is a single page that runs JavaScript, so
it is not that place. The text must have its own addresses, its own title and description, and must
reach search engines as plain HTML.

The articles must keep the site's promises: no tracking, no cookies, a strict CSP, files checked by
hash, relative URLs (rule 6), and every fact about a document cited (rule 9). Alexis wants clean
addresses, such as `/en/articles/<title>`, and each language lists only the articles written in it:
not every article exists in every language.

## Decision

1. **Written in Markdown, in the repository.** One file per article in
   `content/articles/<lang>/<slug>.md`. The folder is the language tag in lowercase
   (`es`, `en`, `ca-es-valencia`). The file name is the slug: lowercase letters, digits and hyphens.
   A pull request publishes an article, as it publishes any other change.
2. **A short front matter, checked by the build.** Between two `---` lines: `title` (at most 70
   characters), `description` (at most 160), `type` (`news`, `guide` or `info`), `date`, and
   optionally `updated`, `translationOf`, `draft` and `sources`. Our own small parser
   (`src/articles/front-matter.ts`), not a YAML library. An unknown key, a missing key or a bad value
   stops the build and names the file.
3. **Rendered at build time with `marked`, a dev dependency.** None of it reaches the browser. The
   build refuses, and names the file, when the Markdown holds raw HTML, a `#` heading (the title is
   the only `<h1>`), a root-absolute or protocol-relative link, a link of another scheme than
   `https`, `http` or `mailto`, or an image without a description or not stored next to the
   article. Links that leave the site open in a new tab and send no referrer.
4. **Addresses.** Spanish articles are at `articles/<slug>`, the others at
   `<tag>/articles/<slug>`, like the app's own addresses ([ADR 0038](0038-one-address-per-language.md)).
   Each language with at least one article has a list at `<folder>/`. A language without articles
   has no list and no link to one. Paths live in `src/articles/paths.ts`.
5. **Files with no extension, sent as HTML.** The host serves files as they are
   (`html_handling: none`). An article is the file `articles/<slug>`, and its list is the file
   `articles/index.html`. The rules in `scripts/headers.ts` add:
   - in `_headers`, `Content-Type: text/html; charset=utf-8` for every file in an articles folder;
   - in `_redirects`, `articles` to `articles/` (301), and `articles/` shows `articles/index.html`
     (200, a rewrite). The same for every language.
   The preview server follows the same rules.
6. **No script at all.** Each page carries `ARTICLE_CSP` (`scripts/csp.ts`), the same policy as
   the guide pages ([ADR 0040](0040-card-guide-pages.md)), as a `<meta>` tag: `script-src 'none'`,
   `connect-src 'none'`, only this site's stylesheet, fonts and images. The host also sends the app's
   policy as a header, and the browser applies both. The build checks that a page has no `<script>`
   and that its stylesheet carries an SRI hash. No other CSP changes.
7. **Translations.** A translation names the Spanish original with `translationOf`. Articles of one
   group link each other ("In other languages") and carry `hreflang` alternates, except Valencian,
   as on the start page. Each article's canonical address is its own.
8. **Search.** `sitemap.xml` lists every list page and every article. Each page has a title, a
   description and a canonical address. These are the only absolute links to the site itself.
9. **Service worker: saved on first visit, checked by hash.** Articles and their images
   (`assets/articles/`) are in the build's manifest, with their hashes, as on-demand files. They are
   not saved at install, so the install stays the same size however many articles there are. A page
   load of an article or a list, with no query string, gets that file, from the cache when saved
   and checked; `articles` without the slash is redirected, as the host does. Articles do not join
   `STATIC_PAGES`: `route()` recognises an articles folder by its shape and then asks the manifest.
   An article runs no script, so the worker does not wait for it before an update
   (`answersIdle()`). `src/articles/paths.ts` has no runtime import, because `sw.js` may share no
   code with the app.
10. **Drafts and dates.** `draft: true` keeps an article out of every build. An article dated after
    the build day is left out until a build on or after that day.
11. **Facts are cited.** A `guide` article must list its `sources` (ids from `src/guide/sources.ts`),
    as the card guide does (rule 9). The page shows them as a numbered list of official sources.
12. **Licence.** The text of the articles is licensed under CC BY-SA 4.0 (`REUSE.toml`,
    `LICENSES/CC-BY-SA-4.0.txt`), so others can quote and translate it. The code stays
    AGPL-3.0-or-later. Every page says so in its footer.
13. **The app links the list.** The start screen's footer links the list of its language, in a new
    tab, only when that language has articles (`__ARTICLE_LANGS__`, set by the build).

## Consequences

- Search engines read each article as plain HTML, with its own address, title and description.
- An article holds no photo and runs no code, so it adds nothing to the attack surface of the app.
- Writing an article needs no code: a Markdown file and a pull request. The build catches mistakes
  before they reach the site.
- One more dev dependency, `marked`, pinned exactly. It runs only during the build.
- An address in an articles folder that names no article gets the app's `index.html`, as any
  unknown address does. Its relative links do not work at that depth, so the page shows unstyled.
  The host and the service worker behave the same. A real "not found" page is separate work.
- Each new article makes the site one file larger, but the install does not grow.
