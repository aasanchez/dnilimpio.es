<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0042. Automatic accessibility scan with axe-core

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis (test plan item 7: accessibility checks)

## Context

The keyboard tests (`tests/e2e/keyboard.spec.ts`) check focus, focus rings and the flow without a
mouse. They do not check names, roles, contrast, list structure or touch target size. Lighthouse
runs an accessibility audit in CI, but only on the start screen, and it only warns. A hand scan with
axe-core on 27 November 2026 found a real serious issue on the document choice screen (a radio group
on a `<ul>` that left its `<li>` items orphaned), which no existing test saw.

## Decision

- Add `@axe-core/playwright` as a dev dependency, pinned exactly. It brings `axe-core`. Neither runs
  install scripts, and neither ships in the built site.
- `tests/e2e/a11y.spec.ts` scans every screen: start screen, card guide, audit prompt, photo step
  (empty and with both photos), document choice, the editor's tools, box adjustment, corners,
  review (before and after the download) and the thanks page. It runs in Spanish and Arabic, on a
  wide screen in light mode and on a phone in dark mode.
- Rules: WCAG 2.0, 2.1 and 2.2 at levels A and AA, and axe's best practices. A serious or critical
  finding fails the test. Moderate and minor findings are printed in the test output, not failed.
- Each scan starts from the top of the page. axe measures touch targets as they are on screen, so a
  control scrolled away under the sticky top bar would count as too small.
- axe runs through Playwright's `evaluate`, outside the page's CSP. It is test code: it never runs in
  the site that users load, so the rule against third-party scripts in the page (ADR 0023) holds.

## Consequences

- A change that adds a serious or critical accessibility issue to any screen fails CI.
- One moderate finding is open: `page-has-heading-one`. The screens after the start screen have an
  `h2` heading and no `h1`. Fixing it touches 10 headings and about 40 test selectors.
- axe-core updates can add rules and fail CI on code that did not change. Dependabot groups these
  updates; a new finding is fixed or recorded here before the update is merged.
- The scan adds about 10 seconds per setup to the e2e run.
