// SPDX-License-Identifier: AGPL-3.0-or-later
// Addresses of the articles (ADR 0039). Spanish articles are at `articles/<slug>`, the others at
// `<tag>/articles/<slug>`, with the language tag in lowercase like the app's own addresses
// (src/i18n/url.ts, ADR 0038). Each language's list is at `<folder>/` and is the file
// `<folder>/index.html`. An article is a file with no extension; the host sends it as HTML
// (scripts/headers.ts). Paths here are relative to the site's folder, with no leading slash (rule 6).
//
// No runtime import: the service worker uses this module (src/offline/precache.ts), and its script
// may share no code with the app's (scripts/vite-plugins.ts). So a folder is recognised by its shape,
// a language tag or nothing, then `articles/`; the host has a file only where an article exists.

import type { Lang } from '../i18n/langs.ts'

/** A slug: lowercase letters and digits in groups joined by single hyphens. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The name of the list page inside a language's articles folder. Not a valid slug. */
export const INDEX_FILE = 'index.html'

/** Where the build puts the images of the articles. Saved on first use, not at install. */
export const ARTICLE_ASSETS = 'assets/articles/'

/** The articles folder of `lang`, with a trailing slash: `articles/`, `en/articles/`. */
export const articleFolder = (lang: Lang): string => lang === 'es' ? 'articles/' : `${lang.toLowerCase()}/articles/`

/** The path of one article. */
export const articlePath = (lang: Lang, slug: string): string => `${articleFolder(lang)}${slug}`

/** The file of a language's list of articles. */
export const articleIndexFile = (lang: Lang): string => `${articleFolder(lang)}${INDEX_FILE}`

/** How many folders deep an article of `lang` sits: `../` this many times reaches the site's folder. */
export const articleDepth = (lang: Lang): number => articleFolder(lang).split('/').length - 1

/** An articles folder: `articles/`, or a lowercase language tag and `articles/`. */
const FOLDER_RE = /^(?:[a-z]{2,3}(?:-[a-z0-9]+)*\/)?articles\/$/

/** The articles folder `path` starts with, or null. */
function folderOf (path: string): string | null {
  const i = path.indexOf('articles/')
  if (i === -1) return null
  const folder = path.slice(0, i + 'articles/'.length)
  return FOLDER_RE.test(folder) ? folder : null
}

/** Whether `path` (relative to the site's folder) is a built article or a list of articles. */
export function isArticlePage (path: string): boolean {
  const folder = folderOf(path)
  if (folder === null) return false
  const name = path.slice(folder.length)
  return name === INDEX_FILE || SLUG_RE.test(name)
}

/** Whether `path` is a file of the articles: a page or one of their images. */
export const isArticleFile = (path: string): boolean => isArticlePage(path) || path.startsWith(ARTICLE_ASSETS)

/**
 * A page load inside the site's folder (`rest`, the path after it), as the host answers it:
 * `articles/` gives that language's list file, `articles` (no slash) a redirect to `articles/`,
 * anything else in an articles folder the file of that name. Null when `rest` is not in an articles folder.
 */
export function articleRoute (rest: string): { readonly file: string } | { readonly redirect: string } | null {
  if (FOLDER_RE.test(`${rest}/`)) return { redirect: `${rest}/` }
  if (FOLDER_RE.test(rest)) return { file: `${rest}${INDEX_FILE}` }
  return isArticlePage(rest) ? { file: rest } : null
}
