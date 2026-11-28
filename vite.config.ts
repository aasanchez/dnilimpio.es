// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { defaultClientConditions, defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { normalizeSha, normalizeVersion } from './src/version/build-info.ts'
import { guidePages } from './scripts/guide-pages.ts'
import { notFoundPagesPlugin } from './scripts/not-found-pages.ts'
import { CONTENT_DIR, articleLangs, articleSitemap, articles, dayOf, loadArticles } from './scripts/articles.ts'
import { base64Import, hostHeadersInPreview, ocrAssets, prerenderStart, searchFiles, securityHeaders, subresourceIntegrity } from './scripts/vite-plugins.ts'
import { languagePages } from './scripts/language-pages.ts'
import { DEFAULT_SITE_URL, normalizeSiteUrl } from './src/seo/site.ts'
import type { Lang } from './src/i18n/langs.ts'

// Override with REPO_URL for forks.
const REPO_URL = process.env['REPO_URL'] ?? 'https://github.com/aasanchez/dnitapado.es'
// The site's public address, for search engines and link previews only (src/seo/site.ts). Forks set
// SITE_URL to their own address.
const SITE_URL = normalizeSiteUrl(process.env['SITE_URL'] ?? DEFAULT_SITE_URL)

// Version shown in the footer (src/version/build-info.ts). CI sets GITHUB_SHA; locally it comes from
// git; without either the footer shows no commit. SOURCE_DATE_EPOCH (seconds) fixes the build time.
function gitSha (): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}
const BUILD_SHA = normalizeSha(process.env['GITHUB_SHA'] ?? gitSha())
// Release version (ADR 0032): CI computes it from the git tags (scripts/release-version.ts) and sets
// RELEASE_VERSION. Without it, the footer shows no version, only the commit.
const BUILD_VERSION = normalizeVersion(process.env['RELEASE_VERSION'])
const epoch = Number(process.env['SOURCE_DATE_EPOCH'])
const BUILD_TIME = Number.isFinite(epoch) && epoch > 0 ? epoch * 1000 : Date.now()

// Articles (ADR 0039): read and checked once. The app links to the list only in languages that have one.
const ARTICLES = loadArticles(CONTENT_DIR, dayOf(BUILD_TIME))

// The corner model (src/detect/model.ts) and its runtime go to assets/ml/: the service worker caches
// that folder on first use instead of at install (src/offline/precache.ts).
const isModelPart = (ids: readonly string[]): boolean => ids.some((id) => /[\\/](scanic-ml|onnxruntime-(web|common))[\\/]|[\\/]src[\\/]detect[\\/]model\.ts$/.test(id))

// The prerendered start screen of each language (ADR 0041, 0044): rendered once, used for index.html
// and for the language pages.
const prerendered = new Map<Lang, string>()

export default defineConfig({
  define: {
    __REPO_URL__: JSON.stringify(REPO_URL),
    __SITE_URL__: JSON.stringify(SITE_URL),
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __ARTICLE_LANGS__: JSON.stringify(articleLangs(ARTICLES)),
  },
  // Relative base: the same dist/ works on the GitHub Pages subpath and when opened from disk.
  base: './',
  resolve: {
    // onnxruntime-web: the build without its own embedded WebAssembly. The corner model brings a
    // smaller runtime built for exactly its operators (scanic-ml).
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
  },
  build: {
    // Minified for load time. No source maps are published (ADR 0022): the developer tools would
    // need connect-src 'self' to load them. The shipped code is checked by hash against a rebuild
    // of the repository instead (reproducible build, provenance, scripts/smoke.ts).
    minify: true,
    sourcemap: false,
    target: 'es2022',
    // The polyfill injects an inline script, which the CSP forbids.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    rolldownOptions: {
      // Two entries: the page, and the service worker, which must sit next to index.html as sw.js
      // so its scope covers the whole app.
      // The OCR module is its own entry so its public API keeps its names; the interface loads it
      // on demand (src/ocr/load-ocr.ts). It is not part of the first page load.
      // The thanks page (ADR 0029) is a page of its own, so it never shares a document with the photos.
      input: { index: 'index.html', thanks: 'thanks.html', sw: 'src/sw.ts', ocr: 'src/ocr/ocr.ts' },
      preserveEntrySignatures: 'exports-only',
      output: {
        // What the start page and the thanks page (ADR 0029) both use goes into one chunk with a fixed
        // name, `app`: the Svelte runtime, the language code with Spanish (the other languages stay
        // chunks of their own, loaded on demand), the page lockdown and the stylesheet. The service
        // worker shares nothing with them (it may import no chunk).
        codeSplitting: {
          groups: [{ name: 'app', test: /[\\/]node_modules[\\/](\.pnpm[\\/])?svelte[@\\/]|[\\/]src[\\/]i18n[\\/](index\.ts|locales[\\/]es\.json)$|[\\/]src[\\/]security[\\/]lockdown\.ts$|[\\/]src[\\/]ui[\\/]styles\.css/ }],
        },
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: (chunk) => (isModelPart(chunk.moduleIds) ? 'assets/ml/[name]-[hash].js' : 'assets/[name]-[hash].js'),
        assetFileNames: (asset) => (isModelPart(asset.originalFileNames) ? 'assets/ml/[name]-[hash][extname]' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
  plugins: [base64Import(), tailwindcss(), svelte(), searchFiles(SITE_URL, articleSitemap(SITE_URL, ARTICLES)), securityHeaders(), prerenderStart(prerendered), guidePages(SITE_URL), notFoundPagesPlugin(), articles(import.meta.dirname, SITE_URL, ARTICLES), ocrAssets(), subresourceIntegrity({ pages: (html) => languagePages(html, SITE_URL, prerendered) }), hostHeadersInPreview()],
})
