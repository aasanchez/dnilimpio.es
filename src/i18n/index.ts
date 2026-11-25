// SPDX-License-Identifier: AGPL-3.0-or-later
// Plain string dictionaries (spec §4.11), one JSON file per language in ./locales.
// Spanish (es.json) is the source: it defines the keys. Other files are managed through Crowdin
// at repository level; every language is bundled at build time, so the app never fetches anything.
// A key missing from a translation falls back to Spanish.
import es from './locales/es.json'
import en from './locales/en.json'
import ca from './locales/ca.json'
import caValencia from './locales/ca-ES-valencia.json'
import gl from './locales/gl.json'
import eu from './locales/eu.json'
import fr from './locales/fr.json'
import nl from './locales/nl.json'
import sv from './locales/sv.json'
import fi from './locales/fi.json'
import uk from './locales/uk.json'
import ar from './locales/ar.json'
import ro from './locales/ro.json'

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

const translations: Readonly<Record<Lang, Translation>> = { es, en, ca, 'ca-ES-valencia': caValencia, gl, eu, fr, nl, sv, fi, uk, ro, ar }

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
  return translations[lang][key] ?? es[key]
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

/** Keys of `es` that a translation lacks, and keys it has that `es` does not. For tests and CI. */
export function diffKeys (lang: Lang): { missing: Key[]; extra: string[] } {
  const own = Object.keys(translations[lang])
  const src = Object.keys(es) as Key[]
  return { missing: src.filter((k) => !own.includes(k)), extra: own.filter((k) => !(k in es)) }
}
