// SPDX-License-Identifier: AGPL-3.0-or-later
// Plain string dictionaries (spec §4.11), one JSON file per language in ./locales.
// Spanish (es.json) is the source: it defines the keys, and it is part of the start page because a
// key missing from a translation falls back to Spanish. Other files are managed through Crowdin at
// repository level. Each other language is its own file of this build, loaded only when it is the
// page's language (loadLang). The service worker precaches every one, so they also load offline.
// The app never fetches a translation from anywhere else.
import es from './locales/es.json'

export type Key = keyof typeof es
export type Dictionary = Readonly<Record<Key, string>>
type Translation = Readonly<Record<string, string>>

/** BCP 47 tags. `ca-ES-valencia` is the registered tag for Valencian. */
export const LANGS = ['es', 'ca', 'ca-ES-valencia', 'gl', 'eu', 'en', 'fr', 'nl', 'sv', 'fi', 'uk', 'ro', 'ar'] as const
export type Lang = (typeof LANGS)[number]

/** Each language's own name, shown in the selector. */
export const AUTONYMS: Readonly<Record<Lang, string>> = {
  es: 'Español',
  ca: 'Català',
  'ca-ES-valencia': 'Valencià',
  gl: 'Galego',
  eu: 'Euskara',
  en: 'English',
  fr: 'Français',
  nl: 'Nederlands',
  sv: 'Svenska',
  fi: 'Suomi',
  uk: 'Українська',
  ro: 'Română',
  ar: 'العربية',
}

/** Text direction per language. Arabic is Modern Standard Arabic, written right to left. */
export function dir (lang: Lang): 'ltr' | 'rtl' {
  return lang === 'ar' ? 'rtl' : 'ltr'
}

/** The other languages, each loaded on demand (one chunk per file). */
const files = import.meta.glob<Translation>(['./locales/*.json', '!./locales/es.json'], { import: 'default' })

/** Loaded dictionaries. A language that is not loaded (yet) shows Spanish. */
const translations: Partial<Record<Lang, Translation>> = { es }

/** How long the app waits for a dictionary before it goes on in Spanish. */
const LOAD_TIMEOUT_MS = 3000

/**
 * Loads the dictionary of `lang`, once. Call it before showing the page in that language. Never
 * throws: on a failure or after LOAD_TIMEOUT_MS the page shows Spanish, and a later call retries.
 */
export async function loadLang (lang: Lang, timeoutMs = LOAD_TIMEOUT_MS): Promise<void> {
  if (translations[lang] !== undefined) return
  const file = files[`./locales/${lang}.json`]
  if (file === undefined) return
  try {
    const late = new Promise<undefined>((resolve) => { setTimeout(resolve, timeoutMs) })
    const dict = await Promise.race([file(), late])
    if (dict !== undefined) translations[lang] = dict
  } catch {
    // Offline before the file was cached, or a refused file: Spanish stays.
  }
}

/** True when the dictionary of `lang` is in memory. */
export function isLoaded (lang: Lang): boolean {
  return translations[lang] !== undefined
}

export function isLang (tag: string): tag is Lang {
  return (LANGS as readonly string[]).includes(tag)
}

/** Matches browser language tags (navigator.languages) against the supported list. */
export function pickLang (preferred: readonly string[]): Lang {
  for (const raw of preferred) {
    const tag = raw.toLowerCase()
    // Valencian: ca-ES-valencia (BCP 47) or the legacy ca-valencia / val tags.
    if (tag.startsWith('ca') && tag.includes('valencia')) return 'ca-ES-valencia'
    if (tag === 'val' || tag.startsWith('val-')) return 'ca-ES-valencia'
    const base = tag.split('-')[0]
    if (base !== undefined && isLang(base)) return base
  }
  return 'es'
}

export function t (lang: Lang, key: Key): string {
  return translations[lang]?.[key] ?? es[key]
}

/** Translates and fills `{name}` placeholders. Unknown placeholders are left as they are. */
export function tf (lang: Lang, key: Key, vars: Readonly<Record<string, string | number>>): string {
  return t(lang, key).replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name]
    return v === undefined ? whole : String(v)
  })
}

/** Placeholder names used in a string, sorted. For tests and CI. */
export function placeholders (text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort()
}

/**
 * Keys of `es` that a translation lacks, and keys it has that `es` does not. For tests and CI: load
 * the language first (loadLang), or every key counts as missing.
 */
export function diffKeys (lang: Lang): { missing: Key[]; extra: string[] } {
  const own = Object.keys(translations[lang] ?? {})
  const src = Object.keys(es) as Key[]
  return { missing: src.filter((k) => !own.includes(k)), extra: own.filter((k) => !(k in es)) }
}
