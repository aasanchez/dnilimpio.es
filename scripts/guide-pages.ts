// SPDX-License-Identifier: AGPL-3.0-or-later
// Build step for the card guide pages (ADR 0040): writes one static page per document next to
// index.html, from the guide data (src/guide/page.ts). The pages are in Spanish, the site's main
// language. They link the app's own stylesheet and run no script. The SRI step
// (subresourceIntegrity in scripts/vite-plugins.ts) adds the stylesheet's hash once its bytes are final.
import { readFileSync } from 'node:fs'
import type { OutputAsset, OutputBundle } from 'rolldown'
import type { Plugin } from 'vite'
import { GUIDE_CSP } from './csp.ts'
import { GUIDE_PAGE, PAGE_DOCS, renderGuidePage } from '../src/guide/page.ts'
import { BRAND } from '../src/seo/site.ts'

const LANG = 'es'

const readJson = (path: string): Record<string, string> => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Record<string, string>

/** A lookup that throws on a missing key: a page must never show an empty line or a key name. */
function lookup (dict: Readonly<Record<string, string>>, what: string): (key: string) => string {
  return (key) => {
    const v = dict[key]
    if (v === undefined) throw new Error(`${what}: no text for "${key}"`)
    return v
  }
}

/** The app's stylesheet in the bundle: the `app` chunk's CSS (vite.config.ts). */
export function appStylesheet (bundle: OutputBundle): OutputAsset {
  const css = Object.values(bundle).filter((f): f is OutputAsset => f.type === 'asset' && /^assets\/app-[\w-]+\.css$/.test(f.fileName))
  if (css.length !== 1 || css[0] === undefined) throw new Error(`guide pages: expected one assets/app-*.css, found ${String(css.length)}`)
  return css[0]
}

/** `site`: the site's address (SITE_URL in vite.config.ts), for each page's canonical URL. */
export function guidePages (site: string): Plugin {
  return {
    name: 'dni-redactor:guide-pages',
    apply: 'build',
    generateBundle (_options, bundle) {
      const css = appStylesheet(bundle)
      const g = lookup(readJson(`../src/guide/locales/${LANG}.json`), `src/guide/locales/${LANG}.json`)
      const t = lookup(readJson(`../src/i18n/locales/${LANG}.json`), `src/i18n/locales/${LANG}.json`)
      for (const doc of PAGE_DOCS) {
        this.emitFile({
          type: 'asset',
          fileName: GUIDE_PAGE[doc],
          source: renderGuidePage({ doc, lang: LANG, dir: 'ltr', g, t, css: `./${css.fileName}`, brand: BRAND, csp: GUIDE_CSP, canonical: new URL(GUIDE_PAGE[doc], site).href }),
        })
      }
    },
  }
}
