// SPDX-License-Identifier: AGPL-3.0-or-later
// Keeps the page's <head> in the page's language: title, description, Open Graph text and the
// canonical address. The build writes the Spanish values into index.html (src/seo/site.ts); this
// replaces them when the page shows another language, so a search engine that runs the page's
// JavaScript reads one language per page.

import { t, type Lang } from '../i18n/index.ts'
import { OG_LOCALE, canonicalUrl, pageTitle } from './site.ts'

/** Sets `content` on the <meta> that matches `selector`, creating it under <head> if needed. */
function setMeta (attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.append(el)
  }
  el.content = content
}

/** Sets the one <link rel="canonical"> of the page, creating it if needed. */
function setCanonical (href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.append(el)
  }
  el.href = href
}

export function applyHead (lang: Lang): void {
  const title = pageTitle(t(lang, 'seoTitle'))
  const description = t(lang, 'seoDescription')
  document.title = title
  setMeta('name', 'description', description)
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:locale', OG_LOCALE[lang])
  setCanonical(canonicalUrl(__SITE_URL__))
}
