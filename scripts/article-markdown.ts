// SPDX-License-Identifier: AGPL-3.0-or-later
// Markdown to HTML for the articles (ADR 0039), at build time only. `marked` is a dev dependency: none
// of it reaches the browser. The output must fit the article pages' CSP, which runs no script, so the
// rules here are strict and stop the build instead of guessing:
// - raw HTML in the Markdown is refused (no <script>, no style attribute, no event handler);
// - a `#` heading is refused: the page's title is its only <h1>;
// - a link is relative (rule 6), a fragment, or an absolute https, http or mailto address. A link that
//   leaves the site opens in a new tab and sends no referrer;
// - an image is a local file next to the article. The caller copies it into the build and gives its
//   new address (`image`).

import { Marked, type Tokens } from 'marked'

export interface MarkdownOptions {
  /** Names the file in error messages. */
  readonly file: string
  /** The address to use for a local image (`src` as written), relative to the page. */
  readonly image: (src: string) => string
}

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

/** A link that leaves the site. */
const EXTERNAL = /^(https?:\/\/|mailto:)/i

/** What kind of link `href` is, or a reason to refuse it. */
export function checkLink (href: string): 'external' | 'internal' | { refused: string } {
  if (EXTERNAL.test(href)) return 'external'
  if (href.startsWith('//')) return { refused: 'a protocol-relative link (//) leaves the site without saying how' }
  if (href.startsWith('/')) return { refused: 'a root-absolute link breaks under a subpath (rule 6); use a relative one' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { refused: `links of this kind are not allowed: ${href}` }
  if (href === '') return { refused: 'an empty link' }
  return 'internal'
}

/** The article's body as HTML. Throws with the file name on anything the rules refuse. */
export function renderMarkdown (markdown: string, opts: MarkdownOptions): string {
  // marked rewrites the message of an error thrown inside it, so the first problem is kept here and
  // thrown after the run.
  const found: { problem: string | null } = { problem: null }
  const fail = (why: string): string => { found.problem ??= why; return '' }
  const marked = new Marked({ gfm: true, async: false })
  marked.use({
    walkTokens (token) {
      if (token.type === 'html') fail(`raw HTML is not allowed in an article: ${token.raw.trim().slice(0, 60)}`)
      if (token.type === 'heading' && (token as Tokens.Heading).depth === 1) fail('use ## for headings: the title is the page\'s only # heading')
      if (token.type === 'image') {
        const img = token as Tokens.Image
        if (checkLink(img.href) !== 'internal' || img.href.startsWith('#')) fail(`an image must be a file next to the article: ${img.href}`)
        else img.href = opts.image(img.href)
      }
    },
    renderer: {
      link ({ href, title, tokens }) {
        const kind = checkLink(href)
        if (typeof kind === 'object') return fail(kind.refused)
        const text = this.parser.parseInline(tokens)
        const t = title === null || title === undefined ? '' : ` title="${esc(title)}"`
        const away = kind === 'external' ? ' target="_blank" rel="noopener noreferrer"' : ''
        return `<a href="${esc(href)}"${t}${away}>${text}</a>`
      },
      image ({ href, title, text }) {
        if (text.trim() === '') fail(`an image needs a description in [ ]: ${href}`)
        const t = title == null ? '' : ` title="${esc(title)}"`
        return `<img src="${esc(href)}" alt="${esc(text)}"${t} loading="lazy" />`
      },
    },
  })
  const html = marked.parse(markdown) as string
  if (found.problem !== null) throw new Error(`${opts.file}: ${found.problem}`)
  return html
}
