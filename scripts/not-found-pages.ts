// SPDX-License-Identifier: AGPL-3.0-or-later
// Build step for the not-found pages (ADR 0045): writes one static page per folder people reach
// (src/notfound/page.ts), in that folder's language. They link the app's own stylesheet and run no
// script. The SRI step (subresourceIntegrity in scripts/vite-plugins.ts) adds the stylesheet's hash.
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import { NOT_FOUND_CSP } from './csp.ts'
import { appStylesheet } from './guide-pages.ts'
import { notFoundPages, renderNotFoundPage } from '../src/notfound/page.ts'
import { BRAND } from '../src/seo/site.ts'

export function notFoundPagesPlugin (): Plugin {
  return {
    name: 'dni-redactor:not-found-pages',
    apply: 'build',
    generateBundle (_options, bundle) {
      const css = appStylesheet(bundle).fileName
      for (const page of notFoundPages()) {
        const dict = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${page.lang}.json`, import.meta.url), 'utf8')) as Record<string, string>
        const t = (key: string): string => {
          const v = dict[key]
          if (v === undefined || v === '') throw new Error(`src/i18n/locales/${page.lang}.json: no text for "${key}"`)
          return v
        }
        this.emitFile({ type: 'asset', fileName: page.path, source: renderNotFoundPage({ page, t, brand: BRAND, csp: NOT_FOUND_CSP, css }) })
      }
    },
  }
}
