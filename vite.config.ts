// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite';
import { securityHeaders, subresourceIntegrity } from './scripts/vite-plugins.ts';

// TODO: set once the GitHub repository is chosen.
const REPO_URL = process.env['REPO_URL'] ?? 'https://github.com/REPLACE-ME/dni-redactor';

export default defineConfig({
  define: { __REPO_URL__: JSON.stringify(REPO_URL) },
  // Relative base: the same dist/ works on the GitHub Pages subpath and when opened from disk.
  base: './',
  build: {
    minify: false,
    sourcemap: true,
    target: 'es2022',
    // The polyfill injects an inline script, which the CSP forbids.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  plugins: [securityHeaders(), subresourceIntegrity()],
});
