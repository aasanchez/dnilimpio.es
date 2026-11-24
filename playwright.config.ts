// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, devices } from '@playwright/test';

// e2e tests run against the production build (`vite preview`), never the dev server,
// so they see the real CSP, SRI and bundle.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173/', trace: 'off' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: { command: 'npm run preview', url: 'http://localhost:4173/', reuseExistingServer: !process.env['CI'] },
});
