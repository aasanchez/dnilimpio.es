// SPDX-License-Identifier: AGPL-3.0-or-later
// Build-only hardening: CSP + referrer meta tags (§5.1, §5.2) and Subresource Integrity (§5.2).
// The dev server is left without CSP because Vite's HMR client needs inline code and a WebSocket.

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { gunzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { CSP, cspWithScriptHashes } from './csp.ts'
import { BEACON_ENDPOINT, BEACON_SCRIPT } from '../src/analytics/endpoints.ts'
import { SW_FILE, isOnDemand, isPrecached, isSourceMap, parseManifest, type PrecacheFile } from '../src/offline/precache.ts'

export function securityHeaders (): Plugin {
  return {
    name: 'dni-redactor:security-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      // Inserted right after <meta charset> so the policy applies before any script or stylesheet.
      handler: (html) => {
        const anchor = '<meta charset="utf-8" />'
        if (!html.includes(anchor)) throw new Error('index.html must contain <meta charset="utf-8" />')
        const csp = CSP.replaceAll("'", '&#39;')
        return html.replace(
          anchor,
          `${anchor}\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="no-referrer" />`
        )
      },
    },
  }
}

const sri = (bytes: Buffer | string): string => `sha384-${createHash('sha384').update(bytes).digest('base64')}`

/**
 * Subresource Integrity for every script and stylesheet:
 * - adds integrity="sha384-…" to each local <script src> and <link rel=stylesheet|modulepreload>;
 * - for JavaScript chunks loaded on demand (dynamic import), adds an inline import map with an
 *   `integrity` entry per chunk, so the browser checks them too, and allows exactly that inline
 *   script in the CSP by its SHA-256 hash.
 */
export function subresourceIntegrity (): Plugin {
  let config: ResolvedConfig
  return {
    name: 'dni-redactor:sri',
    apply: 'build',
    enforce: 'post',
    configResolved (c) {
      config = c
    },
    closeBundle () {
      const outDir = resolve(config.root, config.build.outDir)
      const htmlPath = join(outDir, 'index.html')
      const html = readFileSync(htmlPath, 'utf8')
      const tagRe = /<(script|link)\b([^>]*?)\s(src|href)="([^"]+)"([^>]*)>/g
      const out = html.replace(tagRe, (whole, tag: string, pre: string, attr: string, url: string, post: string) => {
        if (/^[a-z]+:|^\/\//i.test(url) || whole.includes('integrity=')) return whole
        if (tag === 'link' && !/rel="(stylesheet|modulepreload)"/.test(whole)) return whole
        const file = join(outDir, url.replace(/^\.?\//, '').replace(config.base.replace(/^\.?\//, ''), ''))
        return `<${tag}${pre} ${attr}="${url}" integrity="${sri(readFileSync(file))}"${post}>`
      })

      // Chunks not referenced from the HTML are loaded with import(): list them in the import map.
      // That includes the corner model's files under assets/ml/ (the runtime's .mjs loader too).
      const lazy = listFiles(join(outDir, 'assets')).filter((f) => /\.m?js$/.test(f) && !out.includes(`assets/${f}"`))
      if (lazy.length === 0) {
        writeFileSync(htmlPath, out)
        writePrecacheManifest(outDir)
        return
      }
      const integrity = Object.fromEntries(lazy.map((f) => [`./assets/${f}`, sri(readFileSync(join(outDir, 'assets', f)))]))
      const importMap = JSON.stringify({ imports: {}, integrity })
      const hash = `sha256-${createHash('sha256').update(importMap).digest('base64')}`
      const firstModule = out.indexOf('<script type="module"')
      if (firstModule === -1) throw new Error('dist/index.html has no module script')
      const cspMeta = /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/
      if (!cspMeta.test(out)) throw new Error('dist/index.html has no CSP meta tag')
      const withMap = out.slice(0, firstModule) + `<script type="importmap">${importMap}</script>\n    ` + out.slice(firstModule)
      writeFileSync(htmlPath, withMap.replace(cspMeta, `$1${cspWithScriptHashes([hash]).replaceAll("'", '&#39;')}$2`))
      writePrecacheManifest(outDir)
    },
  }
}

/** Every file under `dir`, as paths relative to it with forward slashes, sorted. */
function listFiles (dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listFiles(dir, `${prefix}${e.name}/`) : [`${prefix}${e.name}`]))
    .sort()
}

const PLACEHOLDER = /(["'`])__DNI_PRECACHE_MANIFEST__\1/

/**
 * Writes the offline file list into dist/sw.js: every file of the build (final bytes, so this runs
 * after SRI has rewritten index.html) with its SHA-384, and a version derived from all of them and
 * from the worker's own code.
 * Any change to any file gives a new sw.js, which is what makes browsers install the update.
 */
function writePrecacheManifest (outDir: string): void {
  const swPath = join(outDir, SW_FILE)
  const sw = readFileSync(swPath, 'utf8')
  if (!PLACEHOLDER.test(sw)) throw new Error('dist/sw.js has no precache manifest placeholder')
  if (/^\s*import\b|\bimport\s*\(/m.test(sw)) throw new Error('dist/sw.js must not import other chunks')
  const all: PrecacheFile[] = listFiles(outDir).filter(isPrecached).map((path) => ({ path, integrity: sri(readFileSync(join(outDir, path))) }))
  const files = all.filter((f) => !isOnDemand(f.path))
  const onDemand = all.filter((f) => isOnDemand(f.path))
  // Source maps of the files above, so the worker can serve them to the developer tools (ADR 0016).
  const described = new Set(all.map((f) => `${f.path}.map`))
  const sourceMaps: PrecacheFile[] = listFiles(outDir).filter((p) => isSourceMap(p) && described.has(p)).map((path) => ({ path, integrity: sri(readFileSync(join(outDir, path))) }))
  // The worker's own code is part of the version: a worker-only change still gets a new cache name,
  // so a failed install can never delete the cache the active worker is using.
  const version = createHash('sha256')
    .update(all.map((f) => `${f.path} ${f.integrity}`).join('\n'))
    .update(sourceMaps.map((f) => `\n${f.path} ${f.integrity}`).join(''))
    .update(`\nsw.js ${sri(sw)}`)
    .digest('hex').slice(0, 16)
  const json = JSON.stringify({ version, files, onDemand, sourceMaps, analytics: { script: BEACON_SCRIPT, endpoint: BEACON_ENDPOINT } })
  parseManifest(json) // same checks as the worker runs
  writeFileSync(swPath, sw.replace(PLACEHOLDER, () => JSON.stringify(json)))
}

/**
 * `import data from './file.bin?base64'` gives the file's bytes as a base64 string inside a
 * JavaScript module. The corner model and its WebAssembly runtime are loaded this way so that the
 * page never needs fetch() for them: it import()s a script from its own origin, and the import map
 * checks that script's integrity. (connect-src allows 'self' only so the developer tools can read
 * the source maps, ADR 0016; the app itself fetches nothing.)
 */
export function base64Import (): Plugin {
  const SUFFIX = '?base64'
  return {
    name: 'dni-redactor:base64-import',
    enforce: 'pre',
    async resolveId (source, importer) {
      if (!source.endsWith(SUFFIX)) return null
      const resolved = await this.resolve(source.slice(0, -SUFFIX.length), importer, { skipSelf: true })
      return resolved ? `${resolved.id}${SUFFIX}` : null
    },
    load (id) {
      if (!id.endsWith(SUFFIX)) return null
      const file = id.slice(0, -SUFFIX.length)
      this.addWatchFile(file)
      return { code: `export default ${JSON.stringify(readFileSync(file).toString('base64'))}`, map: { mappings: '' } }
    },
  }
}

/**
 * OCR engine files, served from our own origin under ocr/ (never from a CDN): the Tesseract.js worker,
 * the WebAssembly core (three builds; the worker picks the one the browser supports, LSTM only) and
 * the Spanish language data. The service worker downloads them on first use and checks each against
 * its SHA-384 (see src/offline/precache.ts, ON_DEMAND_DIR).
 */
export function ocrAssets (): Plugin {
  const require = createRequire(import.meta.url)
  const tesseract = dirname(require.resolve('tesseract.js/package.json'))
  const core = dirname(createRequire(join(tesseract, 'package.json')).resolve('tesseract.js-core/package.json'))
  const spa = dirname(require.resolve('@tesseract.js-data/spa/package.json'))
  const files: Record<string, string> = {
    'ocr/worker.min.js': join(tesseract, 'dist/worker.min.js'),
    'ocr/worker.min.js.map': join(tesseract, 'dist/worker.min.js.map'),
    'ocr/worker.min.js.LICENSE.txt': join(tesseract, 'dist/worker.min.js.LICENSE.txt'),
    'ocr/tesseract-core-lstm.wasm.js': join(core, 'tesseract-core-lstm.wasm.js'),
    'ocr/tesseract-core-simd-lstm.wasm.js': join(core, 'tesseract-core-simd-lstm.wasm.js'),
    'ocr/tesseract-core-relaxedsimd-lstm.wasm.js': join(core, 'tesseract-core-relaxedsimd-lstm.wasm.js'),
    'ocr/LICENSE-tesseract.js-core.txt': join(core, 'LICENSE'),
  }
  // LSTM-only "best_int" model: small and accurate. Shipped uncompressed: some servers send .gz files
  // with Content-Encoding: gzip, the browser then unpacks them and the SRI hash would not match.
  const lang = gunzipSync(readFileSync(join(spa, '4.0.0_best_int/spa.traineddata.gz')))
  return {
    name: 'dni-redactor:ocr-assets',
    apply: 'build',
    generateBundle () {
      for (const [fileName, from] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source: readFileSync(from) })
      this.emitFile({ type: 'asset', fileName: 'ocr/spa.traineddata', source: lang })
    },
  }
}
