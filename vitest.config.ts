// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Used by `pnpm test:coverage` (CI job `unit`), which fails below a threshold.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Browser-only glue: entry points and dynamic-import loaders. They run only in a real
      // browser, so the e2e tests cover them, not the unit tests.
      exclude: [
        'src/main.ts',
        'src/sw.ts',
        'src/ocr/worker.ts',
        'src/thanks/main.ts',
        'src/**/load-*.ts',
      ],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      // A floor, not a goal: each value is a little below the coverage measured when it was set.
      // Raise a value when coverage rises. Never lower one to get green (see CLAUDE.md).
      // Set 2026-11-27 at 1 point below the measured value, rounded down. Each glob is checked on
      // its files together, and those files count in the global values too.
      thresholds: {
        statements: 82,
        branches: 79,
        functions: 84,
        lines: 82,
        // Masks, raster, PDF and JPEG export: what the user downloads.
        'src/engine/**': { statements: 80, branches: 84, functions: 85, lines: 81 },
        // Field positions and their conversion to pixels: what gets covered.
        'src/{zones,redact}/**': { statements: 96, branches: 89, functions: 99, lines: 99 },
        // Trusted Types, WebRTC and framing lockdown, photo-step CSP.
        'src/security/**': { statements: 70, branches: 62, functions: 72, lines: 74 },
        // The fixed list of usage stats and the one request that sends it (ADR 0029).
        'src/stats/{schema,send}.ts': { statements: 97, branches: 92, functions: 99, lines: 99 },
      },
    },
  },
})
