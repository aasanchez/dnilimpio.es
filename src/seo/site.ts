// SPDX-License-Identifier: AGPL-3.0-or-later
// Search and link-preview metadata (title, description, Open Graph, robots.txt, sitemap.xml).
// Pure helpers with no DOM: the build writes the static head and the crawl files with them
// (scripts/vite-plugins.ts), and the page updates the head on a language change (src/seo/head.ts).
//
// The site's address is a build constant (SITE_URL, default https://dnitapado.es/): search engines
// need absolute URLs in a sitemap, robots.txt and og:image. The app itself keeps relative URLs, so
// the same build still works under a subpath (CLAUDE.md rule 6); a fork sets SITE_URL to its address.

import { LANGS, type Lang } from '../i18n/langs.ts'

/** The product name. Not translated: it is the brand and the domain. */
export const BRAND = 'DNI Tapado.es'

/** Default site address, with a trailing slash. */
export const DEFAULT_SITE_URL = 'https://dnitapado.es/'

/** Preview image for link previews and search results, relative to the site address. */
export const OG_IMAGE = 'icons/og-image.png'
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const

/** The site address with exactly one trailing slash. Throws on anything but an http(s) URL. */
export function normalizeSiteUrl (raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`SITE_URL must be http(s): ${raw}`)
  url.search = ''
  url.hash = ''
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.href
}

/** Open Graph locale per language (language_TERRITORY). Valencian has none of its own: Catalan. */
export const OG_LOCALE: Readonly<Record<Lang, string>> = {
  es: 'es_ES',
  ca: 'ca_ES',
  'ca-ES-valencia': 'ca_ES',
  gl: 'gl_ES',
  eu: 'eu_ES',
  en: 'en_GB',
  fr: 'fr_FR',
  nl: 'nl_NL',
  sv: 'sv_SE',
  fi: 'fi_FI',
  uk: 'uk_UA',
  ro: 'ro_RO',
  ar: 'ar_AR',
}

/** The page title: what the page does, in the search words people use, then the brand. */
export const pageTitle = (seoTitle: string): string => `${seoTitle} · ${BRAND}`

const escapeAttr = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const escapeText = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

export interface HeadText { readonly seoTitle: string; readonly seoDescription: string }

/**
 * The static <head> tags of the start page in `lang` (ADR 0044): title, description, Open Graph,
 * Twitter card, the page's own canonical address and the hreflang list. Every value is escaped; no tag
 * carries a script or a style. src/seo/head.ts keeps them in step when the person changes language.
 */
export function staticHead (site: string, text: HeadText, lang: Lang = 'es'): string {
  const title = escapeAttr(pageTitle(text.seoTitle))
  const description = escapeAttr(text.seoDescription)
  return [
    `<title>${escapeText(pageTitle(text.seoTitle))}</title>`,
    `<meta name="description" content="${description}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:locale" content="${OG_LOCALE[lang]}" />`,
    `<meta property="og:image" content="${escapeAttr(new URL(OG_IMAGE, site).href)}" />`,
    `<meta property="og:image:width" content="${String(OG_IMAGE_SIZE.width)}" />`,
    `<meta property="og:image:height" content="${String(OG_IMAGE_SIZE.height)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<link rel="canonical" href="${escapeAttr(canonicalUrl(site, lang))}" />`,
    // The same list on every language version (ADR 0038), so it can live in the static HTML.
    ...hreflangAlternates(site).map((a) => `<link rel="alternate" hreflang="${escapeAttr(a.hreflang)}" href="${escapeAttr(a.href)}" />`),
  ].join('\n    ')
}

/** robots.txt: every page may be crawled; the sitemap's address. */
export function robotsTxt (site: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', site).href}\n`
}

export interface SitemapUrl {
  /** Absolute URL of the page. */
  readonly loc: string
  /** The same page in each language (hreflang), absolute URLs. Empty for a page in one language. */
  readonly alternates?: ReadonlyArray<{ readonly hreflang: string; readonly href: string }>
}

/** sitemap.xml with optional hreflang alternates (xhtml:link), as search engines read them. */
export function sitemapXml (urls: readonly SitemapUrl[]): string {
  const body = urls.map((u) => {
    const alt = (u.alternates ?? []).map((a) => `\n    <xhtml:link rel="alternate" hreflang="${escapeAttr(a.hreflang)}" href="${escapeAttr(a.href)}"/>`).join('')
    return `  <url>\n    <loc>${escapeText(u.loc)}</loc>${alt}\n  </url>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`
}

/**
 * The start page's address in `lang` (ADR 0038): the site address for Spanish, `<site><tag>` in
 * lowercase for every other language (src/i18n/url.ts). Each language version is its own canonical page.
 */
export const langUrl = (site: string, lang: Lang): string => lang === 'es' ? site : `${site}${lang.toLowerCase()}`

/** Canonical address of the start page in `lang`: itself, so search engines keep every language. */
export const canonicalUrl = (site: string, lang: Lang): string => langUrl(site, lang)

/**
 * Languages listed as hreflang alternates. Search engines accept a language and a region, not the
 * variant subtag of `ca-ES-valencia`, so Valencian keeps its address but is not listed: it would be
 * read as an error or as Catalan.
 */
export const HREFLANG_LANGS: readonly Lang[] = LANGS.filter((l) => l !== 'ca-ES-valencia')

/** The start page's language versions as hreflang alternates, plus x-default: the Spanish address. */
export function hreflangAlternates (site: string): ReadonlyArray<{ readonly hreflang: string; readonly href: string }> {
  return [...HREFLANG_LANGS.map((l) => ({ hreflang: l, href: langUrl(site, l) })), { hreflang: 'x-default', href: site }]
}

/** Sitemap entries of the start page: one per language, each listing every alternate. */
export function startPageSitemap (site: string): SitemapUrl[] {
  const alternates = hreflangAlternates(site)
  return LANGS.map((l) => ({ loc: langUrl(site, l), alternates: HREFLANG_LANGS.includes(l) ? alternates : [] }))
}
