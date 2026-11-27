// SPDX-License-Identifier: AGPL-3.0-or-later
// Not-found pages (ADR 0045): the page the host and the service worker send, with status 404, for an
// address the site does not have. A static page with no script, in the language of its folder, styled
// with the app's stylesheet. Plain TypeScript with no DOM: the build runs it in Node, and so do the
// unit tests.
//
// The page links its stylesheet with a relative URL (rule 6), so it is styled only at the depth it was
// written for. The build writes one copy per folder people reach: the site's root, each language's
// folder and each articles folder. The host and the service worker send the copy of the nearest folder.

import { LANGS, dir, type Lang } from '../i18n/langs.ts'
import { appLink } from '../i18n/url.ts'
import { NOT_FOUND_FILE } from './file.ts'

export { NOT_FOUND_FILE }

export interface NotFoundPage {
  /** Path of the file, relative to the site's folder: `404.html`, `en/404.html`, `en/articles/404.html`. */
  readonly path: string
  readonly lang: Lang
  /** How many folders deep the file sits: `../` this many times reaches the site's folder. */
  readonly depth: number
}

/**
 * Every not-found page of the build: the root (Spanish), the Spanish articles folder, and for every
 * other language its folder and its articles folder, in that language.
 */
export function notFoundPages (): NotFoundPage[] {
  const out: NotFoundPage[] = [
    { path: NOT_FOUND_FILE, lang: 'es', depth: 0 },
    { path: `articles/${NOT_FOUND_FILE}`, lang: 'es', depth: 1 },
  ]
  for (const lang of LANGS) {
    if (lang === 'es') continue
    const seg = lang.toLowerCase()
    out.push({ path: `${seg}/${NOT_FOUND_FILE}`, lang, depth: 1 }, { path: `${seg}/articles/${NOT_FOUND_FILE}`, lang, depth: 2 })
  }
  return out
}

export interface NotFoundInput {
  readonly page: NotFoundPage
  /** App text in the page's language (src/i18n/locales/<lang>.json). */
  readonly t: (key: string) => string
  readonly brand: string
  /** The page's CSP (NOT_FOUND_CSP in scripts/csp.ts), set as a <meta> tag. */
  readonly csp: string
  /** The stylesheet, relative to the site's folder (`assets/app-….css`). The build adds its hash. */
  readonly css: string
}

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

/** The page as complete HTML. It tells search engines not to index it. */
export function renderNotFoundPage ({ page, t, brand, csp, css }: NotFoundInput): string {
  const root = '../'.repeat(page.depth)
  // The start page in the page's language, relative to the page's folder.
  const home = `${root}${appLink(page.lang).slice(2)}` || './'
  return `<!doctype html>
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Not-found page (ADR 0045), written by the build (src/notfound/page.ts). Do not edit. -->
<html lang="${esc(page.lang)}" dir="${dir(page.lang)}">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${esc(csp)}" />
<meta name="referrer" content="no-referrer" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="robots" content="noindex" />
<title>${esc(t('notFoundTitle'))} · ${esc(brand)}</title>
<link rel="icon" href="${root}favicon.ico" sizes="32x32" />
<link rel="icon" type="image/svg+xml" href="${root}icons/favicon.svg" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f8f5ed" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#16120e" />
<link rel="stylesheet" href="${root}${esc(css)}" />
</head>
<body>
<div class="mx-auto flex min-h-dvh max-w-[44rem] flex-col">
<header class="flex min-h-[58px] items-center gap-2 border-b border-hair bg-paper px-3">
<a class="brand flex min-h-11 items-center gap-2 text-lg font-bold tracking-[-0.3px] text-inherit no-underline hover:underline hover:underline-offset-3" href="${esc(home)}"><span class="brand-mark inline-flex h-6 items-center justify-center rounded-sm border-2 border-ink bg-accent px-1.25 font-mono text-xs font-bold text-on-accent" aria-hidden="true">DT.es</span>${esc(brand)}</a>
</header>
<main class="flex flex-col gap-4 px-4 py-8 text-start font-sans text-base leading-normal">
<p class="kicker">404</p>
<h1 class="text-[2rem] font-extrabold tracking-[-1px]">${esc(t('notFoundTitle'))}</h1>
<p class="lead">${esc(t('notFoundLead'))}</p>
<p><a class="button primary" id="not-found-home" href="${esc(home)}">${esc(t('notFoundHome'))}</a></p>
</main>
</div>
</body>
</html>
`
}
