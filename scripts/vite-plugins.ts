// SPDX-License-Identifier: AGPL-3.0-or-later
// Build-only hardening: CSP + referrer meta tags (§5.1, §5.2) and Subresource Integrity (§5.2).
// The dev server is left without CSP because Vite's HMR client needs inline code and a WebSocket.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, posix, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { CSP, THANKS_CSP, cspWithScriptHashes } from './csp.ts'
import { headersFor, hostHeaderRules, redirectFor, rewriteFor, type HeaderRule } from './headers.ts'
import { insertIntoApp, renderHomes } from './prerender.ts'
import { noScriptTag } from './language-pages.ts'
import { STATS_PATH, handleStats } from '../src/stats/endpoint.ts'
import { isArticlePage } from '../src/articles/paths.ts'
import { NOT_FOUND_FILE, notFoundPages } from '../src/notfound/page.ts'
import { GUIDE_PAGES, SW_FILE, THANKS_PAGE, isOnDemand, isPrecached, parseManifest, type PrecacheFile } from '../src/offline/precache.ts'
import { robotsTxt, sitemapXml, startPageSitemap, staticHead, structuredData, type SitemapUrl } from '../src/seo/site.ts'
import { LANGS, type Lang } from '../src/i18n/langs.ts'
import es from '../src/i18n/locales/es.json' with { type: 'json' }

export function securityHeaders (): Plugin {
  return {
    name: 'dni-redactor:security-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      // Inserted right after <meta charset> so the policy applies before any script or stylesheet.
      // The thanks page (ADR 0029) gets its own policy; every other page the app's.
      handler: (html, ctx) => {
        const anchor = '<meta charset="utf-8" />'
        if (!html.includes(anchor)) throw new Error(`${ctx.path} must contain <meta charset="utf-8" />`)
        const csp = (ctx.path.endsWith(`/${THANKS_PAGE}`) ? THANKS_CSP : CSP).replaceAll("'", '&#39;')
        return html.replace(
          anchor,
          `${anchor}\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="no-referrer" />`
        )
      },
    },
  }
}

/**
 * Search and link-preview files (src/seo/site.ts): the start page's title, description, Open Graph
 * tags and canonical address, in Spanish from es.json, in place of the `<!-- seo-head -->` marker, and
 * its <noscript> text in place of `<!-- noscript: … -->`, the structured data block (ADR 0046) in place
 * of `<!-- structured-data -->`; and robots.txt and sitemap.xml, which need
 * the site's absolute address (`site`). The page's own URLs stay relative.
 */
export function searchFiles (site: string, more: readonly SitemapUrl[] = []): Plugin {
  const MARKER = '<!-- seo-head -->'
  const NOSCRIPT = /<!-- noscript:[^>]*-->/
  const DATA_MARKER = '<!-- structured-data -->'
  return {
    name: 'dni-redactor:search-files',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) => {
        if (ctx.path.endsWith(`/${THANKS_PAGE}`)) return html
        if (!html.includes(MARKER)) throw new Error(`${ctx.path} must contain ${MARKER}`)
        if (!NOSCRIPT.test(html)) throw new Error(`${ctx.path} must contain <!-- noscript: … -->`)
        if (!html.includes(DATA_MARKER)) throw new Error(`${ctx.path} must contain ${DATA_MARKER}`)
        return html.replace(MARKER, staticHead(site, es, 'es')).replace(DATA_MARKER, structuredData(site)).replace(NOSCRIPT, noScriptTag(es.noScript))
      },
    },
    generateBundle () {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(site) })
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml([...startPageSitemap(site), ...GUIDE_PAGES.map((p) => ({ loc: new URL(p, site).href })), ...more]) })
    },
  }
}

/**
 * Prerendered start screen (ADR 0041, 0044): the start screen of every language as plain HTML. The
 * Spanish one goes inside <main id="app"> of index.html; the others go into `store`, for the
 * language pages (scripts/language-pages.ts). The thanks page is left as it is.
 */
export function prerenderStart (store: Map<Lang, string>): Plugin {
  let config: ResolvedConfig
  return {
    name: 'dni-redactor:prerender',
    apply: 'build',
    configResolved (c) {
      config = c
    },
    transformIndexHtml: {
      order: 'post',
      handler: async (html, ctx) => {
        if (ctx.path.endsWith(`/${THANKS_PAGE}`)) return html
        const all = await renderHomes(config.root, config.define ?? {}, LANGS)
        store.clear()
        for (const [lang, markup] of all) store.set(lang, markup)
        const es = all.get('es')
        if (es === undefined) throw new Error('prerender: no Spanish start screen')
        return insertIntoApp(html, es)
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
export function subresourceIntegrity (more: { pages?: (indexHtml: string) => ReadonlyMap<string, string> } = {}): Plugin {
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
      const tagRe = /<(script|link)\b([^>]*?)\s(src|href)="([^"]+)"([^>]*)>/g
      // `dir`: the page's folder inside dist/, for pages below its root (the articles).
      const withSri = (html: string, dir = ''): string => html.replace(tagRe, (whole, tag: string, pre: string, attr: string, url: string, post: string) => {
        if (/^[a-z]+:|^\/\//i.test(url) || whole.includes('integrity=')) return whole
        if (tag === 'link' && !/rel="(stylesheet|modulepreload)"/.test(whole)) return whole
        const file = join(outDir, dir, url.replace(/^\.?\//, '').replace(config.base.replace(/^\.?\//, ''), ''))
        return `<${tag}${pre} ${attr}="${url}" integrity="${sri(readFileSync(file))}"${post}>`
      })
      // The thanks page (ADR 0029): its own scripts and styles, checked the same way. It loads nothing
      // on demand, so it has no import map.
      const thanksPath = join(outDir, THANKS_PAGE)
      const thanks = withSri(readFileSync(thanksPath, 'utf8'))
      if (thanks.includes('import(') || !thanks.includes('integrity=')) throw new Error(`${THANKS_PAGE}: unexpected scripts`)
      writeFileSync(thanksPath, thanks)
      // The card guide pages (ADR 0040): their stylesheet, checked the same way. They run no script.
      for (const page of GUIDE_PAGES) {
        const path = join(outDir, page)
        const html = withSri(readFileSync(path, 'utf8'))
        if (/<script\b/i.test(html) || !/<link rel="stylesheet" [^>]*integrity="sha384-/.test(html)) throw new Error(`${page}: must link its stylesheet with integrity and have no script`)
        writeFileSync(path, html)
      }

      // The articles (ADR 0039): their stylesheet, checked the same way. They run no script.
      for (const page of listFiles(outDir).filter(isArticlePage)) {
        const path = join(outDir, page)
        const html = withSri(readFileSync(path, 'utf8'), dirname(page))
        if (/<script\b/i.test(html) || !/<link rel="stylesheet" [^>]*integrity="sha384-/.test(html)) throw new Error(`${page}: must link its stylesheet with integrity and have no script`)
        writeFileSync(path, html)
      }

      // The not-found pages (ADR 0045): their stylesheet, checked the same way. They run no script.
      for (const page of notFoundPages()) {
        const path = join(outDir, page.path)
        const html = withSri(readFileSync(path, 'utf8'), dirname(page.path))
        if (/<script\b/i.test(html) || !/<link rel="stylesheet" [^>]*integrity="sha384-/.test(html)) throw new Error(`${page.path}: must link its stylesheet with integrity and have no script`)
        writeFileSync(path, html)
      }

      const htmlPath = join(outDir, 'index.html')
      const out = withSri(readFileSync(htmlPath, 'utf8'))

      // Chunks not referenced from the HTML are loaded with import(): list them in the import map.
      // That includes the corner model's files under assets/ml/ (the runtime's .mjs loader too).
      const lazy = listFiles(join(outDir, 'assets')).filter((f) => /\.m?js$/.test(f) && !out.includes(`assets/${f}"`))
      // Pages made from the final index.html (the language pages, ADR 0044), before the file list.
      const finish = (html: string): void => {
        writeFileSync(htmlPath, html)
        for (const [file, page] of more.pages?.(html) ?? []) writeFileSync(join(outDir, file), page)
        writePrecacheManifest(outDir)
      }
      if (lazy.length === 0) {
        finish(out)
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
      finish(withMap.replace(cspMeta, `$1${cspWithScriptHashes([hash]).replaceAll("'", '&#39;')}$2`))
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
  const json = JSON.stringify({ version, files, onDemand })
  parseManifest(json) // same checks as the worker runs
  writeFileSync(swPath, sw.replace(PLACEHOLDER, () => JSON.stringify(json)))
}

/**
 * The not-found page the host sends for `path` (ADR 0045), or null when the build has a file there.
 * Like the host, it takes the `404.html` of the nearest folder above the path.
 */
export function notFoundFor (outDir: string, path: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    decoded = path
  }
  // As a URL resolves it: `..` never climbs above the site's folder.
  const rel = posix.normalize(`/${decoded}`).replace(/^\/+/, '')
  const target = join(outDir, rel)
  if (rel !== '' && existsSync(target) && statSync(target).isFile()) return null
  let folder = rel.slice(0, rel.lastIndexOf('/') + 1)
  for (;;) {
    const page = join(outDir, folder, NOT_FOUND_FILE)
    if (existsSync(page)) return page
    if (folder === '') return null
    folder = folder.slice(0, folder.slice(0, -1).lastIndexOf('/') + 1)
  }
}

/**
 * `vite preview` sends the same HTTP headers as the Cloudflare host (scripts/headers.ts, ADR 0027), so
 * the e2e tests run under the host's CSP, Permissions-Policy and framing rules, not only the <meta> CSP.
 * Set PREVIEW_HOST_HEADERS=0 to preview the build as GitHub Pages serves it (no headers).
 * POST /stats is answered by the Worker's own checks (src/stats/endpoint.ts, ADR 0029), with no dataset: the
 * preview checks the stats exactly as the host does and stores nothing.
 */
export function hostHeadersInPreview (): Plugin {
  return {
    name: 'dni-redactor:host-headers-preview',
    apply: (_config, env) => env.isPreview === true && process.env['PREVIEW_HOST_HEADERS'] !== '0',
    configurePreviewServer (server) {
      let rules: HeaderRule[] | undefined
      const outDir = resolve(server.config.root, server.config.build.outDir)
      server.middlewares.use((req, res, next) => {
        rules ??= hostHeaderRules(readFileSync(join(outDir, 'index.html'), 'utf8'))
        const path = new URL(req.url ?? '/', 'http://preview').pathname
        if (path === STATS_PATH) {
          const chunks: Buffer[] = []
          req.on('data', (c: Buffer) => { chunks.push(c) })
          req.on('end', () => {
            const headers = new Headers()
            for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
            const method = req.method ?? 'GET'
            const body = method === 'GET' || method === 'HEAD' ? null : Buffer.concat(chunks)
            void handleStats(new Request(`http://preview${STATS_PATH}`, { method, headers, body }), {}).then((r) => {
              res.statusCode = r.status
              r.headers.forEach((v, k) => { res.setHeader(k, v) })
              res.end()
            })
          })
          return
        }
        for (const [k, v] of Object.entries(headersFor(rules, path))) res.setHeader(k, v)
        // The host's language redirects (`_redirects`, ADR 0038), with the query kept.
        const to = redirectFor(path)
        if (to !== null) {
          res.statusCode = 301
          res.setHeader('Location', `${to}${new URL(req.url ?? '/', 'http://preview').search}`)
          res.end()
          return
        }
        // The host's rewrites: an articles folder shows its index.html (ADR 0039), and a language's
        // address shows its own start page (ADR 0044).
        const file = rewriteFor(path)
        if (file !== null) req.url = `${file}${new URL(req.url ?? '/', 'http://preview').search}`
        // An unknown path gets the nearest not-found page with status 404, as on the host (ADR 0045).
        // So does a rewrite to a file the build does not have, such as the articles folder of a
        // language with no articles: the host then answers for the address, not for the file.
        const notFound = file === null || notFoundFor(outDir, file) !== null ? notFoundFor(outDir, path) : null
        if (notFound !== null) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(readFileSync(notFound))
          return
        }
        next()
      })
    },
  }
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
