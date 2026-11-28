// SPDX-License-Identifier: AGPL-3.0-or-later
// Articles (ADR 0039): news, guides and information written in Markdown in content/articles/, one
// folder per language (`es`, `en`, `ca-es-valencia`, …). The build turns each file into a static page
// with no script (src/articles/page.ts) and writes each language's list of articles. Publishing an
// article is merging its file: the next deploy from master builds it.
//
// An article is left out while it is a draft, or before the day in its `date` (the build's day,
// BUILD_TIME, so a rebuild of the same commit gives the same files). A language with no published
// article gets no list and no link in the app.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, normalize, relative, sep } from 'node:path'
import type { Plugin } from 'vite'
import { ARTICLE_CSP } from './csp.ts'
import { renderMarkdown } from './article-markdown.ts'
import { appStylesheet } from './guide-pages.ts'
import { parseArticle, type FrontMatter } from '../src/articles/front-matter.ts'
import { renderArticlePage, renderIndexPage, alternatesOf, type Article } from '../src/articles/page.ts'
import { ARTICLE_ASSETS, SLUG_RE, articleDepth, articleFolder, articleIndexFile, articlePath } from '../src/articles/paths.ts'
import { LANGS, type Lang } from '../src/i18n/langs.ts'
import { langFromPath } from '../src/i18n/url.ts'
import { BRAND, type SitemapUrl } from '../src/seo/site.ts'

/** Where the Markdown lives, from the repository root. */
export const CONTENT_DIR = 'content/articles'

/** Image types an article may show. No SVG: it is a document that can carry code. */
export const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif'])

/** A Markdown file read from disk, not yet turned into HTML. */
export interface Source {
  readonly lang: Lang
  readonly slug: string
  readonly meta: FrontMatter
  readonly body: string
  /** The file, for error messages and to find its images. */
  readonly file: string
  readonly group: string
}

/** The UTC day of a time in milliseconds, YYYY-MM-DD. */
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/**
 * Every published article under `dir`, checked. Throws on a file or folder that does not belong
 * there, a bad slug, bad front matter, or a translation of a Spanish article that does not exist.
 * `today` (YYYY-MM-DD): articles dated after it are left out.
 */
export function loadArticles (dir: string, today: string): Source[] {
  if (!existsSync(dir)) return []
  const all: Array<Source & { readonly published: boolean }> = []
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry)
    if (!statSync(path).isDirectory()) {
      if (entry === 'README.md') continue
      throw new Error(`${path}: only language folders belong in ${dir}`)
    }
    const lang = langFromPath(entry)
    if (lang === null || entry !== entry.toLowerCase()) throw new Error(`${path}: not a language folder (use the lowercase tag, such as es, en or ca-es-valencia)`)
    for (const name of readdirSync(path).sort()) {
      const file = join(path, name)
      const ext = extname(name).toLowerCase()
      if (IMAGE_TYPES.has(ext)) continue
      if (ext !== '.md') throw new Error(`${file}: an articles folder holds Markdown files (.md) and their images (${[...IMAGE_TYPES].join(', ')})`)
      const slug = name.slice(0, -3)
      if (!SLUG_RE.test(slug)) throw new Error(`${file}: the file name is the address; use lowercase letters, digits and single hyphens`)
      const { meta, body } = parseArticle(readFileSync(file, 'utf8'), file, lang === 'es')
      const group = lang === 'es' ? slug : meta.translationOf ?? `${lang}/${slug}`
      all.push({ lang, slug, meta, body, file, group, published: !meta.draft && meta.date <= today })
    }
  }
  for (const a of all) {
    if (a.meta.translationOf !== undefined && !all.some((o) => o.lang === 'es' && o.slug === a.meta.translationOf)) {
      throw new Error(`${a.file}: translationOf names content/articles/es/${a.meta.translationOf}.md, which does not exist`)
    }
    if (all.some((o) => o !== a && o.lang === a.lang && o.group === a.group)) throw new Error(`${a.file}: two articles in one language translate the same article`)
  }
  return all.filter((a) => a.published).map(({ published: _, ...a }) => a)
}

/** Languages with at least one published article, in the order of LANGS. */
export const articleLangs = (articles: readonly Source[]): Lang[] => LANGS.filter((l) => articles.some((a) => a.lang === l))

/** Sitemap entries: each language's list, then each article with its translations as alternates. */
export function articleSitemap (site: string, articles: readonly Source[]): SitemapUrl[] {
  const lists = articleLangs(articles).map((l) => ({ loc: new URL(articleFolder(l), site).href }))
  const pages = articles.map((a) => ({
    loc: new URL(articlePath(a.lang, a.slug), site).href,
    lastmod: a.meta.updated ?? a.meta.date,
    alternates: alternatesOf(a, articles).map((o) => ({ hreflang: o.lang, href: new URL(articlePath(o.lang, o.article.slug), site).href })),
  }))
  return [...lists, ...pages]
}

/** The address of an image an article shows, copied into the build under assets/articles/. */
export function imageFileName (name: string, bytes: Uint8Array): string {
  const ext = extname(name).toLowerCase()
  const base = name.slice(0, -ext.length).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image'
  return `${ARTICLE_ASSETS}${base}-${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}${ext}`
}

const readJson = (path: string): Record<string, string> => JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>

/**
 * The build step. `root`: the repository. `articles`: from loadArticles(), read once in vite.config.ts,
 * which also needs the languages for the app's link. `site`: SITE_URL, for canonical addresses.
 */
export function articles (root: string, site: string, list: readonly Source[]): Plugin {
  return {
    name: 'dni-redactor:articles',
    apply: 'build',
    generateBundle (_options, bundle) {
      if (list.length === 0) return
      const css = appStylesheet(bundle).fileName
      const images = new Map<string, string>()
      const built: Article[] = list.map((a) => {
        const folder = join(root, CONTENT_DIR, a.lang.toLowerCase())
        const html = renderMarkdown(a.body, {
          file: a.file,
          image: (src) => {
            const path = normalize(join(folder, src))
            if (relative(folder, path).split(sep).includes('..') || !IMAGE_TYPES.has(extname(path).toLowerCase()) || !existsSync(path)) {
              throw new Error(`${a.file}: image ${src} must be a ${[...IMAGE_TYPES].join(', ')} file in the same folder`)
            }
            let fileName = images.get(path)
            if (fileName === undefined) {
              const bytes = readFileSync(path)
              fileName = imageFileName(src.split('/').at(-1) ?? src, bytes)
              this.emitFile({ type: 'asset', fileName, source: bytes })
              images.set(path, fileName)
            }
            return `${'../'.repeat(articleDepth(a.lang))}${fileName}`
          },
        })
        return { lang: a.lang, slug: a.slug, meta: a.meta, html, group: a.group }
      })
      for (const lang of articleLangs(list)) {
        const dict = readJson(join(root, 'src/i18n/locales', `${lang}.json`))
        const t = (key: string): string => {
          const v = dict[key]
          if (v === undefined || v === '') throw new Error(`src/i18n/locales/${lang}.json: no text for "${key}"`)
          return v
        }
        const ctx = { lang, t, brand: BRAND, csp: ARTICLE_CSP, css, site }
        this.emitFile({ type: 'asset', fileName: articleIndexFile(lang), source: renderIndexPage(built, ctx) })
        for (const a of built.filter((x) => x.lang === lang)) {
          this.emitFile({ type: 'asset', fileName: articlePath(lang, a.slug), source: renderArticlePage(a, built, ctx) })
        }
      }
    },
  }
}
