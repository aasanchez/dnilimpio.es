# 0005. Guided phone-first flow and visual style

- Status: accepted
- Date: 2026-11-25

## Context

Most people use the tool on a phone. The first interface showed each step as one long page: both
photo pickers stacked, the field checklist below the card (so the card was off screen while you
changed it), seven buttons in a row in the editor, and front and back corners as two separate
steps. The owner asked for a full redesign of the workflow and the interface: modern, useful and
very easy to follow. A clickable mock-up was reviewed and approved before the build. The owner also
chose the colours, fonts and style of openaggregator.io.

## Decision

Flow:

- A start screen with the privacy promise and one **Start** button.
- Four steps with a progress bar: **Photos**, **Corners**, **Hide**, **Download**, then a **Done**
  screen. A back arrow in the top bar returns one step and keeps all work.
- One side at a time. After the front photo loads, the app moves to the back; after the front
  corners, it moves to the back corners.
- In **Hide**, the card stays at the top of the screen. The field list shows only the side on screen.
  Tapping a field on the card toggles it. Boxes and watermark live in tabs next to the field list.
- The main action is always in a sticky bar at the bottom of the screen (thumb zone).
- **Share** on the Done screen uses the Web Share API with the PDF file where the browser supports
  sharing files, and is hidden elsewhere. Nothing leaves the device unless the person picks an app
  in the system share sheet.

Visual style:

- Cream paper with a faint dot grid, near-black ink, one orange accent (#f36716). Orange used as
  text is darkened to #b8480a so it reaches 4.5:1 contrast; #f36716 is only used for fills and lines.
- Framed "window" panels with a mono title bar and a hard offset shadow, 2 px ink borders on buttons,
  dashed chips.
- Fonts: Bricolage Grotesque (text), JetBrains Mono (labels), Caveat (short hand-written notes).
- A dark variant follows `prefers-color-scheme`.

Fonts are self-hosted: the CSP allows `font-src 'self'` only, and the offline cache must hold every
file. Only the latin and latin-ext subsets ship (about 190 kB); Cyrillic and Arabic text falls back
to system fonts. The fonts are under the SIL Open Font Licence 1.1 (`LICENSES/OFL-1.1.txt`,
`REUSE.toml`).

No inline styles: the CSP has no `'unsafe-inline'` for styles, so all styling is in
`src/ui/styles.css` and the decorative card on the start screen is positioned with classes.
Since ADR 0017 the styles are written with Tailwind CSS utilities, still compiled to one static file.

## Consequences

- The engine (`src/engine/*`) is unchanged; only the screens, styles and strings changed.
- 56 new strings in every language; 9 strings that the new screens no longer use were removed.
- The e2e tests follow the new flow (start button, per-side field list, tool tabs).
- Planned automatic edge detection can pre-place the corner circles in the Corners step without
  changing the flow.
