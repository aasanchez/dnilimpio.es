// SPDX-License-Identifier: AGPL-3.0-or-later
// Build-only hardening: CSP + referrer meta tags (§5.1, §5.2) and Subresource Integrity (§5.2).
// The dev server is left without CSP because Vite's HMR client needs inline code and a WebSocket.

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { CSP, cspWithScriptHashes } from './csp.ts'
import { BEACON_ENDPOINT, BEACON_SCRIPT } from '../src/analytics/endpoints.ts'
import { SW_FILE, isOnDemand, isPrecached, parseManifest, type PrecacheFile } from '../src/offline/precache.ts'

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
  // No source maps are published (ADR 0022): a .map in dist/ means a build setting changed.
  const maps = listFiles(outDir).filter((p) => p.endsWith('.map'))
  if (maps.length > 0) throw new Error(`dist/ must not contain source maps (ADR 0022): ${maps.join(', ')}`)
  const all: PrecacheFile[] = listFiles(outDir).filter(isPrecached).map((path) => ({ path, integrity: sri(readFileSync(join(outDir, path))) }))
  const files = all.filter((f) => !isOnDemand(f.path))
  const onDemand = all.filter((f) => isOnDemand(f.path))
  // The worker's own code is part of the version: a worker-only change still gets a new cache name,
  // so a failed install can never delete the cache the active worker is using.
  const version = createHash('sha256')
    .update(all.map((f) => `${f.path} ${f.integrity}`).join('\n'))
    .update(`\nsw.js ${sri(sw)}`)
    .digest('hex').slice(0, 16)
  const json = JSON.stringify({ version, files, onDemand, analytics: { script: BEACON_SCRIPT, endpoint: BEACON_ENDPOINT } })
  parseManifest(json) // same checks as the worker runs
  writeFileSync(swPath, sw.replace(PLACEHOLDER, () => JSON.stringify(json)))
}

/**
 * `import data from './file.bin?base64'` gives the file's bytes as a base64 string inside a
 * JavaScript module. The corner model and its WebAssembly runtime are loaded this way because the
 * page's CSP allows no connection to its own origin (connect-src has no 'self', ADR 0022): the page
 * cannot fetch() anything there, but it can import() a script from its own origin, and the import map
 * checks that script's integrity.
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
 * OCR engine files, served from our own origin under ocr/ (never from a CDN; ADR 0019):
 * - worker.min.js: src/ocr/worker.ts bundled on its own (paddleocr.js and ONNX Runtime Web), so the
 *   worker loads nothing from outside ocr/;
 * - the ONNX Runtime WebAssembly build (SIMD, one thread) and its loader;
 * - the PP-OCRv6 tiny detection and recognition models, checked here against the SHA-256 that
 *   PaddlePaddle publishes on Hugging Face, and the recognition dictionary as JSON.
 * The service worker downloads them on first use and checks each against its SHA-384 (see
 * src/offline/precache.ts, ON_DEMAND_DIR).
 */
export const PPOCR_SHA256 = {
  // huggingface.co/PaddlePaddle/PP-OCRv6_tiny_det_onnx, inference.onnx (1 780 590 bytes)
  det: '193bab7a04fca699a6c82e6abb5b81bdb28177f0abd4062552b04908dafb19f8',
  // huggingface.co/PaddlePaddle/PP-OCRv6_tiny_rec_onnx, inference.onnx (4 462 639 bytes)
  rec: '9ef676d6ed3c88256a2d92c640c44f25b0c40947e111b14b8be8f594091563e6',
} as const

/** The character list of a PaddleOCR recognition config (inference.yml, PostProcess.character_dict). */
export function parseCharacterDict (yml: string): string[] {
  const start = yml.indexOf('character_dict:')
  if (start < 0) throw new Error('OCR dictionary: no character_dict')
  const chars: string[] = []
  for (const line of yml.slice(start).split('\n').slice(1)) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (!item) {
      if (chars.length > 0 && /^\S/.test(line)) break
      continue
    }
    let v = item[1] ?? ''
    if (/^'.*'$/.test(v)) v = v.slice(1, -1).replace(/''/g, "'")
    else if (/^".*"$/.test(v)) v = JSON.parse(v) as string
    chars.push(v)
  }
  // The model has one class more than the file lists: the space.
  if (chars.at(-1) !== ' ') chars.push(' ')
  return chars
}

export function ocrAssets (): Plugin {
  const require = createRequire(import.meta.url)
  const ortDist = dirname(require.resolve('onnxruntime-web/wasm'))
  const bundle = dirname(require.resolve('@arcships/light-ocr-model-ppocrv6-tiny/bundle/manifest.json'))
  const pkg = dirname(bundle)
  const version = (name: string): string => {
    const dir = name === 'onnxruntime-web' ? dirname(ortDist) : dirname(require.resolve(`${name}/package.json`))
    return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version
  }
  const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
  const model = (part: 'det' | 'rec'): Buffer => {
    const b = readFileSync(join(bundle, part, 'inference.onnx'))
    if (sha256(b) !== PPOCR_SHA256[part]) throw new Error(`PP-OCRv6 tiny ${part} model does not match the published SHA-256`)
    return b
  }
  return {
    name: 'dni-redactor:ocr-assets',
    apply: 'build',
    async generateBundle () {
      const { rolldown } = await import('rolldown')
      const build = await rolldown({
        input: resolve(import.meta.dirname, '../src/ocr/worker.ts'),
        platform: 'browser',
        resolve: { conditionNames: ['onnxruntime-web-use-extern-wasm', 'browser', 'import', 'default'] },
        logLevel: 'silent',
      })
      const { output } = await build.generate({ format: 'iife', minify: true, sourcemap: false })
      await build.close()
      const chunk = output.find((o) => o.type === 'chunk')
      if (!chunk || output.filter((o) => o.type === 'chunk').length !== 1) throw new Error('OCR worker must bundle to one file')
      this.emitFile({ type: 'asset', fileName: 'ocr/worker.min.js', source: chunk.code })
      const files: Record<string, Buffer | string> = {
        'ocr/ort-wasm-simd-threaded.mjs': readFileSync(join(ortDist, 'ort-wasm-simd-threaded.mjs')),
        'ocr/ort-wasm-simd-threaded.wasm': readFileSync(join(ortDist, 'ort-wasm-simd-threaded.wasm')),
        'ocr/ppocrv6-tiny-det.onnx': model('det'),
        'ocr/ppocrv6-tiny-rec.onnx': model('rec'),
        'ocr/ppocrv6-tiny-dict.json': JSON.stringify(parseCharacterDict(readFileSync(join(bundle, 'rec', 'inference.yml'), 'utf8'))),
        'ocr/LICENSE-PP-OCRv6.txt': readFileSync(join(bundle, 'LICENSES', 'PaddleOCR-Apache-2.0.txt')),
        'ocr/LICENSE-PP-OCRv6-NOTICE.txt': readFileSync(join(pkg, 'NOTICE')),
        // Neither npm package ships its licence file; both are MIT (package.json "license").
        'ocr/LICENSE-worker.txt': [
          'ocr/worker.min.js bundles:',
          `- paddleocr ${version('paddleocr')} (https://github.com/x3zvawq/paddleocr.js), MIT, Copyright (c) x3zvawq`,
          `- onnxruntime-web ${version('onnxruntime-web')} (https://github.com/microsoft/onnxruntime), MIT, Copyright (c) Microsoft Corporation`,
          'ocr/ort-wasm-simd-threaded.mjs and .wasm are part of onnxruntime-web.',
          '',
          readFileSync(resolve(import.meta.dirname, '../LICENSES/MIT.txt'), 'utf8'),
        ].join('\n'),
      }
      for (const [fileName, source] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source })
    },
  }
}
