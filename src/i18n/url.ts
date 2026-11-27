// SPDX-License-Identifier: AGPL-3.0-or-later
// One address per language (ADR 0038). The site address is Spanish; every other language is a path
// of its own, `<site>/<tag>` in lowercase, such as `/en` or `/ca-es-valencia`. The host and the
// service worker answer each one with that language's own page, `<tag>.html` (ADR 0044): the same app,
// with the head and start screen in that language. The app still reads the language from the address,
// so any page of the app starts in the right language. There is no trailing slash:
// at `/en` the page's relative URLs (`./assets/…`) still point at the site's own folder (rule 6).
import { LANGS, type Lang } from './langs.ts'

/** The path segment of `lang`: its tag in lowercase. Empty for Spanish, the site address itself. */
export const langSegment = (lang: Lang): string => lang === 'es' ? '' : lang.toLowerCase()

/** Lowercase tag to supported tag. */
const BY_SEGMENT: ReadonlyMap<string, Lang> = new Map(LANGS.map((l) => [l.toLowerCase(), l]))

/**
 * Splits a page address into the app's folder (`base`, ends with `/`) and the rest of its path.
 * At `https://x/en` that is `/` and `en`; under a subpath, `https://x/sub/en` gives `/sub/` and `en`.
 */
export function splitPath (href: string): { base: string; rest: string } {
  const url = new URL(href)
  const base = new URL('./', url).pathname
  const raw = url.pathname.slice(base.length)
  try {
    return { base, rest: decodeURIComponent(raw) }
  } catch {
    return { base, rest: raw }
  }
}

/** The language a path names (`en`, `EN`, `ca-es-valencia`), or null for none or an unknown one. */
export function langFromPath (rest: string): Lang | null {
  return BY_SEGMENT.get(rest.toLowerCase()) ?? null
}

/** The page's language at start: the one in its address, else Spanish. */
export function startLang (href: string): Lang {
  return langFromPath(splitPath(href).rest) ?? 'es'
}

/** The address of the page in `lang`, keeping its query and fragment. */
export function hrefForLang (href: string, lang: Lang): string {
  const url = new URL(href)
  return `${url.origin}${splitPath(href).base}${langSegment(lang)}${url.search}${url.hash}`
}

/** A relative link to the app in `lang`, from a page in the app's folder (rule 6). */
export const appLink = (lang: Lang): string => `./${langSegment(lang)}`
