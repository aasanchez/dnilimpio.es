<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0036. Screenshot tests run in the pinned Playwright container

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis (test plan item 9: visual regression)

## Context

The e2e tests check behaviour, not looks. A style change can break a screen (overlapping text, a
button off screen, a broken right-to-left layout) and every test still passes. Playwright can compare
screenshots with stored baselines (`toHaveScreenshot`), but the pixels depend on the browser build,
the operating system and the system fonts. The app's own fonts are self-hosted, but none of them has
Arabic letters, so Arabic text uses a system font. A baseline made on one machine fails on another.

## Decision

- `tests/e2e/visual.spec.ts` takes 12 screenshots: the start screen, its footer, the editor, the
  editor's tools, the review and the stats page, at 390 × 844 px, in Spanish and Arabic. Chromium
  only. Baselines are PNG files in `tests/e2e/__screenshots__/`.
- These tests run only inside the official Playwright Docker image
  (`mcr.microsoft.com/playwright`), pinned by tag and digest, with the same version as
  `@playwright/test`. CI runs them in the job `visual` (a job `container`), developers with
  `pnpm test:visual` (`scripts/visual.sh`, needs Docker). `VISUAL=1` turns them on;
  `pnpm test:e2e` skips them.
- What changes on every build is hidden before each screenshot and keeps its space: the version,
  commit SHA and deploy time in the footer, and the text the stats page would send. The clock is
  fixed and the on-device AI is blocked, so each screen shows the same state on every run.

## Consequences

- A visible change to these screens fails CI until the baselines are updated with
  `pnpm test:visual:update` and the new PNG files are reviewed and committed with the change.
- The CI image is a new third-party input to the pipeline. It is a test environment only: it never
  builds or deploys what ships. It is pinned by digest, like the actions.
- Bumping `@playwright/test` means updating the image in `scripts/visual.sh` and `ci.yml` and
  regenerating every baseline.
- Developers without Docker cannot run these tests locally; CI still runs them, and its
  `visual-diff` artifact shows what changed.
- Only Chromium and one width are covered. Other browsers and widths can be added later as more
  baselines.
