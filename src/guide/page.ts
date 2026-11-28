// SPDX-License-Identifier: AGPL-3.0-or-later
// Card guide pages (ADR 0040): the guide of one document as a static HTML page, for search engines and
// for people who want to read it without the app. The build writes one page per document from the same
// data as the guide dialog (entries.ts, sources.ts, locales/), so the page says exactly what the
// dialog says, with the same citations.
//
// The page runs no script (its CSP has script-src 'none'), holds no photo and loads only this site's
// stylesheet. Its one <script> element is a JSON-LD data block for search engines, which the browser
// never runs (ADR 0048). Plain TypeScript with no DOM: the build runs it in Node, and so do the unit tests.

import type { DocModel } from '../zones/types.ts'
import { DOCUMENTS, documentOf } from '../zones/documents.ts'
import { GUIDE_PAGE } from './pages.ts'
import { GENERAL_RISK, GUIDE, PLACES, textOf, type Cite, type Entry, type Place } from './entries.ts'
import { SOURCES } from './sources.ts'
import { appState, sourceOrder } from './view.ts'
import { OG_IMAGE, OG_IMAGE_SIZE, OG_LOCALE, jsonLd } from '../seo/site.ts'
import type { Lang } from '../i18n/langs.ts'

export { GUIDE_PAGE }

/** Documents in the order the pages link to each other: the order of the document picker. */
export const PAGE_DOCS: readonly DocModel[] = DOCUMENTS.map((d) => d.model)

export interface PageInput {
  readonly doc: DocModel
  /** Language of the page and its direction. */
  readonly lang: Lang
  readonly dir: 'ltr' | 'rtl'
  /** Guide text (src/guide/locales/<lang>.json). */
  readonly g: (key: string) => string
  /** App text (src/i18n/locales/<lang>.json): document names and the name of the Boxes tab. */
  readonly t: (key: string) => string
  /** The built stylesheet, relative to the page. The build adds its SRI hash (scripts/vite-plugins.ts). */
  readonly css: string
  readonly brand: string
  /** The page's Content-Security-Policy (GUIDE_CSP in scripts/csp.ts), set as a <meta> tag. */
  readonly csp: string
  /**
   * The page's absolute address, for search engines (the site address, SITE_URL, plus the file name).
   * The page's own links stay relative (rule 6).
   */
  readonly canonical: string
}

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escapes text for HTML content and double-quoted attributes. */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

/** Fills `{name}` placeholders. Values are plain text; the caller escapes the result. */
const fill = (s: string, values: Readonly<Record<string, string>>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m)

const PLACE_KEY: Readonly<Record<Place, string>> = { front: 'placeFront', back: 'placeBack', chip: 'placeChip' }

/**
 * The newest date a source of the page was checked (YYYY-MM-DD): the day its facts last changed, for
 * the sitemap's <lastmod>. The text comes only from these sources (rule 9), so it is the page's date.
 */
export function guidePageDate (doc: DocModel): string {
  return sourceOrder(GUIDE[doc]).map((s) => SOURCES[s].checked).sort().at(-1) ?? ''
}

/**
 * Structured data for search engines (schema.org, ADR 0048): the page is an article by the site,
 * dated by its sources, that cites them; and its place in the site (BreadcrumbList). One JSON-LD data
 * block, which the browser never runs.
 */
export function guideStructuredData (p: PageInput, headline: string, description: string, image: string): string {
  const site = new URL('./', p.canonical).href
  const name = shortName(p.t(`doc_${p.doc}`))
  const by = { '@type': 'Organization', name: p.brand, url: site }
  return jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline,
        description,
        inLanguage: p.lang,
        url: p.canonical,
        mainEntityOfPage: p.canonical,
        image,
        dateModified: guidePageDate(p.doc),
        author: by,
        publisher: by,
        isAccessibleForFree: true,
        citation: sourceOrder(GUIDE[p.doc]).map((s) => SOURCES[s].url),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: p.brand, item: site },
          { '@type': 'ListItem', position: 2, name, item: p.canonical },
        ],
      },
    ],
  })
}

/** The document's name without the part in brackets, for the short title: "TIE (…)" becomes "TIE". */
const shortName = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, '')

const APP_KEY = { mandatory: 'appMandatory', hidden: 'appHidden', visible: 'appVisible', none: 'appNone' } as const

/** The guide page of one document, as a complete HTML document. */
export function renderGuidePage (p: PageInput): string {
  const { g, t } = p
  const entries = GUIDE[p.doc]
  const model = documentOf(p.doc)
  const order = sourceOrder(entries)
  const docName = t(`doc_${p.doc}`)
  const title = fill(g('pageTitle'), { doc: docName })
  const description = fill(g('pageDescription'), { doc: docName })
  // Search results and link previews show about 60 characters: the tab title is the short form.
  const seoTitle = `${fill(g('pageSeoTitle'), { doc: shortName(docName) })} · ${p.brand}`
  const image = new URL(OG_IMAGE, p.canonical).href

  const cites = (list: readonly Cite[]): string => list.length === 0
    ? ''
    : `<p class="guide-cites mt-0.5 flex flex-wrap gap-x-2 font-mono text-xs text-muted">${list.map((c) => {
      const n = order.indexOf(c.src) + 1
      return `<bdi class="guide-cite" dir="ltr"><a class="text-inherit" href="#src-${c.src}">[${String(n)}, ${esc(c.at)}]</a></bdi>`
    }).join('')}</p>`

  const entry = (e: Entry): string => {
    const key = textOf(e)
    const what = g(`${key}_what`)
    const state = appState(model, e.field)
    return [
      `<li class="px-3.5 py-3" id="${esc(e.id)}">`,
      `<h3 class="text-[1.05rem]">${esc(g(`${key}_title`))}</h3>`,
      `<h4>${esc(g('what'))}</h4>`,
      e.what.length > 0 && what !== '' ? `<p>${esc(what)}</p>${cites(e.what)}` : `<p class="text-muted italic">${esc(g('noSource'))}</p>`,
      `<h4>${esc(g('risk'))}</h4>`,
      e.risk.length > 0 ? `<p>${esc(g(`${key}_risk`))}</p>${cites(e.risk)}` : `<p class="text-muted italic">${esc(g('noRisk'))}</p>`,
      `<p class="mt-2 text-sm text-accent-text">${esc(fill(g(APP_KEY[state]), { boxes: t('toolBoxes') }))}</p>`,
      '</li>',
    ].join('\n')
  }

  const places = PLACES.map((place) => {
    const list = entries.filter((e) => e.place === place)
    if (list.length === 0) return ''
    return [
      `<h2 class="mt-3 text-[1.2rem]">${esc(g(PLACE_KEY[place]))}</h2>`,
      '<ul class="guide-entries m-0 list-none overflow-hidden rounded-lg border border-line bg-surface p-0 [&>li+li]:border-t [&>li+li]:border-hair [&_h4]:mt-2.5 [&_h4]:mb-0.5 [&_h4]:font-mono [&_h4]:text-xs [&_h4]:tracking-[0.04em] [&_h4]:text-muted [&_h4]:uppercase">',
      ...list.map(entry),
      '</ul>',
    ].join('\n')
  }).join('\n')

  const sources = order.map((s) => {
    const src = SOURCES[s]
    return [
      `<li id="src-${s}">`,
      `<cite lang="${esc(src.lang)}">${esc(src.title)}</cite>. ${esc(src.publisher)}. <span lang="${esc(src.lang)}">${esc(src.edition)}</span>.`,
      src.repealed === true ? ` <em>${esc(g('repealed'))}.</em>` : '',
      ` ${esc(fill(g('checked'), { date: src.checked }))}.`,
      // No referrer, no opener: the page tells the source nothing about the reader.
      ` <a href="${esc(src.url)}" rel="noopener noreferrer" dir="ltr">${esc(src.url)}</a>`,
      '</li>',
    ].join('')
  }).join('\n')

  const others = PAGE_DOCS.map((d) => {
    const current = d === p.doc ? ' aria-current="page"' : ''
    return `<li><a class="chip aria-[current=page]:border-solid aria-[current=page]:border-ink aria-[current=page]:font-bold" href="./${GUIDE_PAGE[d]}"${current}>${esc(t(`doc_${d}`))}</a></li>`
  }).join('\n')

  return `<!doctype html>
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Card guide page (ADR 0040), written by the build from src/guide/. Do not edit: change the guide data. -->
<html lang="${esc(p.lang)}" dir="${p.dir}">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${esc(p.csp)}" />
<meta name="referrer" content="no-referrer" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>${esc(seoTitle)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(p.canonical)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${esc(p.brand)}" />
<meta property="og:title" content="${esc(seoTitle)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(p.canonical)}" />
<meta property="og:locale" content="${OG_LOCALE[p.lang]}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:width" content="${String(OG_IMAGE_SIZE.width)}" />
<meta property="og:image:height" content="${String(OG_IMAGE_SIZE.height)}" />
<meta name="twitter:card" content="summary_large_image" />
${guideStructuredData(p, title, description, image)}
<link rel="icon" href="./favicon.ico" sizes="32x32" />
<link rel="icon" type="image/svg+xml" href="./icons/favicon.svg" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f8f5ed" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#16120e" />
<link rel="stylesheet" href="${esc(p.css)}" />
</head>
<body>
<div class="mx-auto flex min-h-dvh max-w-[44rem] flex-col">
<header class="flex min-h-[58px] items-center gap-2 border-b border-hair bg-paper px-3">
<a class="brand flex min-h-11 items-center gap-2 text-lg font-bold tracking-[-0.3px] text-inherit no-underline hover:underline hover:underline-offset-3" href="./"><span class="brand-mark inline-flex h-6 items-center justify-center rounded-sm border-2 border-ink bg-accent px-1.25 font-mono text-xs font-bold text-on-accent" aria-hidden="true">DT.es</span>${esc(p.brand)}</a>
</header>
<main class="flex flex-col gap-2.5 px-4 py-5 text-start font-sans text-base leading-normal">
<p class="kicker">${esc(g('kicker'))}</p>
<h1>${esc(title)}</h1>
<p class="lead">${esc(g('lead'))}</p>
<nav aria-label="${esc(g('pageOther'))}"><ul class="m-0 flex list-none flex-wrap gap-2 p-0">
${others}
</ul></nav>
<section class="rounded-md border border-dashed border-dash bg-sunk p-3" aria-labelledby="general">
<h2 class="text-[1.05rem]" id="general">${esc(g('generalTitle'))}</h2>
<p>${esc(g('generalText'))}</p>
${cites(GENERAL_RISK)}
</section>
${places}
<h2 class="mt-3 text-[1.2rem]" id="sources">${esc(g('sources'))}</h2>
<ol class="guide-sources m-0 list-decimal ps-6 text-[0.8125rem] wrap-anywhere [&_a]:text-accent-text [&>li+li]:mt-1.5">
${sources}
</ol>
<section class="panel-box mt-4" aria-labelledby="cta">
<h2 class="text-[1.05rem]" id="cta">${esc(g('pageCtaTitle'))}</h2>
<p>${esc(g('pageCtaText'))}</p>
<p><a class="button" href="./">${esc(g('pageCta'))}</a></p>
</section>
</main>
<footer class="mt-auto border-t border-hair px-4 py-4 text-sm text-muted">
<p>${esc(g('pageFooter'))}</p>
</footer>
</div>
</body>
</html>
`
}
