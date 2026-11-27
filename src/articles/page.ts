// SPDX-License-Identifier: AGPL-3.0-or-later
// Article pages (ADR 0039): one article, or a language's list of articles, as a complete static HTML
// page. The build writes them from the Markdown in content/articles/ (scripts/articles.ts).
//
// A page runs no script (its CSP has script-src 'none'), holds no photo and loads only this site's
// stylesheet and the article's own images. Every link is relative, so the same build works under a
// subpath (rule 6). Plain TypeScript with no DOM: the build runs it in Node, and so do the unit tests.

import type { Lang } from '../i18n/langs.ts'
import { appLink } from '../i18n/url.ts'
import { HREFLANG_LANGS } from '../seo/site.ts'
import { SOURCES } from '../guide/sources.ts'
import { ARTICLE_TYPES, type ArticleType, type FrontMatter } from './front-matter.ts'
import { articleDepth, articleFolder, articlePath } from './paths.ts'

/** One article, ready to be written as a page. */
export interface Article {
  readonly lang: Lang
  readonly slug: string
  readonly meta: FrontMatter
  /** The body as HTML (scripts/article-markdown.ts). */
  readonly html: string
  /** Translation group: the slug of the Spanish original. Articles of one group link each other. */
  readonly group: string
}

/** What every page of one language needs. */
export interface PageContext {
  readonly lang: Lang
  /** App text in this language (src/i18n/locales/<lang>.json). */
  readonly t: (key: string) => string
  readonly brand: string
  /** The page's CSP (ARTICLE_CSP in scripts/csp.ts), set as a <meta> tag. */
  readonly csp: string
  /** The stylesheet, relative to the site's folder (`assets/app-….css`). The build adds its hash. */
  readonly css: string
  /** The site's address (SITE_URL), for canonical and alternate links only. */
  readonly site: string
}

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escapes text for HTML content and double-quoted attributes. */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

/** Fills `{name}` placeholders. Values are plain text; the caller escapes the result. */
const fill = (s: string, values: Readonly<Record<string, string>>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m)

/** A day (YYYY-MM-DD) in words, in the page's language. UTC, so every build writes the same text. */
export function formatDay (day: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}

/** Writing direction of a language. Arabic is the only right-to-left one (src/i18n/index.ts). */
const langDir = (lang: Lang): 'ltr' | 'rtl' => lang === 'ar' ? 'rtl' : 'ltr'

const TYPE_KEY: Readonly<Record<ArticleType, string>> = { news: 'articlesNews', guide: 'articlesGuide', info: 'articlesInfo' }

/** Newest first; on the same day, by title, so the order never depends on the file system. */
export const byDate = (a: Article, b: Article): number => b.meta.date.localeCompare(a.meta.date) || a.meta.title.localeCompare(b.meta.title)

/** From a page of `lang` to the site's folder: `../` or `../../`. */
const toRoot = (lang: Lang): string => '../'.repeat(articleDepth(lang))

/**
 * hreflang alternates of an article: every published version in its group, when there are two or
 * more. Valencian is left out, as on the start page (src/seo/site.ts).
 */
export function alternatesOf<T extends Pick<Article, 'lang' | 'group'>> (a: T, all: readonly T[]): ReadonlyArray<{ readonly lang: Lang; readonly article: T }> {
  const group = all.filter((o) => o.group === a.group)
  if (group.length < 2) return []
  return group.filter((o) => HREFLANG_LANGS.includes(o.lang)).map((o) => ({ lang: o.lang, article: o }))
}

function shell (ctx: PageContext, p: { title: string; description: string; canonical: string; head: string; main: string }): string {
  const root = toRoot(ctx.lang)
  const { t } = ctx
  return `<!doctype html>
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Article page (ADR 0039), written by the build from content/articles/. Do not edit: change the Markdown. -->
<html lang="${esc(ctx.lang)}" dir="${langDir(ctx.lang)}">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${esc(ctx.csp)}" />
<meta name="referrer" content="no-referrer" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>${esc(p.title)} · ${esc(ctx.brand)}</title>
<meta name="description" content="${esc(p.description)}" />
<link rel="canonical" href="${esc(p.canonical)}" />
${p.head}<link rel="icon" href="${root}favicon.ico" sizes="32x32" />
<link rel="icon" type="image/svg+xml" href="${root}icons/favicon.svg" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f8f5ed" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#16120e" />
<link rel="stylesheet" href="${root}${esc(ctx.css)}" />
</head>
<body>
<div class="mx-auto flex min-h-dvh max-w-[44rem] flex-col">
<header class="flex min-h-[58px] items-center gap-2 border-b border-hair bg-paper px-3">
<a class="brand flex min-h-11 items-center gap-2 text-lg font-bold tracking-[-0.3px] text-inherit no-underline hover:underline hover:underline-offset-3" href="${root}${appLink(ctx.lang).slice(2)}"><span class="brand-mark inline-flex h-6 items-center justify-center rounded-sm border-2 border-ink bg-accent px-1.25 font-mono text-xs font-bold text-on-accent" aria-hidden="true">DT.es</span>${esc(ctx.brand)}</a>
</header>
<main class="flex flex-col gap-2.5 px-4 py-5 text-start font-sans text-base leading-normal">
${p.main}
<section class="panel-box mt-4" aria-labelledby="cta">
<h2 class="text-[1.05rem]" id="cta">${esc(t('articlesCtaTitle'))}</h2>
<p>${esc(t('homeLead'))}</p>
<p><a class="button" href="${root}${appLink(ctx.lang).slice(2)}">${esc(t('articlesCta'))}</a></p>
</section>
</main>
<footer class="mt-auto border-t border-hair px-4 py-4 text-sm text-muted">
<p>${esc(t('articlesLicence'))}</p>
</footer>
</div>
</body>
</html>
`
}

/** One article as a complete page. `all`: every published article, for the links to its translations. */
export function renderArticlePage (a: Article, all: readonly Article[], ctx: PageContext): string {
  const { t, lang } = ctx
  const root = toRoot(lang)
  const alts = alternatesOf(a, all)
  const head = alts.map((o) => `<link rel="alternate" hreflang="${esc(o.lang)}" href="${esc(new URL(articlePath(o.lang, o.article.slug), ctx.site).href)}" />\n`).join('')
  const others = all.filter((o) => o.group === a.group && o !== a).sort((x, y) => x.lang.localeCompare(y.lang))
  const dates = [
    `<time datetime="${a.meta.date}">${esc(fill(t('articlesPublished'), { date: formatDay(a.meta.date, lang) }))}</time>`,
    a.meta.updated === undefined ? '' : ` · <time datetime="${a.meta.updated}">${esc(fill(t('articlesUpdated'), { date: formatDay(a.meta.updated, lang) }))}</time>`,
  ].join('')
  const sources = a.meta.sources.length === 0
    ? ''
    : [
        `<h2 class="mt-3 text-[1.2rem]" id="sources">${esc(t('articlesSources'))}</h2>`,
        '<ol class="m-0 list-decimal ps-6 text-[0.8125rem] wrap-anywhere [&_a]:text-accent-text [&>li+li]:mt-1.5">',
        ...a.meta.sources.map((s) => {
          const src = SOURCES[s]
          // No referrer, no opener: the page tells the source nothing about the reader.
          return `<li><cite lang="${esc(src.lang)}">${esc(src.title)}</cite>. ${esc(src.publisher)}. <span lang="${esc(src.lang)}">${esc(src.edition)}</span>. <a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer" dir="ltr">${esc(src.url)}</a></li>`
        }),
        '</ol>',
      ].join('\n')
  const translations = others.length === 0
    ? ''
    : `<p class="text-sm text-muted">${esc(t('articlesOtherLangs'))} ${others.map((o) => `<a lang="${esc(o.lang)}" hreflang="${esc(o.lang)}" href="${root}${articlePath(o.lang, o.slug)}">${esc(o.meta.title)}</a>`).join(' · ')}</p>`
  const main = [
    `<nav aria-label="${esc(t('articlesTitle'))}"><a class="link-btn" href="./">${esc(t('articlesAll'))}</a></nav>`,
    '<article class="flex flex-col gap-2.5">',
    `<p class="kicker">${esc(t(TYPE_KEY[a.meta.type]))}</p>`,
    `<h1>${esc(a.meta.title)}</h1>`,
    `<p class="text-sm text-muted">${dates}</p>`,
    translations,
    `<div class="article-body">\n${a.html}</div>`,
    sources,
    '</article>',
  ].filter((s) => s !== '').join('\n')
  return shell(ctx, { title: a.meta.title, description: a.meta.description, canonical: new URL(articlePath(lang, a.slug), ctx.site).href, head, main })
}

/** A language's list of articles, grouped by type, newest first in each group. */
export function renderIndexPage (articles: readonly Article[], ctx: PageContext): string {
  const { t, lang } = ctx
  const own = articles.filter((a) => a.lang === lang)
  const groups = ARTICLE_TYPES.map((type) => {
    const list = own.filter((a) => a.meta.type === type).sort(byDate)
    if (list.length === 0) return ''
    return [
      `<h2 class="mt-3 text-[1.2rem]">${esc(t(TYPE_KEY[type]))}</h2>`,
      '<ul class="m-0 list-none overflow-hidden rounded-lg border border-line bg-surface p-0 [&>li+li]:border-t [&>li+li]:border-hair">',
      ...list.map((a) => `<li class="px-3.5 py-3"><h3 class="text-[1.05rem]"><a href="./${esc(a.slug)}">${esc(a.meta.title)}</a></h3><p class="text-sm text-muted"><time datetime="${a.meta.date}">${esc(formatDay(a.meta.date, lang))}</time></p><p>${esc(a.meta.description)}</p></li>`),
      '</ul>',
    ].join('\n')
  }).filter((s) => s !== '').join('\n')
  const main = [
    `<h1>${esc(t('articlesTitle'))}</h1>`,
    `<p class="lead">${esc(t('articlesLead'))}</p>`,
    groups,
  ].join('\n')
  return shell(ctx, { title: t('articlesTitle'), description: t('articlesLead'), canonical: new URL(articleFolder(lang), ctx.site).href, head: '', main })
}
