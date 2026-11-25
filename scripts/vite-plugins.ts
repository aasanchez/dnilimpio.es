// SPDX-License-Identifier: AGPL-3.0-or-later
// Build-only hardening: CSP + referrer meta tags (§5.1, §5.2) and Subresource Integrity (§5.2).
// The dev server is left without CSP because Vite's HMR client needs inline code and a WebSocket.

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { CSP, cspWithScriptHashes } from './csp.ts'
import { SW_FILE, isLazy, isPrecached, parseManifest, type PrecacheFile } from '../src/offline/precache.ts'

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
  const entry = (path: string): PrecacheFile => ({ path, integrity: sri(readFileSync(join(outDir, path))) })
  const all = listFiles(outDir)
  const files = all.filter(isPrecached).map(entry)
  const lazy = all.filter(isLazy).map(entry)
  // The worker's own code is part of the version: a worker-only change still gets a new cache name,
  // so a failed install can never delete the cache the active worker is using.
  const version = createHash('sha256')
    .update([...files, ...lazy].map((f) => `${f.path} ${f.integrity}`).join('\n'))
    .update(`\nsw.js ${sri(sw)}`)
    .digest('hex').slice(0, 16)
  const json = JSON.stringify({ version, files, lazy })
  parseManifest(json) // same checks as the worker runs
  writeFileSync(swPath, sw.replace(PLACEHOLDER, () => JSON.stringify(json)))
}

/**
 * `import data from './file.bin?base64'` gives the file's bytes as a base64 string inside a
 * JavaScript module. The corner model and its WebAssembly runtime are loaded this way because the
 * CSP has `connect-src 'none'`: the page cannot fetch() anything, but it can import() a script from
 * its own origin, and the import map checks that script's integrity.
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
