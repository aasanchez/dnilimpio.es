// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, devices } from '@playwright/test'

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
  projects: VISUAL
    ? [{ name: 'visual', testMatch: VISUAL_SPEC, use: { ...devices['Desktop Chrome'] } }]
    : [{ name: 'chromium', testIgnore: VISUAL_SPEC, use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'pnpm preview', url: 'http://localhost:4173/', reuseExistingServer: !process.env['CI'] },
})
