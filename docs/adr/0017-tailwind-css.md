<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0017. Styles with Tailwind CSS v4; two-column layout on wide screens

- Status: accepted
- Date: 2026-11-26

## Context

All styling was in one hand-written stylesheet, `src/ui/styles.css` (565 lines), with CSS custom
properties as design tokens (ADR 0005). Every screen was a single 40rem column, phone first. On a
desktop the picture, the controls and the main button were stacked in a narrow strip, and the
editor's controls scrolled the card out of view.

The maintainer asked to move to Tailwind CSS, as far as possible, and to use the move to improve the
layout on wide screens. Small design changes are accepted.

Constraints that do not change:

- The CSP allows styles from the app's own origin only (`style-src 'self'`): no inline styles.
- The app works offline; every file is precached.
- Fonts stay self-hosted. The openaggregator.io look (cream, ink, one orange accent, hard shadows,
  three typefaces) and the dark theme stay.

## Decision

- **Tailwind CSS v4** with its Vite plugin (`@tailwindcss/vite`), both pinned exactly as dev
  dependencies. Tailwind runs at build time only and writes one static stylesheet, which the page
  loads with an integrity hash like every other file. Nothing runs in the browser, so the CSP and the
  offline cache are unchanged. The Play CDN (styles generated in the browser) is not used.
- **The palette is the theme.** `@theme` in `src/ui/styles.css` replaces Tailwind's default colours
  with the app's own (`--color-*: initial`), so only `bg-paper`, `text-ink`, `border-accent` and the
  other palette names exist. The dark theme overrides the same variables under
  `prefers-color-scheme: dark`. Fonts, the hard shadows and the two animations are theme values too.
  Right-to-left text switches the mono and hand fonts to the sans stack, as before.
- **Utilities in the markup** for layout, spacing, type and one-off styles. Shared pieces that repeat
  on every screen (buttons, chips, windows, tabs, switches, the action bar) are short component
  classes in `@layer components`, written with `@apply`, so the markup stays readable and one change
  restyles all of them. SVG drawing rules (the ghost card) and the canvas corner editor stay in CSS.
- **Wide screens (from 64rem, `lg`)**: a step is a two-area grid (`split` utility). The picture
  (photo, corner editor, redacted card, review images) is on the left and stays in view while
  scrolling; the heading, controls and main button are on the right. The progress steps move into the
  top bar. The start screen shows the promise and the start button beside the demo window, and the
  no-cookies notice becomes a banner fixed at the bottom of the window (80 % of the width, as on
  phones). Steps with no picture (document, straightening) are one centred column.
- **Phones keep their layout**: one column in source order, the main button in a sticky bar at the
  bottom (thumb zone).
- No component library (shadcn-svelte, bits-ui): the app needs only native elements (buttons,
  dialogs, radios, checkboxes), and those libraries would bring their own look and probably inline
  style attributes, which the CSP blocks.
- Class names that the e2e tests and the scripts use (for example `corner-editor`, `dropzone`,
  `is-dragover`, `progress`, `live`, `guide`) stay on their elements.

## Consequences

- The start-page stylesheet grows from about 6.5 kB to about 10.3 kB gzip, mostly Tailwind's base
  reset (preflight) and the utilities. The size budget for it goes from 6 kB to 12 kB.
- Styles live next to the markup they style; `src/ui/styles.css` holds the theme, a few base rules
  and the shared pieces (about 350 lines, half of them the font declarations and the theme).
- Two more dev dependencies (MIT): `tailwindcss` and `@tailwindcss/vite`. They are not shipped; only
  the generated CSS is.
- A dynamic value must never go into a `style` attribute (the CSP blocks it): use classes, or set it
  from script as the canvas code does.
