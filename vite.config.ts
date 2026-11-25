// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { securityHeaders, subresourceIntegrity } from './scripts/vite-plugins.ts'

// Override with REPO_URL for forks.
const REPO_URL = process.env['REPO_URL'] ?? 'https://github.com/aasanchez/dnilimpio.es'

export default defineConfig({
  define: { __REPO_URL__: JSON.stringify(REPO_URL) },
  // Relative base: the same dist/ works on the GitHub Pages subpath and when opened from disk.
  base: './',
  build: {
    // Minified for load time. Source maps are published next to each file, so the shipped code
    // can still be read and checked against the repository.
    minify: true,
    sourcemap: true,
    target: 'es2022',
    // The polyfill injects an inline script, which the CSP forbids.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    rolldownOptions: {
      // Two entries: the page, and the service worker, which must sit next to index.html as sw.js
      // so its scope covers the whole app.
      input: { index: 'index.html', sw: 'src/sw.ts' },
      output: { entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
  plugins: [svelte(), securityHeaders(), subresourceIntegrity()],
})
