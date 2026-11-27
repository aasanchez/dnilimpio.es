<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0041. Prerendered start screen: the Spanish start screen in index.html, replaced by the app

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis (SEO analysis of 27 November 2026, items 1 and 8)

## Context

The served `index.html` held only a title and the `noscript` line. JavaScript drew every word of the
start screen. Crawlers that run no JavaScript (Bing in most cases, DuckDuckGo, AI search crawlers,
link previews in WhatsApp, Telegram and LinkedIn) saw no content. The heading, the largest element
on the screen, appeared only after the entry script and its module preloads had loaded and run.

The SEO analysis also proposed to preload the heading's font and to tune the fallback font's
metrics, to lower the Largest Contentful Paint (LCP) and the layout shift when the font arrives.

## Decision

- The build renders `App.svelte` itself once, in Spanish, with Svelte's server renderer, and puts the
  HTML inside `<main id="app">` of `dist/index.html` (`scripts/prerender.ts`, plugin
  `prerenderStart` in `scripts/vite-plugins.ts`). No second copy of the markup is kept by hand, so the
  copy cannot drift from the app.
- It renders a first visit: Spanish, the no-cookies notice shown, not installed, not on iOS. The
  browser objects the start screen reads are set to these values only while it renders.
- Svelte's hydration comments and the two closed audit-prompt dialogs are removed. The build fails if
  the copy holds a script, a style element or attribute, an inline event handler, or any element or
  attribute that loads a file. The CSP and Trusted Types rules stay as they are (rule 3).
- The copy's root element carries `inert`: before the app starts, its buttons and links take no
  focus and no tap, so nobody presses a button that does nothing.
- `src/main.ts` empties `<main id="app">` and mounts the app, as before. It does not hydrate the
  copy: the app's first render can be in another language (the browser's), and a fresh mount keeps
  one code path.
- The language rule does not change here. A browser in another language still sees the app in its
  language once the script runs. Language addresses (`/?lang=en`) belong to the SEO work on language
  URLs.
- No font preload and no fallback metrics. Measured on a phone profile (390 px, 1.6 Mbit/s, 150 ms,
  CPU slowed four times), three runs each:
  - LCP of a Spanish browser: master 1156 to 1288 ms; prerendered 696 to 716 ms; prerendered with a
    preload of the heading's font 800 to 824 ms. With `font-display: swap` the heading is first
    painted in the fallback font, which counts as the LCP. A preload only takes bandwidth from that
    first paint.
  - Layout shift when the font arrives 800 ms late: 0.019 on a phone, 0.003 on a desktop. The limit
    for "good" is 0.1, so fallback metrics are not worth a second font definition.

## Consequences

- Every crawler reads the Spanish heading, lead, chips and Start button in the HTML. First paint of a
  Spanish visitor comes about 0.5 s earlier on a slow phone.
- A browser in another language first sees the Spanish copy and then the app in its own language.
  On the same slow phone its LCP went from about 1.35 s to about 1.7 s: the copy's fonts load while the
  scripts load. Without fonts the app starts as early as on master. This cost goes away when each
  language has its own address.
- Google renders JavaScript with an English browser, so until language addresses exist Google may
  still index the English text. Crawlers that do not run JavaScript see Spanish.
- `index.html` grows from about 8.5 kB to about 17.5 kB (4.7 kB to 8.7 kB with gzip). The service worker
  caches it as before; no new file is served.
- The build loads `App.svelte` and everything it imports in Node, once. A module that touches a
  browser object while the start screen renders fails the build: give the value in the prerender
  globals or read it inside `$effect`.
