// SPDX-License-Identifier: AGPL-3.0-or-later
// Build-only hardening: CSP + referrer meta tags (§5.1, §5.2) and Subresource Integrity (§5.2).
// The dev server is left without CSP because Vite's HMR client needs inline code and a WebSocket.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { CSP } from './csp.ts';

export function securityHeaders(): Plugin {
  return {
    name: 'dni-redactor:security-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      // Inserted right after <meta charset> so the policy applies before any script or stylesheet.
      handler: (html) => {
        const anchor = '<meta charset="utf-8" />';
        if (!html.includes(anchor)) throw new Error('index.html must contain <meta charset="utf-8" />');
        const csp = CSP.replaceAll("'", '&#39;');
        return html.replace(
          anchor,
          `${anchor}\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="no-referrer" />`,
        );
      },
    },
  };
}

/** Adds integrity="sha384-…" to every local <script src> and <link rel=stylesheet|modulepreload> in dist/index.html. */
export function subresourceIntegrity(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'dni-redactor:sri',
    apply: 'build',
    enforce: 'post',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const htmlPath = join(outDir, 'index.html');
      const html = readFileSync(htmlPath, 'utf8');
      const tagRe = /<(script|link)\b([^>]*?)\s(src|href)="([^"]+)"([^>]*)>/g;
      const out = html.replace(tagRe, (whole, tag: string, pre: string, attr: string, url: string, post: string) => {
        if (/^[a-z]+:|^\/\//i.test(url) || whole.includes('integrity=')) return whole;
        if (tag === 'link' && !/rel="(stylesheet|modulepreload)"/.test(whole)) return whole;
        const file = join(outDir, url.replace(/^\.?\//, '').replace(config.base.replace(/^\.?\//, ''), ''));
        const digest = createHash('sha384').update(readFileSync(file)).digest('base64');
        return `<${tag}${pre} ${attr}="${url}" integrity="sha384-${digest}"${post}>`;
      });
      writeFileSync(htmlPath, out);
    },
  };
}
