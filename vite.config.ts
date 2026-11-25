// SPDX-License-Identifier: AGPL-3.0-or-later
import { defaultClientConditions, defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { base64Import, securityHeaders, subresourceIntegrity } from './scripts/vite-plugins.ts'

// Override with REPO_URL for forks.
const REPO_URL = process.env['REPO_URL'] ?? 'https://github.com/aasanchez/dnilimpio.es'

// The corner model (src/detect/model.ts) and its runtime go to assets/ml/: the service worker caches
// that folder on first use instead of at install (src/offline/precache.ts).
const isModelPart = (ids: readonly string[]): boolean => ids.some((id) => /[\\/](scanic-ml|onnxruntime-(web|common))[\\/]|[\\/]src[\\/]detect[\\/]model\.ts$/.test(id))

export default defineConfig({
  define: { __REPO_URL__: JSON.stringify(REPO_URL) },
  // Relative base: the same dist/ works on the GitHub Pages subpath and when opened from disk.
  base: './',
  resolve: {
    // onnxruntime-web: the build without its own embedded WebAssembly. The corner model brings a
    // smaller runtime built for exactly its operators (scanic-ml).
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
  },
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
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: (chunk) => (isModelPart(chunk.moduleIds) ? 'assets/ml/[name]-[hash].js' : 'assets/[name]-[hash].js'),
        assetFileNames: (asset) => (isModelPart(asset.originalFileNames) ? 'assets/ml/[name]-[hash][extname]' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
  plugins: [base64Import(), svelte(), securityHeaders(), subresourceIntegrity()],
})
