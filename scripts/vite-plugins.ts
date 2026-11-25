// SPDX-License-Identifier: AGPL-3.0-or-later
// Build-only hardening: CSP + referrer meta tags (§5.1, §5.2) and Subresource Integrity (§5.2).
// The dev server is left without CSP because Vite's HMR client needs inline code and a WebSocket.

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { CSP, cspWithScriptHashes } from './csp.ts'

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
      const assets = join(outDir, 'assets')
      const lazy = readdirSync(assets).filter((f) => f.endsWith('.js') && !out.includes(`assets/${f}"`)).sort()
      if (lazy.length === 0) {
        writeFileSync(htmlPath, out)
        return
      }
      const integrity = Object.fromEntries(lazy.map((f) => [`./assets/${f}`, sri(readFileSync(join(assets, f)))]))
      const importMap = JSON.stringify({ imports: {}, integrity })
      const hash = `sha256-${createHash('sha256').update(importMap).digest('base64')}`
      const firstModule = out.indexOf('<script type="module"')
      if (firstModule === -1) throw new Error('dist/index.html has no module script')
      const cspMeta = /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/
      if (!cspMeta.test(out)) throw new Error('dist/index.html has no CSP meta tag')
      const withMap = out.slice(0, firstModule) + `<script type="importmap">${importMap}</script>\n    ` + out.slice(firstModule)
      writeFileSync(htmlPath, withMap.replace(cspMeta, `$1${cspWithScriptHashes([hash]).replaceAll("'", '&#39;')}$2`))
    },
  }
}
