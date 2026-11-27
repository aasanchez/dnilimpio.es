// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, devices } from '@playwright/test'

/**
 * Specs that also run in Firefox and WebKit (Safari's engine): the privacy and security promise,
 * cleanup, export, offline and the front-only flow. Every test in these files runs there; a test that
 * cannot, because the browser really lacks the feature, says so with test.skip() and a reason, so the
 * report shows it. The other specs (layout, AI accuracy, languages, ...) run in Chromium only.
 */
export const CROSS_BROWSER_SPECS = [
  'privacy.spec.ts',
  'third-party.spec.ts',
  'security.spec.ts',
  'no-trusted-types.spec.ts',
  'cleanup.spec.ts',
  'export.spec.ts',
  'offline.spec.ts',
  'front-only.spec.ts',
]

// Screenshot comparisons (tests/e2e/visual.spec.ts) depend on the exact browser build and system
// fonts, so they run only inside the pinned Playwright container: `pnpm test:visual` locally, the
// `visual` job in CI. VISUAL=1 turns them on; every other run skips that file.
const VISUAL = process.env['VISUAL'] === '1'
const VISUAL_SPEC = 'visual.spec.ts'

// e2e tests run against the production build (`vite preview`), never the dev server,
// so they see the real CSP, SRI and bundle.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? 'github' : 'list',
  // Service workers are blocked by default so page.route() sees every request; tests/e2e/offline.spec.ts
  // turns them on.
  use: { baseURL: 'http://localhost:4173/', trace: 'off', serviceWorkers: 'block' },
  // One baseline per screen, with no platform suffix: the container is the only platform.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' } },
  // `pnpm test:e2e` runs the chromium project; `pnpm test:e2e:browsers` runs firefox and webkit.
  projects: VISUAL
    ? [{ name: 'visual', testMatch: VISUAL_SPEC, use: { ...devices['Desktop Chrome'] } }]
    : [
        { name: 'chromium', testIgnore: VISUAL_SPEC, use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: CROSS_BROWSER_SPECS },
        { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: CROSS_BROWSER_SPECS },
      ],
  webServer: { command: 'pnpm preview', url: 'http://localhost:4173/', reuseExistingServer: !process.env['CI'] },
})
