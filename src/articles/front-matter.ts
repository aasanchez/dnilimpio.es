// SPDX-License-Identifier: AGPL-3.0-or-later
// The front matter of an article (ADR 0039): a short, fixed list of keys between two `---` lines at
// the top of the Markdown file. Our own small parser, not a YAML library: one `key: value` per line,
// lists as `[a, b]`. An unknown key, a missing key or a bad value stops the build with the file name,
// so a mistake never reaches the site.

import { SOURCES, type SourceId } from '../guide/sources.ts'
import { SLUG_RE } from './paths.ts'

export const ARTICLE_TYPES = ['news', 'guide', 'info'] as const
export type ArticleType = (typeof ARTICLE_TYPES)[number]

export interface FrontMatter {
  readonly title: string
  readonly description: string
  readonly type: ArticleType
  /** Publication day, YYYY-MM-DD. The article is left out of builds made before that day. */
  readonly date: string
  /** Day of the last real change, YYYY-MM-DD, not before `date`. */
  readonly updated?: string
  /** Slug of the Spanish article this one translates. Links the two with hreflang. */
  readonly translationOf?: string
  /** Left out of every build. */
  readonly draft: boolean
  /**
   * Sources cited by the article (ids of src/guide/sources.ts). Required for a guide, because a guide
   * states facts about the documents (rule 9).
   */
  readonly sources: readonly SourceId[]
}

/** Longest title and description that search results show in full. */
export const MAX_TITLE = 70
export const MAX_DESCRIPTION = 160

const KEYS = ['title', 'description', 'type', 'date', 'updated', 'translationOf', 'draft', 'sources'] as const
type Key = (typeof KEYS)[number]

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Whether `s` is a real calendar day written as YYYY-MM-DD. */
export function isDay (s: string): boolean {
  if (!DAY_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

const isSourceId = (s: string): s is SourceId => Object.hasOwn(SOURCES, s)

function unquote (v: string): string {
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v
}

/**
 * Splits a Markdown file into its front matter and its body, and checks every value.
 * `file` names the file in error messages. `spanish` is true for an article in the Spanish folder.
 */
export function parseArticle (text: string, file: string, spanish: boolean): { meta: FrontMatter; body: string } {
  const fail = (why: string): never => { throw new Error(`${file}: ${why}`) }
  const src = text.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')
  if (!src.startsWith('---\n')) fail('must start with a --- line and the front matter')
  const end = src.indexOf('\n---\n', 3)
  if (end === -1) fail('front matter has no closing --- line')
  const raw: Partial<Record<Key, string>> = {}
  for (const line of src.slice(4, end).split('\n')) {
    if (line.trim() === '') continue
    const m = /^([A-Za-z]+):\s*(.*)$/.exec(line)
    if (m === null) fail(`front matter line is not "key: value": ${line}`)
    const key = m?.[1] ?? ''
    if (!(KEYS as readonly string[]).includes(key)) fail(`unknown front matter key "${key}"`)
    if (Object.hasOwn(raw, key)) fail(`front matter key "${key}" appears twice`)
    raw[key as Key] = unquote((m?.[2] ?? '').trim())
  }
  const need = (k: Key): string => {
    const v = raw[k]
    if (v === undefined || v === '') return fail(`front matter needs "${k}"`)
    return v
  }

  const title = need('title')
  if (title.length > MAX_TITLE) fail(`title is longer than ${String(MAX_TITLE)} characters`)
  const description = need('description')
  if (description.length > MAX_DESCRIPTION) fail(`description is longer than ${String(MAX_DESCRIPTION)} characters`)
  const type = need('type')
  if (!(ARTICLE_TYPES as readonly string[]).includes(type)) fail(`type must be one of ${ARTICLE_TYPES.join(', ')}`)
  const date = need('date')
  if (!isDay(date)) fail('date must be a real day written as YYYY-MM-DD')
  const updated = raw.updated
  if (updated !== undefined && (!isDay(updated) || updated < date)) fail('updated must be a day, YYYY-MM-DD, not before date')
  const translationOf = raw.translationOf
  if (translationOf !== undefined) {
    if (spanish) fail('translationOf is for translations; a Spanish article is the original')
    if (!SLUG_RE.test(translationOf)) fail('translationOf must be the slug of a Spanish article')
  }
  const draft = raw.draft ?? 'false'
  if (draft !== 'true' && draft !== 'false') fail('draft must be true or false')

  let sources: SourceId[] = []
  if (raw.sources !== undefined) {
    const list = /^\[(.*)\]$/.exec(raw.sources)
    if (list === null) fail('sources must be a list: [id, id]')
    const ids = (list?.[1] ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '')
    for (const id of ids) if (!isSourceId(id)) fail(`unknown source "${id}" (see src/guide/sources.ts)`)
    if (new Set(ids).size !== ids.length) fail('a source is listed twice')
    sources = ids as SourceId[]
  }
  if (type === 'guide' && sources.length === 0) fail('a guide must cite its sources (rule 9)')

  const meta: FrontMatter = {
    title,
    description,
    type: type as ArticleType,
    date,
    draft: draft === 'true',
    sources,
    ...(updated === undefined ? {} : { updated }),
    ...(translationOf === undefined ? {} : { translationOf }),
  }
  return { meta, body: src.slice(end + 5) }
}
